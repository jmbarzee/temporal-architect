package server

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	protocol317 "github.com/jmbarzee/glsp/protocol_3_17"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

const convertIndentation = "Convert indentation to tabs"

// spaced is the tab-indented src with each leading tab as unit spaces.
func spaced(src string, unit int) string {
	lines := strings.Split(src, "\n")
	for i, l := range lines {
		body := strings.TrimLeft(l, "\t")
		lines[i] = strings.Repeat(" ", unit*(len(l)-len(body))) + body
	}
	return strings.Join(lines, "\n")
}

// wholeRange spans every line of src.
func wholeRange(src string) protocol.Range {
	return protocol.Range{End: protocol.Position{Line: uint32(strings.Count(src, "\n")), Character: 0}}
}

// TestConvertIndentationOffered: the quick fix is offered, once and
// preferred, on a range that reaches a space in a line's indentation, and on
// no other.
func TestConvertIndentationOffered(t *testing.T) {
	const mixed = "workflow W():\n\tactivity Do(x)\n\t close complete\n\nactivity Do(x):\n\tdo(x)\n"
	line := func(n uint32) protocol.Range {
		return protocol.Range{Start: protocol.Position{Line: n}, End: protocol.Position{Line: n, Character: 3}}
	}
	tests := []struct {
		name string
		src  string
		r    protocol.Range
		want int
	}{
		{"cursor on a space-indented line", spaced(everyKindSource, 2), line(1), 1},
		{"range over every space-indented line", spaced(everyKindSource, 4), wholeRange(everyKindSource), 1},
		{"space after a tab", mixed, line(2), 1},
		{"CRLF, space-indented", strings.ReplaceAll(spaced(everyKindSource, 2), "\n", "\r\n"), line(1), 1},
		{"cursor on an unindented line", spaced(everyKindSource, 2), line(0), 0},
		{"tab file", everyKindSource, wholeRange(everyKindSource), 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := codeActions(t, tt.src, tt.r, convertIndentation)
			if len(got) != tt.want {
				t.Fatalf("offered %d, want %d: %+v", len(got), tt.want, got)
			}
			for _, a := range got {
				if a.Kind == nil || *a.Kind != protocol.CodeActionKindQuickFix || a.IsPreferred == nil || !*a.IsPreferred {
					t.Errorf("action is not a preferred quickfix: %+v", a)
				}
			}
		})
	}
}

// TestConvertIndentationApplied: the fix leaves tab indentation, in the
// buffer's own line endings, with no LEX diagnostic and the parse the
// space-indented buffer had.
func TestConvertIndentationApplied(t *testing.T) {
	tests := []struct{ name, src, want string }{
		{"2 spaces", spaced(everyKindSource, 2), everyKindSource},
		{"4 spaces", spaced(everyKindSource, 4), everyKindSource},
		{"CRLF", strings.ReplaceAll(spaced(everyKindSource, 2), "\n", "\r\n"), strings.ReplaceAll(everyKindSource, "\n", "\r\n")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actions := codeActions(t, tt.src, wholeRange(tt.src), convertIndentation)
			if len(actions) != 1 {
				t.Fatalf("want one action, got %+v", actions)
			}
			got := applyEdits(t, tt.src, actions[0].Edit.Changes[renameURI])
			if got != tt.want {
				t.Fatalf("result:\n%q\nwant:\n%q", got, tt.want)
			}
			for _, d := range diagnostics(NewDocumentStore().Open(renameURI, got)) {
				if d.Code != nil && d.Code.Value == parser.CodeLexical {
					t.Errorf("LEX diagnostic after the fix: %+v", d)
				}
			}
			if before, after := parseShape(t, tt.src), parseShape(t, got); !reflect.DeepEqual(before, after) {
				t.Errorf("parse changed:\nbefore %v\nafter  %v", before, after)
			}
		})
	}
}

// parseShape is src's AST as JSON, without columns, which indentation moves.
func parseShape(t *testing.T, src string) any {
	t.Helper()
	f, _ := parser.ParseFileAll(src)
	b, err := json.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	var strip func(any)
	strip = func(v any) {
		switch v := v.(type) {
		case map[string]any:
			delete(v, "column")
			for _, c := range v {
				strip(c)
			}
		case []any:
			for _, c := range v {
				strip(c)
			}
		}
	}
	strip(v)
	return v
}

// TestFormatting: formatting a tab file edits nothing; formatting a
// space-indented one replaces the document with its tab-indented text.
func TestFormatting(t *testing.T) {
	crlf := func(s string) string { return strings.ReplaceAll(s, "\n", "\r\n") }
	tests := []struct{ name, src, want string }{
		{"tab file", everyKindSource, ""},
		{"CRLF tab file", crlf(everyKindSource), ""},
		{"2 spaces", spaced(everyKindSource, 2), everyKindSource},
		{"CRLF, 2 spaces", crlf(spaced(everyKindSource, 2)), crlf(everyKindSource)},
		{"trailing lone CR", spaced("workflow W():\n\tclose complete\r", 2), "workflow W():\n\tclose complete\r"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := NewDocumentStore()
			store.Open(renameURI, tt.src)
			edits, err := formattingHandler(store)(nil, &protocol.DocumentFormattingParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
				Options:      protocol.FormattingOptions{protocol.FormattingOptionTabSize: 2, protocol.FormattingOptionInsertSpaces: true},
			})
			if err != nil {
				t.Fatal(err)
			}
			if tt.want == "" {
				if len(edits) != 0 {
					t.Errorf("edits on a tab file: %+v", edits)
				}
				return
			}
			if got := applyEdits(t, tt.src, edits); got != tt.want {
				t.Errorf("result:\n%q\nwant:\n%q", got, tt.want)
			}
		})
	}
}

// The server advertises document formatting.
func TestFormattingCapability(t *testing.T) {
	result, err := initializeHandler("twf", "test", NewDocumentStore())(&glsp.Context{}, &protocol317.InitializeParams{})
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Capabilities struct {
			DocumentFormattingProvider json.RawMessage `json:"documentFormattingProvider"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if p := string(got.Capabilities.DocumentFormattingProvider); p == "" || p == "null" || p == "false" {
		t.Errorf("documentFormattingProvider = %q in %s", p, b)
	}
}
