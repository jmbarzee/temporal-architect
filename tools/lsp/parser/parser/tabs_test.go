package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// tabsInline covers handlers, options blocks, await all and multi-line raw
// text, which a tab-indented file must parse as its space twin does.
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

// reindent re-indents src, indented with tabs or four spaces per level, with
// unit per level.
func reindent(t *testing.T, src, unit string) string {
	t.Helper()
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, " \t")
		run := line[:len(line)-len(body)]
		var level int
		switch {
		case strings.Trim(run, "\t") == "":
			level = len(run)
		case strings.Trim(run, " ") == "" && len(run)%4 == 0:
			level = len(run) / 4
		default:
			t.Fatalf("line %d is indented %q, not tabs or four spaces per level", i+1, run)
		}
		lines[i] = strings.Repeat(unit, level) + body
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

// A tab-indented file parses as its space twin, CRLF or not: the same AST but
// for columns and the indentation inside raw text, and the same diagnostics on
// the same lines.
func TestTabsParseAsSpaces(t *testing.T) {
	sources := map[string]string{"inline": tabsInline}
	for _, path := range crlfFixtures {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		sources[filepath.Base(path)] = string(data)
	}
	for name, src := range sources {
		for _, nl := range []string{"\n", "\r\n"} {
			t.Run(name+strings.ReplaceAll(nl, "\r", `\r`), func(t *testing.T) {
				spaces := strings.ReplaceAll(reindent(t, src, "    "), "\n", nl)
				tabs := strings.ReplaceAll(reindent(t, src, "\t"), "\n", nl)
				wantFile, wantErrs := ParseFileAll(spaces)
				gotFile, gotErrs := ParseFileAll(tabs)
				want, err := json.Marshal(columnless(t, wantFile))
				if err != nil {
					t.Fatal(err)
				}
				got, err := json.Marshal(columnless(t, gotFile))
				if err != nil {
					t.Fatal(err)
				}
				if string(got) != string(want) {
					t.Errorf("tab AST differs from spaces:\n%s\n%s", got, want)
				}
				if len(gotErrs) != len(wantErrs) {
					t.Fatalf("tab diagnostics %v, spaces %v", gotErrs, wantErrs)
				}
				for i := range wantErrs {
					if g, w := gotErrs[i], wantErrs[i]; g.Msg != w.Msg || g.Line != w.Line || g.Code() != w.Code() {
						t.Errorf("tab diagnostic %v, spaces %v", g, w)
					}
				}
			})
		}
	}
}

// Indentation that mixes tabs and spaces is one LEX error at its line, and
// the line's statement is kept, not dropped as raw text.
func TestMixedIndentationKeepsTheStatement(t *testing.T) {
	for _, tc := range []struct {
		name, src string
		line      int
	}{
		{"tab after spaces", "workflow P(x):\n    activity A(x)\n    \tclose complete(x)\n", 3},
		{"tab line in a spaces file", "workflow P(x):\n    activity A(x)\n\tclose complete(x)\n", 3},
		{"spaces line in a tab file", "workflow P(x):\n\tactivity A(x)\n    close complete(x)\n", 3},
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

// Lines off the file's style are LEX errors, one each, and are placed where an
// editor shows them, so a whole block or definition in the other style keeps
// its structure and nothing else is reported.
func TestOffStyleBlocksKeepTheirStructure(t *testing.T) {
	for _, tc := range []struct {
		name, src string
		lex       int
		body      []int // statements per definition
	}{
		{
			name: "a tab definition in a spaces file",
			src:  "workflow W(x):\n    close complete(x)\n\nactivity A(x):\n\tif (x):\n\t\treturn x\n\treturn x\n",
			lex:  3, body: []int{1, 2},
		},
		{
			name: "a two-space comment sets the style of a tab file",
			src:  "workflow W(x):\n  # note\n\tif (x):\n\t\tactivity A(x)\n\tclose complete(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  4, body: []int{2, 1},
		},
		{
			name: "a stray eight spaces at depth two of a tab file",
			src:  "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n        activity A(x)\n\tclose complete(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "a tab after a block header's indentation",
			src:  "workflow W(x):\n    if (x):\n    \tclose complete(x)\n    activity A(x)\n\nactivity A(x):\n    return x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "a tab after a commented block header's indentation, in a tab file",
			src:  "workflow W(x):\n\tif (x): # c\n\t    close complete(x)\n\tactivity A(x)\n\nactivity A(x):\n\treturn x\n",
			lex:  1, body: []int{2, 1},
		},
		{
			name: "two spaces and a tab at depth four",
			src:  "workflow W(x):\n    activity A(x)\n  \tclose complete(x)\n\nactivity A(x):\n    return x\n",
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
		{"spaces under a tab header", "workflow W(x):\n\tif (x):\n\t  close complete(x)\n", "indentation mixes tabs and spaces"},
		{"mixed run under options", "workflow W(x):\n\tactivity A(x)\n\t\toptions:\n\t    start_to_close_timeout: 1m\n\tclose complete(x)\n", "indentation mixes tabs and spaces"},
		{"dedent to no open block", "activity A(d) -> (string):\n        # c\n    work(d)\n", "inconsistent indentation"},
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
