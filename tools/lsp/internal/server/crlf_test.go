package server

import (
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// crlf is src with every line ending `\r\n`.
func crlf(src string) string { return strings.ReplaceAll(src, "\n", "\r\n") }

// TestAddMissingDefinitionKeepsLineEnding: the stub's lines end the way the
// buffer's last line does, and the result parses and resolves the call.
func TestAddMissingDefinitionKeepsLineEnding(t *testing.T) {
	tests := []struct{ name, src, eol string }{
		{"CRLF", crlf("workflow W():\n\tworkflow Missing(x)\n\tclose complete\n"), "\r\n"},
		{"LF, then CRLF last", "workflow W():\n\tworkflow Missing(x)\r\n\tclose complete\r\n", "\r\n"},
		{"CRLF, then LF last", "workflow W():\r\n\tworkflow Missing(x)\r\n\tclose complete\n", "\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := protocol.Position{Line: 1, Character: 4}
			actions := codeActions(t, tt.src, protocol.Range{Start: at, End: at}, "Add missing workflow 'Missing'")
			if len(actions) != 1 {
				t.Fatalf("want one action, got %+v", actions)
			}
			stub := actions[0].Edit.Changes[renameURI][0].NewText
			if lf := strings.ReplaceAll(stub, "\r\n", "\n"); strings.Contains(lf, "\r") || strings.ReplaceAll(lf, "\n", tt.eol) != stub {
				t.Errorf("stub does not end its lines in %q: %q", tt.eol, stub)
			}
			got := applyEdits(t, tt.src, actions[0].Edit.Changes[renameURI])
			if doc := NewDocumentStore().Open(renameURI, got); len(doc.ParseErrs)+len(doc.ResolveErrs) > 0 {
				t.Errorf("result is not clean: %v %v\n%q", doc.ParseErrs, doc.ResolveErrs, got)
			}
		})
	}
}

// TestConvertReturnToCloseKeepsCRLF: the rewrite on a CRLF line replaces the
// statement and keeps its `\r\n`, inside a value over several lines too.
func TestConvertReturnToCloseKeepsCRLF(t *testing.T) {
	tests := []struct{ name, stmt, want string }{
		{"one line", "\treturn x  # done", "\tclose complete(x)  # done"},
		{"parenthesized value over two lines", "\treturn (a,\n\t\tb)", "\tclose complete(a,\n\t\tb)"},
		{"call over two lines", "\treturn Pack(a,\n\t\tb)  # done", "\tclose complete(Pack(a,\n\t\tb))  # done"},
	}
	const head = "workflow W() -> (Result):\n\tactivity Do(x)\n"
	const tail = "\n\nactivity Do(x: string):\n\tdo(x)\n"
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := crlf(head + tt.stmt + tail)
			at := protocol.Position{Line: 2, Character: 6}
			actions := codeActions(t, src, protocol.Range{Start: at, End: at}, "Convert 'return' to 'close complete'")
			if len(actions) != 1 {
				t.Fatalf("want one action, got %+v", actions)
			}
			got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
			if want := crlf(head + tt.want + tail); got != want {
				t.Errorf("result:\n%q\nwant:\n%q", got, want)
			}
		})
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
		{"parse error", crlf("workflow W():\n\tif (x) junk:\n\t\tclose complete\n"), "junk", lineSpan(1, 8, 13)},
		{"resolve error", crlf("workflow W():\n\tactivity Missing(x)\n\tclose complete\n"), "undefined activity", lineSpan(1, 10, 20)},
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
