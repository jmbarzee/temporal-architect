package server

import (
	"regexp"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// crlf is src with every line ending `\r\n`.
func crlf(src string) string { return strings.ReplaceAll(src, "\n", "\r\n") }

// bareLF matches a `\n` with no `\r` before it.
var bareLF = regexp.MustCompile(`(^|[^\r])\n`)

// TestAddMissingDefinitionKeepsCRLF: on a CRLF buffer the stub's lines end in
// `\r\n`, and the result parses and resolves the call.
func TestAddMissingDefinitionKeepsCRLF(t *testing.T) {
	src := crlf("workflow W():\n    workflow Missing(x)\n    close complete\n")
	at := protocol.Position{Line: 1, Character: 4}
	actions := codeActions(t, src, protocol.Range{Start: at, End: at}, "Add missing workflow 'Missing'")
	if len(actions) != 1 {
		t.Fatalf("want one action, got %+v", actions)
	}
	got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
	if bareLF.MatchString(got) {
		t.Errorf("stub has a bare \\n:\n%q", got)
	}
	if doc := NewDocumentStore().Open(renameURI, got); len(doc.ParseErrs)+len(doc.ResolveErrs) > 0 {
		t.Errorf("result is not clean: %v %v\n%q", doc.ParseErrs, doc.ResolveErrs, got)
	}
}

// TestConvertReturnToCloseKeepsCRLF: the rewrite on a CRLF line replaces the
// statement and keeps its `\r\n`.
func TestConvertReturnToCloseKeepsCRLF(t *testing.T) {
	const head = "workflow W() -> (Result):\n"
	const tail = "\n    activity Do(x)\n\nactivity Do(x: string):\n    do(x)\n"
	src := crlf(head + "    return x  # done" + tail)
	at := protocol.Position{Line: 1, Character: 6}
	actions := codeActions(t, src, protocol.Range{Start: at, End: at}, "Convert 'return' to 'close complete'")
	if len(actions) != 1 {
		t.Fatalf("want one action, got %+v", actions)
	}
	got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
	if want := crlf(head + "    close complete(x)  # done" + tail); got != want {
		t.Errorf("result:\n%q\nwant:\n%q", got, want)
	}
}

// crlfSource names Child as a call, a definition and a worker entry, each on a
// CRLF line.
var crlfSource = crlf(`workflow Parent(wid: string):
    workflow Child(wid)
    close complete()

workflow Child(wid: string):
    close complete()

worker W:
    workflow Parent
    workflow Child
`)

// TestNameRangesOnCRLF: rename, references and definition cover exactly the
// name on CRLF lines, and the rename keeps every `\r\n`.
func TestNameRangesOnCRLF(t *testing.T) {
	store := NewDocumentStore()
	store.Open(renameURI, crlfSource)
	at := protocol.TextDocumentPositionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
		Position:     protocol.Position{Line: 1, Character: 13}, // `Child` in the call
	}

	refs, err := referencesHandler(store)(nil, &protocol.ReferenceParams{
		TextDocumentPositionParams: at,
		Context:                    protocol.ReferenceContext{IncludeDeclaration: true},
	})
	if err != nil || len(refs) != 3 {
		t.Fatalf("references = %+v, %v; want 3", refs, err)
	}
	for _, r := range refs {
		if got := spelled(crlfSource, r.Range); got != "Child" {
			t.Errorf("reference at %+v spells %q", r.Range, got)
		}
	}

	def, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
	if err != nil {
		t.Fatal(err)
	}
	if loc, ok := def.(protocol.Location); !ok || spelled(crlfSource, loc.Range) != "Child" || loc.Range.Start.Line != 4 {
		t.Errorf("definition = %+v", def)
	}

	edit, err := renameAt(store, renameURI, at.Position, "Kid")
	if err != nil || edit == nil {
		t.Fatalf("rename: edit=%v err=%v", edit, err)
	}
	if got, want := applyEdits(t, crlfSource, edit.Changes[renameURI]), strings.ReplaceAll(crlfSource, "Child", "Kid"); got != want {
		t.Errorf("renamed:\n%q\nwant:\n%q", got, want)
	}
}

// TestDiagnosticsOnCRLF: a diagnostic on a CRLF line ends before the `\r`.
func TestDiagnosticsOnCRLF(t *testing.T) {
	tests := []struct {
		name, src, msg string
		want           protocol.Range
	}{
		{"parse error", crlf("workflow W():\n    if (x) junk:\n        close complete\n"), "junk", lineSpan(1, 11, 16)},
		{"resolve error", crlf("workflow W():\n    activity Missing(x)\n    close complete\n"), "undefined activity", lineSpan(1, 13, 23)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := NewDocumentStore().Open(renameURI, tt.src)
			var got []protocol.Range
			for _, d := range diagnostics(doc) {
				if strings.Contains(d.Message, tt.msg) {
					got = append(got, d.Range)
				}
			}
			if len(got) != 1 || got[0] != tt.want {
				t.Errorf("diagnostic %q ranges = %+v, want [%+v] (all: %+v)", tt.msg, got, tt.want, diagnostics(doc))
			}
		})
	}
}
