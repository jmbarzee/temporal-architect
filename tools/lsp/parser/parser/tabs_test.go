package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
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

// tabify re-indents a four-space-indented src with one tab per level.
func tabify(t *testing.T, src string) string {
	t.Helper()
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, " ")
		width := len(line) - len(body)
		if width%4 != 0 {
			t.Fatalf("line %d is indented %d spaces, not a multiple of four", i+1, width)
		}
		lines[i] = strings.Repeat("\t", width/4) + body
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
	for name, spaces := range sources {
		for _, nl := range []string{"\n", "\r\n"} {
			t.Run(name+strings.ReplaceAll(nl, "\r", `\r`), func(t *testing.T) {
				wantFile, wantErrs := ParseFileAll(strings.ReplaceAll(spaces, "\n", nl))
				gotFile, gotErrs := ParseFileAll(strings.ReplaceAll(tabify(t, spaces), "\n", nl))
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
