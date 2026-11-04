package server

import (
	"slices"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// tabbed re-indents src, indented with four spaces per level, with one tab per level.
func tabbed(src string) string {
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, " ")
		lines[i] = strings.Repeat("\t", (len(line)-len(body))/4) + body
	}
	return strings.Join(lines, "\n")
}

// A tab is one UTF-16 column: on a tab-indented file, diagnostics start at
// their token, and mixed indentation is a LEX diagnostic at the offending tab.
func TestDiagnosticsOnTabs(t *testing.T) {
	tests := []struct {
		name, src, code, msg string
		start                protocol.Position
	}{
		{"parse error", "workflow W():\n\tif (\"é\") junk:\n\t\tclose complete\n", "SYNTAX", "junk", protocol.Position{Line: 1, Character: 10}},
		{"resolve error", "workflow W():\n\tif (x):\n\t\tactivity Missing(note: \"é😀\")\n\tclose complete\n", "UNDEFINED_ACTIVITY", "undefined activity", protocol.Position{Line: 2, Character: 11}},
		{"tab after spaces", "workflow W():\n    activity Do(x)\n    \tclose complete\n\nactivity Do(x):\n    do(x)\n", "LEX", "mixes tabs and spaces", protocol.Position{Line: 2, Character: 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := NewDocumentStore().Open("untitled:Untitled-1", tt.src)
			var got []protocol.Diagnostic
			for _, d := range diagnostics(doc) {
				if strings.Contains(d.Message, tt.msg) {
					got = append(got, d)
				}
			}
			if len(got) != 1 || got[0].Range.Start != tt.start || got[0].Code == nil || got[0].Code.Value != tt.code {
				t.Errorf("diagnostic %q = %+v, want one %s at %+v (all: %+v)", tt.msg, got, tt.code, tt.start, diagnostics(doc))
			}
		})
	}
}

// Semantic tokens on a tab-indented file start at their UTF-16 column, and a
// continuation line's token spans its tabs, one unit each.
func TestSemanticTokensOnTabs(t *testing.T) {
	src := "workflow W():\n" +
		"\tx = \"é😀\" + y  # ü😀 note\n" +
		"\tactivity Do(a, \"é\",\n" +
		"\t\t\"😀\")\n" +
		"\tclose complete\n"
	toks := decodeSemanticTokens(buildSemanticTokens(src))
	for _, want := range []semToken{
		{1, 5, 5, semString},     // "é😀"
		{1, 13, 1, semVariable},  // y
		{1, 16, 10, semComment},  // # ü😀 note
		{2, 12, 8, semParameter}, // (a, "é",
		{3, 0, 7, semParameter},  // \t\t"😀")
	} {
		if !slices.Contains(toks, want) {
			t.Errorf("no token %+v in %+v", want, toks)
		}
	}
}

// On a tab-indented file, rename, references and definition land on the name,
// and every document symbol selects its name.
func TestNavigationOnTabs(t *testing.T) {
	src := tabbed(everyKindSource)
	store := NewDocumentStore()
	store.Open(renameURI, src)
	for _, s := range []spot{{9, "Child", 1}, {12, "Place", 0}, {13, "ready", 0}, {14, "Do", 0}} {
		at := protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
			Position:     wordAt(t, src, s.line, s.word, s.nth),
		}
		edit, err := renameHandler(store)(nil, &protocol.RenameParams{TextDocumentPositionParams: at, NewName: "Renamed"})
		if err != nil || edit == nil || len(edit.Changes[renameURI]) == 0 {
			t.Fatalf("rename %s: edit=%v err=%v", s.word, edit, err)
		}
		for _, e := range edit.Changes[renameURI] {
			if got := spelled(src, e.Range); got != s.word {
				t.Errorf("rename %s: edit at %+v rewrites %q", s.word, e.Range.Start, got)
			}
		}
		refs, err := referencesHandler(store)(nil, &protocol.ReferenceParams{
			TextDocumentPositionParams: at,
			Context:                    protocol.ReferenceContext{IncludeDeclaration: true},
		})
		if err != nil || len(refs) != len(edit.Changes[renameURI]) {
			t.Errorf("references %s: got %d (err %v), want %d", s.word, len(refs), err, len(edit.Changes[renameURI]))
		}
		def, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
		if loc, ok := def.(protocol.Location); err != nil || !ok || spelled(src, loc.Range) != s.word {
			t.Errorf("definition %s = %#v (err %v)", s.word, def, err)
		}
	}

	got, err := documentSymbolHandler(store)(nil, &protocol.DocumentSymbolParams{TextDocument: protocol.TextDocumentIdentifier{URI: renameURI}})
	if err != nil {
		t.Fatal(err)
	}
	var check func(syms []protocol.DocumentSymbol)
	check = func(syms []protocol.DocumentSymbol) {
		for _, sym := range syms {
			if name := spelled(src, sym.SelectionRange); name != sym.Name {
				t.Errorf("symbol %s selects %q", sym.Name, name)
			}
			check(sym.Children)
		}
	}
	check(got.([]protocol.DocumentSymbol))
}

// Converting a `return` on a tab-indented file keeps the line's tabs.
func TestConvertReturnToCloseOnTabs(t *testing.T) {
	src := "workflow W() -> (Result):\n\tif (x):\n\t\treturn x  # done\n\tactivity Do(x)\n\nactivity Do(x: string):\n\tdo(x)\n"
	at := protocol.Position{Line: 2, Character: 4}
	actions := codeActions(t, src, protocol.Range{Start: at, End: at}, "Convert 'return' to 'close complete'")
	if len(actions) != 1 {
		t.Fatalf("want one action, got %+v", actions)
	}
	got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
	if want := strings.Replace(src, "return x", "close complete(x)", 1); got != want {
		t.Fatalf("result:\n%q\nwant:\n%q", got, want)
	}
	if doc := NewDocumentStore().Open(renameURI, got); len(doc.ParseErrs) > 0 {
		t.Errorf("result does not parse: %v", doc.ParseErrs)
	}
}
