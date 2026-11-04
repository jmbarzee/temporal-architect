package parser

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// tabsInline covers handlers, options blocks, await all and multi-line raw
// text, which a space-indented twin must recover to.
const tabsInline = `workflow P(x):
	signal Go():
		go = true
	update U(v) -> (R):
		return f(a,
			b)
	activity A(x) -> r
		options:
			start_to_close_timeout: 1m
	await all:
		activity A(x)
		timer(1h)
	close complete(x)

activity A(x):
	return x
`

// reindent re-indents src, indented with one tab per level, with unit per level.
func reindent(t *testing.T, src, unit string) string {
	t.Helper()
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, "\t")
		if strings.HasPrefix(body, " ") && strings.TrimSpace(body) != "" {
			t.Fatalf("line %d is indented with spaces", i+1)
		}
		lines[i] = strings.Repeat(unit, len(line)-len(body)) + body
	}
	return strings.Join(lines, "\n")
}

// lineIndent matches a line end and the indentation after it, in raw text.
var lineIndent = regexp.MustCompile(`\n[\t ]*`)

// columnless returns the AST as JSON with columns dropped and every line's
// indentation removed from its text: what tabs and spaces may disagree on.
func columnless(t *testing.T, file *ast.File) any {
	t.Helper()
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	var strip func(v any) any
	strip = func(v any) any {
		switch v := v.(type) {
		case map[string]any:
			delete(v, "column")
			for k, e := range v {
				v[k] = strip(e)
			}
		case []any:
			for i, e := range v {
				v[i] = strip(e)
			}
		case string:
			return lineIndent.ReplaceAllString(v, "\n")
		}
		return v
	}
	return strip(v)
}

// A space-indented file, at four, three or two spaces per level, is a LEX error
// on each indented line and otherwise parses as its tab twin, CRLF or not: the same AST but for columns and the
// indentation inside raw text, and the same other diagnostics on the same lines.
func TestSpacesRecoverToTheTabAST(t *testing.T) {
	const spacesMsg = "indented with spaces; .twf indents with tabs, one per level"
	sources := map[string]string{"inline": tabsInline}
	for _, path := range crlfFixtures {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		sources[filepath.Base(path)] = string(data)
	}
	for name, src := range sources {
		for _, tc := range []struct{ nl, unit string }{{"\n", "    "}, {"\r\n", "    "}, {"\n", "  "}, {"\n", "   "}} {
			nl, unit := tc.nl, tc.unit
			t.Run(fmt.Sprintf("%s%s/%d", name, strings.ReplaceAll(nl, "\r", `\r`), len(unit)), func(t *testing.T) {
				tabs := strings.ReplaceAll(src, "\n", nl)
				spaces := strings.ReplaceAll(reindent(t, src, unit), "\n", nl)
				wantFile, wantErrs := ParseFileAll(tabs)
				gotFile, allErrs := ParseFileAll(spaces)
				want, err := json.Marshal(columnless(t, wantFile))
				if err != nil {
					t.Fatal(err)
				}
				got, err := json.Marshal(columnless(t, gotFile))
				if err != nil {
					t.Fatal(err)
				}
				if string(got) != string(want) {
					t.Errorf("space AST differs from tabs:\n%s\n%s", got, want)
				}
				var gotErrs []*ParseError
				rejected := 0
				for _, e := range allErrs {
					if e.Msg == spacesMsg && e.Code() == CodeLexical {
						rejected++
						continue
					}
					gotErrs = append(gotErrs, e)
				}
				if rejected == 0 && strings.Contains(src, "\n\t") {
					t.Errorf("no space-indentation error in %v", allErrs)
				}
				if len(gotErrs) != len(wantErrs) {
					t.Fatalf("space diagnostics %v, tabs %v", gotErrs, wantErrs)
				}
				for i := range wantErrs {
					if g, w := gotErrs[i], wantErrs[i]; g.Msg != w.Msg || g.Line != w.Line || g.Code() != w.Code() {
						t.Errorf("space diagnostic %v, tabs %v", g, w)
					}
				}
			})
		}
	}
}

// A space in a line's indentation is one LEX error at its line, and the line's
// statement is kept, not dropped as raw text.
func TestMixedIndentationKeepsTheStatement(t *testing.T) {
	for _, tc := range []struct {
		name, src string
		line      int
	}{
		{"spaces after a tab", "workflow P(x):\n\tactivity A(x)\n\t  close complete(x)\n", 3},
		{"two spaces and a tab", "workflow P(x):\n\tactivity A(x)\n  \tclose complete(x)\n", 3},
		{"spaces", "workflow P(x):\n\tactivity A(x)\n    close complete(x)\n", 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file, errs := ParseFileAll(tc.src)
			if len(errs) != 1 || errs[0].Code() != CodeLexical || errs[0].Line != tc.line {
				t.Fatalf("got diagnostics %v, want one %s on line %d", errs, CodeLexical, tc.line)
			}
			wf := file.Definitions[0].(*ast.WorkflowDef)
			if len(wf.Body) != 2 {
				t.Fatalf("got %d workflow statements, want 2", len(wf.Body))
			}
			if _, ok := wf.Body[1].(*ast.CloseStmt); !ok {
				t.Errorf("second statement is %T, want *ast.CloseStmt", wf.Body[1])
			}
		})
	}
}

// Lines indented with spaces are LEX errors, one each, and are placed where an
// editor shows them, so a whole block or definition indented with spaces keeps
// its structure and nothing else is reported.
func TestSpaceIndentedBlocksKeepTheirStructure(t *testing.T) {
	for _, tc := range []struct {
		name, src string
		lex       int
		body      []int // statements per definition
	}{
		{
			name: "a space-indented definition in a tab file",
			src:  "workflow W(x):\n\tclose complete(x)\n\nactivity A(x):\n    if (x):\n        return x\n    return x\n",
			lex:  3, body: []int{1, 2},
		},
		{
			name: "a two-space file",
			src:  "workflow W(x):\n  activity A(x)\n  if (x):\n    close complete(x)\n  close complete(x)\n\nactivity A(x):\n  return x\n",
			lex:  5, body: []int{3, 1},
		},
		{
			name: "a stray two spaces at depth one",
			src:  "workflow W(x):\n\tactivity A(x)\n  close complete(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "a stray space opening await all",
			src:  "workflow W(x):\n\tawait all:\n\t activity A(x)\n\t\tactivity A(x)\n\tclose complete(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "a stray eight spaces at depth two",
			src:  "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n        activity A(x)\n\tclose complete(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "spaces after a block header's tab",
			src:  "workflow W(x):\n\tif (x):\n\t    close complete(x)\n\tactivity A(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "spaces after a commented block header's tab",
			src:  "workflow W(x):\n\tif (x): # c\n\t    close complete(x)\n\tactivity A(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file, errs := ParseFileAll(tc.src)
			lex := 0
			for _, e := range errs {
				if e.Code() != CodeLexical {
					t.Errorf("unexpected diagnostic %v", e)
				}
				lex++
			}
			if lex != tc.lex {
				t.Errorf("got %d LEX errors %v, want %d", lex, errs, tc.lex)
			}
			var body []int
			for _, d := range file.Definitions {
				switch d := d.(type) {
				case *ast.WorkflowDef:
					body = append(body, len(d.Body))
				case *ast.ActivityDef:
					body = append(body, len(d.Body))
				}
			}
			if !slices.Equal(body, tc.body) {
				t.Errorf("got definitions with %v statements, want %v", body, tc.body)
			}
		})
	}
}

// An indentation error from the lexer is the one reported where it misleads
// the parser: strict parsing returns it in place of the error it causes, and
// collecting puts it first at a shared position. A parser error before it
// still wins.
func TestIndentationErrorComesFirst(t *testing.T) {
	for _, tc := range []struct {
		name, src, msg string
	}{
		{"a tab after spaces shows deeper", "workflow W(x):\n\tactivity A(x)\n    \tclose complete(x)\n", "indentation mixes tabs and spaces"},
		{"mixed run under options", "workflow W(x):\n\tactivity A(x)\n\t\toptions:\n\t    start_to_close_timeout: 1m\n\tclose complete(x)\n", "indentation mixes tabs and spaces"},
		{"dedent to no open block", "activity A(d) -> (string):\n\t\t# c\n\twork(d)\n", "inconsistent indentation"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseFile(tc.src)
			pe, ok := err.(*ParseError)
			if !ok || pe.Code() != CodeLexical || !strings.Contains(pe.Msg, tc.msg) {
				t.Errorf("strict: got %v, want the %s error %q", err, CodeLexical, tc.msg)
			}
			_, errs := ParseFileAll(tc.src)
			if len(errs) < 2 || errs[0].Code() != CodeLexical || !strings.Contains(errs[0].Msg, tc.msg) {
				t.Errorf("collecting: got %v, want the %s error %q first, then what it causes", errs, CodeLexical, tc.msg)
			}
		})
	}

	_, err := ParseFile("workflow W():\n\tbreak Missing\n    close complete\n")
	if pe, ok := err.(*ParseError); !ok || pe.Code() == CodeLexical || pe.Line != 2 {
		t.Errorf("got %v, want the parser's error on line 2", err)
	}
}
