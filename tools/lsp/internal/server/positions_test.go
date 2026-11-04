package server

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// TestClosedURIUsesDeepestFolder: a closed file under nested workspace folders
// is spelled through the deepest one, whatever order the folders come in.
func TestClosedURIUsesDeepestFolder(t *testing.T) {
	outer := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outer, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	inner := filepath.Join(t.TempDir(), "link") // the inner folder, opened through a symlink
	if err := os.Symlink(filepath.Join(outer, "sub"), inner); err != nil {
		t.Skipf("no symlinks: %v", err)
	}
	file := canonical(filepath.Join(outer, "sub", "a.twf"))
	want := pathToURI(filepath.ToSlash(inner) + "/a.twf")
	for _, folders := range [][]string{{outer, inner}, {inner, outer}} {
		store := NewDocumentStore()
		store.SetFolders(folders)
		if got := newSources(store, "").closedURI(file); got != want {
			t.Errorf("folders %v: closedURI = %s, want %s", folders, got, want)
		}
	}
}

// TestDiagnosticsCountUTF16: a diagnostic starts at its UTF-16 column and runs
// to the end of its line, however much wider the text before it is in bytes.
func TestDiagnosticsCountUTF16(t *testing.T) {
	tests := []struct {
		name, src, msg string
		want           protocol.Range
	}{
		{"parse error after é", "workflow W():\n\tif (\"é\") junk:\n\t\tclose complete\n", "junk", lineSpan(1, 13, 18)},
		{"parse error after a surrogate pair", "workflow W():\n\tif (\"😀\") junk:\n\t\tclose complete\n", "junk", lineSpan(1, 14, 19)},
		{"parse error at the end of a line after é", "workflow W(x: \"é\")\n\tclose complete\n", "requires ':'", lineSpan(0, 18, 18)},
		{"resolve error on a line with é and a surrogate pair", "workflow W():\n\tactivity Missing(note: \"é😀\")\n\tclose complete\n", "undefined activity", lineSpan(1, 13, 33)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := NewDocumentStore().Open("untitled:Untitled-1", tt.src)
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

// lineSpan is the range from start to end on one line.
func lineSpan(line, start, end uint32) protocol.Range {
	return protocol.Range{Start: protocol.Position{Line: line, Character: start}, End: protocol.Position{Line: line, Character: end}}
}

// TestCodeActionMatchesUTF16DiagnosticLine: the range of a published
// diagnostic, on a line wider in bytes than in UTF-16, finds its fix. Matching
// is by line, so this pins the line, not the columns.
func TestCodeActionMatchesUTF16DiagnosticLine(t *testing.T) {
	src := "workflow W():\n\tactivity Missing(note: \"é😀\")\n\tclose complete\n"
	store := NewDocumentStore()
	doc := store.Open(renameURI, src)
	for _, d := range diagnostics(doc) {
		if !strings.Contains(d.Message, "undefined activity") {
			continue
		}
		got, err := codeActionHandler(store)(nil, &protocol.CodeActionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
			Range:        d.Range,
			Context:      protocol.CodeActionContext{Diagnostics: []protocol.Diagnostic{d}},
		})
		if err != nil {
			t.Fatal(err)
		}
		for _, a := range got.([]any) {
			if a.(protocol.CodeAction).Title == "Add missing activity 'Missing'" {
				return
			}
		}
		t.Fatalf("no fix for %+v: %+v", d, got)
	}
	t.Fatal("no undefined-activity diagnostic")
}

// semToken is one decoded semantic token, in absolute UTF-16 coordinates.
type semToken struct{ line, char, length, typ uint32 }

func decodeSemanticTokens(data []uint32) []semToken {
	var out []semToken
	var line, char uint32
	for i := 0; i+4 < len(data); i += 5 {
		if data[i] > 0 {
			char = 0
		}
		line += data[i]
		char += data[i+1]
		out = append(out, semToken{line, char, data[i+2], data[i+3]})
	}
	return out
}

// TestSemanticTokensCountUTF16: a token after non-ASCII text starts at its
// UTF-16 column, a string is as long as its UTF-16 text, and no token runs past
// the end of its line: an argument list over two lines is two tokens.
func TestSemanticTokensCountUTF16(t *testing.T) {
	src := "workflow W():\n" +
		"\tx = \"é😀\" + y  # ü😀 note\n" +
		"\tactivity Do(a, \"é\",\n" +
		"\t\t\"😀\")\n" +
		"\tclose complete\n"
	toks := decodeSemanticTokens(buildSemanticTokens(src))
	lines := strings.Split(src, "\n")
	for _, tok := range toks {
		if end := utf16Len(lines[tok.line]); tok.char+tok.length > end {
			t.Errorf("token %+v runs past the end of line %d (%d units)", tok, tok.line, end)
		}
	}
	for _, want := range []semToken{
		{1, 8, 5, semString},     // "é😀"
		{1, 16, 1, semVariable},  // y
		{1, 19, 10, semComment},  // # ü😀 note
		{2, 15, 8, semParameter}, // (a, "é",
		{3, 0, 13, semParameter}, //         "😀")
	} {
		if !slices.Contains(toks, want) {
			t.Errorf("no token %+v in %+v", want, toks)
		}
	}
}

// TestDocumentSymbolsSelectNames: every symbol's selection range spells its
// name, in UTF-16, inside the symbol's range, on lines holding non-ASCII text.
func TestDocumentSymbolsSelectNames(t *testing.T) {
	src := strings.NewReplacer(
		"(wid: string)", `(wid: string, note: "é😀")`,
		"close complete()", `close complete("é😀")  # ü`,
	).Replace(everyKindSource)
	store := NewDocumentStore()
	store.Open(renameURI, src)
	got, err := documentSymbolHandler(store)(nil, &protocol.DocumentSymbolParams{TextDocument: protocol.TextDocumentIdentifier{URI: renameURI}})
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	var check func(syms []protocol.DocumentSymbol)
	check = func(syms []protocol.DocumentSymbol) {
		for _, s := range syms {
			count++
			sel := s.SelectionRange
			if name := src[offsetOf(t, src, sel.Start):offsetOf(t, src, sel.End)]; name != s.Name {
				t.Errorf("symbol %s selects %q", s.Name, name)
			}
			if !within(sel, s.Range) {
				t.Errorf("symbol %s: selection %+v is outside its range %+v", s.Name, sel, s.Range)
			}
			check(s.Children)
		}
	}
	check(got.([]protocol.DocumentSymbol))
	if count < 20 {
		t.Errorf("checked %d symbols, want every one in everyKindSource", count)
	}
}

// within reports whether inner lies inside outer.
func within(inner, outer protocol.Range) bool {
	before := func(a, b protocol.Position) bool {
		return a.Line < b.Line || (a.Line == b.Line && a.Character <= b.Character)
	}
	return before(outer.Start, inner.Start) && before(inner.End, outer.End)
}
