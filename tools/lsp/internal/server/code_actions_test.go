package server

import (
	"fmt"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// codeActions returns the code actions titled title offered for the range r of
// src, opened as renameURI.
func codeActions(t *testing.T, src string, r protocol.Range, title string) []protocol.CodeAction {
	t.Helper()
	store := NewDocumentStore()
	store.Open(renameURI, src)
	got, err := codeActionHandler(store)(nil, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
		Range:        r,
	})
	if err != nil {
		t.Fatal(err)
	}
	var out []protocol.CodeAction
	for _, a := range got.([]any) {
		if a := a.(protocol.CodeAction); a.Title == title {
			out = append(out, a)
		}
	}
	return out
}

// TestConvertReturnToClose: the action rewrites a workflow body's `return` as
// a valid `close complete`, replacing the statement alone, and the result
// parses with no diagnostic on the statement's lines.
func TestConvertReturnToClose(t *testing.T) {
	tests := []struct {
		name, stmt, want string
	}{
		{"value", "\treturn Result{ok: true}", "\tclose complete(Result{ok: true})"},
		{"no value", "\treturn", "\tclose complete"},
		{"parenthesized value", "\treturn (a, b)", "\tclose complete(a, b)"},
		{"nested, deeper indentation", "\tif (x):\n\t\treturn x", "\tif (x):\n\t\tclose complete(x)"},
		{"tab before the value", "\treturn\tx", "\tclose complete(x)"},
		{"trailing comment", "\treturn x  # done", "\tclose complete(x)  # done"},
		{"non-ASCII value and comment", "\treturn \"é😀\"  # ü😀", "\tclose complete(\"é😀\")  # ü😀"},
		{"argument list over two lines", "\treturn Pack(a,\n\t\t\"é😀\")  # ü", "\tclose complete(Pack(a,\n\t\t\"é😀\"))  # ü"},
	}
	const head = "workflow W() -> (Result):\n"
	const tail = "\n\tactivity Do(x)\n\nactivity Do(x: string):\n\tdo(x)\n"
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := head + tt.stmt + tail
			lastLine := uint32(strings.Count(head+tt.stmt, "\n"))
			cursor := protocol.Position{Line: lastLine, Character: utf16Len(strings.Split(src, "\n")[lastLine])}
			actions := codeActions(t, src, protocol.Range{Start: cursor, End: cursor}, "Convert 'return' to 'close complete'")
			if len(actions) != 1 {
				t.Fatalf("want one action, got %+v", actions)
			}
			got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
			if want := head + tt.want + tail; got != want {
				t.Fatalf("result:\n%s\nwant:\n%s", got, want)
			}
			doc := NewDocumentStore().Open(renameURI, got)
			first := uint32(strings.Count(head, "\n"))
			for _, d := range diagnostics(doc) {
				if d.Range.Start.Line >= first && d.Range.Start.Line <= lastLine {
					t.Errorf("diagnostic on the rewritten statement: %+v", d)
				}
			}
			if len(doc.ParseErrs) > 0 {
				t.Errorf("result does not parse: %v", doc.ParseErrs)
			}
		})
	}
}

// TestConvertReturnToCloseSkipsHandlers: a query returns its value; `close`
// is not allowed there, so its `return` is offered nothing.
func TestConvertReturnToCloseSkipsHandlers(t *testing.T) {
	line := uint32(8) // `        return "ok"` in Parent's query Status
	if !strings.Contains(strings.Split(everyKindSource, "\n")[line], `return "ok"`) {
		t.Fatalf("line %d is not the query's return", line)
	}
	at := protocol.Position{Line: line, Character: 8}
	if got := codeActions(t, everyKindSource, protocol.Range{Start: at, End: at}, "Convert 'return' to 'close complete'"); len(got) != 0 {
		t.Errorf("offered %+v on a query's return", got)
	}
}

// TestAddMissingDefinitionParses: the stub the add-missing-definition fix
// inserts parses, a workflow's closing with `close complete`.
func TestAddMissingDefinitionParses(t *testing.T) {
	tests := []struct{ name, call, title string }{
		{"workflow", "\tworkflow Missing(x)", "Add missing workflow 'Missing'"},
		{"activity with a result", "\tactivity Missing(x) -> r", "Add missing activity 'Missing'"},
		{"activity", "\tactivity Missing(x)", "Add missing activity 'Missing'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := "workflow W():\n" + tt.call + "\n\tclose complete\n"
			at := protocol.Position{Line: 1, Character: 4}
			actions := codeActions(t, src, protocol.Range{Start: at, End: at}, tt.title)
			if len(actions) != 1 {
				t.Fatalf("want one action, got %+v", actions)
			}
			got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
			doc := NewDocumentStore().Open(renameURI, got)
			if len(doc.ParseErrs)+len(doc.ResolveErrs)+len(doc.ValidateErrs) > 0 {
				t.Errorf("result is not clean: parse=%v resolve=%v validate=%v\n%s", doc.ParseErrs, doc.ResolveErrs, doc.ValidateErrs, got)
			}
		})
	}
}

// TestAddMissingDefinitionUsesFileIndent: the stub is indented the way the
// file is, not with a fixed four spaces.
func TestAddMissingDefinitionUsesFileIndent(t *testing.T) {
	src := "workflow W():\n  workflow Missing(x)\n  close complete\n"
	at := protocol.Position{Line: 1, Character: 2}
	actions := codeActions(t, src, protocol.Range{Start: at, End: at}, "Add missing workflow 'Missing'")
	if len(actions) != 1 {
		t.Fatalf("want one action, got %+v", actions)
	}
	got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
	if !strings.HasSuffix(got, ":\n  # TODO: implement\n  close complete\n") {
		t.Errorf("stub not indented with the file's two spaces:\n%s", got)
	}
	if doc := NewDocumentStore().Open(renameURI, got); len(doc.ParseErrs) > 0 {
		t.Errorf("result does not parse: %v\n%s", doc.ParseErrs, got)
	}
}

func TestIndentUnit(t *testing.T) {
	tests := []struct {
		name  string
		lines []string
		want  string
	}{
		{"four spaces", []string{"workflow W():", "    close complete"}, "    "},
		{"two spaces", []string{"# c", "workflow W():", "  close complete"}, "  "},
		{"tab", []string{"workflow W():", "\tclose complete"}, "\t"},
		{"skips indented comments and blank lines", []string{"workflow W():", "", "\t\t# c", "\tclose complete"}, "\t"},
		{"none indented", []string{"workflow W():"}, "\t"},
		{"skips a header's continuation", []string{"workflow W(a: int,", "           b: int):", "\tclose complete"}, "\t"},
		{"skips a continuation in a spaces file", []string{"workflow W(a: int,", "\t\tb: int):", "    close complete"}, "    "},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := indentUnit(tt.lines); got != tt.want {
				t.Errorf("indentUnit = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestAddMissingDefinitionSignature: the stub takes the arguments and result
// of the call the diagnostic is on, whatever shape the call has and wherever
// it stands, in the file's own indentation; a reference that is no call gets
// an empty signature. The result resolves.
func TestAddMissingDefinitionSignature(t *testing.T) {
	tests := []struct {
		name, body, title, header string
	}{
		{"activity", "activity Missing(a, b) -> r", "Add missing activity 'Missing'", "activity Missing(a, b) -> (Result):"},
		{"activity without a result", "activity Missing(a)", "Add missing activity 'Missing'", "activity Missing(a):"},
		{"workflow", "workflow Missing(x) -> r", "Add missing workflow 'Missing'", "workflow Missing(x) -> (Result):"},
		{"workflow without a result", "workflow Missing(x, y)", "Add missing workflow 'Missing'", "workflow Missing(x, y):"},
		{"promised workflow", "promise p <- workflow Missing(x)", "Add missing workflow 'Missing'", "workflow Missing(x):"},
		{"promised activity", "promise p <- activity Missing(a, b)", "Add missing activity 'Missing'", "activity Missing(a, b):"},
		{"in a switch", "switch (k):\n|case a:\n||activity Missing(a) -> r", "Add missing activity 'Missing'", "activity Missing(a) -> (Result):"},
		{"in await all", "await all:\n|workflow Missing(x) -> r\n|activity Do(x)", "Add missing workflow 'Missing'", "workflow Missing(x) -> (Result):"},
	}
	for _, unit := range []string{"\t", "    "} {
		for _, tt := range tests {
			t.Run(fmt.Sprintf("%q/%s", unit, tt.name), func(t *testing.T) {
				body := "|" + strings.ReplaceAll(tt.body, "\n", "\n|")
				src := "workflow W(a, b, x, y, k):\n" + body + "\n|close complete\n\nactivity Do(x):\n|return x\n"
				src = strings.ReplaceAll(src, "|", unit)
				line := uint32(strings.Count(src[:strings.Index(src, "Missing")], "\n"))
				at := protocol.Position{Line: line, Character: 0}
				actions := codeActions(t, src, protocol.Range{Start: at, End: protocol.Position{Line: line, Character: 200}}, tt.title)
				if len(actions) != 1 {
					t.Fatalf("want one action, got %+v", actions)
				}
				got := applyEdits(t, src, actions[0].Edit.Changes[renameURI])
				if want := "\n" + tt.header + "\n" + unit + "# TODO: implement\n"; !strings.Contains(got, want) {
					t.Errorf("stub does not hold %q:\n%s", want, got)
				}
				doc := NewDocumentStore().Open(renameURI, got)
				if len(doc.ParseErrs)+len(doc.ResolveErrs) > 0 {
					t.Errorf("result does not resolve: parse=%v resolve=%v\n%s", doc.ParseErrs, doc.ResolveErrs, got)
				}
			})
		}
	}
}

// TestAddMissingDefinitionSignatureFromItsOwnCall: of two calls to one missing
// workflow, each diagnostic's stub takes its own call's signature, in a
// handler body as in the main body.
func TestAddMissingDefinitionSignatureFromItsOwnCall(t *testing.T) {
	src := "workflow W(a, x):\n" +
		"\tsignal Go(a):\n" +
		"\t\tworkflow Missing(a) -> r\n" +
		"\tworkflow Missing(x)\n" +
		"\tclose complete\n"
	for _, tc := range []struct {
		line   uint32
		header string
	}{
		{2, "workflow Missing(a) -> (Result):"},
		{3, "workflow Missing(x):"},
	} {
		r := protocol.Range{Start: protocol.Position{Line: tc.line}, End: protocol.Position{Line: tc.line, Character: 200}}
		actions := codeActions(t, src, r, "Add missing workflow 'Missing'")
		if len(actions) != 1 {
			t.Fatalf("line %d: want one action, got %+v", tc.line, actions)
		}
		if got := actions[0].Edit.Changes[renameURI][0].NewText; !strings.Contains(got, "\n"+tc.header+"\n") {
			t.Errorf("line %d: stub %q, want header %q", tc.line, got, tc.header)
		}
	}
}

// TestAddMissingDefinitionSignatureInNexusOperation: an activity called from a
// sync nexus operation's body gets that call's signature.
func TestAddMissingDefinitionSignatureInNexusOperation(t *testing.T) {
	src := "nexus service S:\n\tsync Op(x: string) -> (R):\n\t\tactivity Missing(x) -> r\n\t\treturn r\n"
	r := protocol.Range{Start: protocol.Position{Line: 2}, End: protocol.Position{Line: 2, Character: 200}}
	actions := codeActions(t, src, r, "Add missing activity 'Missing'")
	if len(actions) != 1 {
		t.Fatalf("want one action, got %+v", actions)
	}
	if got := actions[0].Edit.Changes[renameURI][0].NewText; !strings.Contains(got, "\nactivity Missing(x) -> (Result):\n\t# TODO: implement\n") {
		t.Errorf("stub %q", got)
	}
}
