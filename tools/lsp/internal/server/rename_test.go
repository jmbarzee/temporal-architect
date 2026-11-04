package server

import (
	"regexp"
	"sort"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

const renameURI = "file:///rename.twf"

// renameSource references Child as a call, a send head, a definition, and a
// worker entry — each a line where the name follows a keyword.
const renameSource = `workflow Parent(wid: string):
    workflow Child(wid)
    signal Child.Go()
        id: wid

workflow Child(wid: string):
    signal Go():
        done = true
    activity Do(wid)

activity Do(wid: string):
    do(wid)

worker W:
    workflow Parent
    workflow Child
    activity Do
`

// applyEdits applies text edits to content, last edit first.
func applyEdits(t *testing.T, content string, edits []protocol.TextEdit) string {
	t.Helper()
	sort.Slice(edits, func(i, j int) bool {
		a, b := edits[i].Range.Start, edits[j].Range.Start
		return a.Line > b.Line || (a.Line == b.Line && a.Character > b.Character)
	})
	for _, e := range edits {
		content = content[:offsetOf(t, content, e.Range.Start)] + e.NewText + content[offsetOf(t, content, e.Range.End):]
	}
	return content
}

// offsetOf is the byte offset in content of an LSP position, whose character
// counts UTF-16 code units.
func offsetOf(t *testing.T, content string, p protocol.Position) int {
	t.Helper()
	lines := strings.SplitAfter(content, "\n")
	if int(p.Line) >= len(lines) {
		t.Fatalf("position %+v is past the last line", p)
	}
	off := 0
	for _, l := range lines[:p.Line] {
		off += len(l)
	}
	units := uint32(0)
	for i, r := range strings.TrimSuffix(lines[p.Line], "\n") {
		if units == p.Character {
			return off + i
		}
		units += utf16Len(string(r))
	}
	if units != p.Character {
		t.Fatalf("position %+v is not a character boundary of %q", p, lines[p.Line])
	}
	return off + len(strings.TrimSuffix(lines[p.Line], "\n"))
}

func TestRenameRewritesNameNotKeyword(t *testing.T) {
	store := NewDocumentStore()
	store.Open(renameURI, renameSource)

	// Rename from the send head on line 3.
	edit, err := renameHandler(store)(nil, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
			Position:     protocol.Position{Line: 2, Character: 12},
		},
		NewName: "Kid",
	})
	if err != nil || edit == nil {
		t.Fatalf("rename: edit=%v err=%v", edit, err)
	}

	renamed := applyEdits(t, renameSource, edit.Changes[renameURI])
	if regexp.MustCompile(`\bChild\b`).MatchString(renamed) {
		t.Errorf("old name survives the rename:\n%s", renamed)
	}
	if got := strings.Count(renamed, "Kid"); got != 4 {
		t.Errorf("want 4 occurrences of Kid, got %d:\n%s", got, renamed)
	}

	doc := store.Open(renameURI, renamed)
	if len(doc.ParseErrs) > 0 || len(doc.ResolveErrs) > 0 {
		t.Errorf("renamed source does not re-parse cleanly: parse=%v resolve=%v\n%s",
			doc.ParseErrs, doc.ResolveErrs, renamed)
	}
}

func TestSignalSendHeadDefinitionAndHover(t *testing.T) {
	store := NewDocumentStore()
	store.Open(renameURI, renameSource)
	at := protocol.TextDocumentPositionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
		Position:     protocol.Position{Line: 2, Character: 12},
	}

	got, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
	if err != nil {
		t.Fatalf("definition: %v", err)
	}
	loc, ok := got.(protocol.Location)
	if !ok {
		t.Fatalf("definition on a send head: want a Location, got %#v", got)
	}
	want := protocol.Range{
		Start: protocol.Position{Line: 5, Character: 9},
		End:   protocol.Position{Line: 5, Character: 14},
	}
	if loc.Range != want {
		t.Errorf("definition range = %+v, want the name Child in `workflow Child(` %+v", loc.Range, want)
	}

	hover, err := hoverHandler(store)(nil, &protocol.HoverParams{TextDocumentPositionParams: at})
	if err != nil || hover == nil {
		t.Fatalf("hover on a send head: hover=%v err=%v", hover, err)
	}
	if v := hover.Contents.(protocol.MarkupContent).Value; !strings.Contains(v, "workflow Child(wid: string)") {
		t.Errorf("hover = %q, want the target workflow's signature", v)
	}
}
