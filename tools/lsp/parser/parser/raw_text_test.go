package parser

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// rawTextCases are expression lines and the exact text each keeps.
var rawTextCases = []struct{ name, src, want string }{
	{"plain", `x = y + 1`, `x = y + 1`},
	{"string", `x = "done"`, `x = "done"`},
	{"escaped quote", `x = "a\"b" + y`, `x = "a\"b" + y`},
	{"escaped backslash", `x = "a\\" + y`, `x = "a\\" + y`},
	{"parentheses", `do(x)`, `do(x)`},
	{"nested delimiters", `m = f(a, (b))[0] + T{k: [1, 2]}`, `m = f(a, (b))[0] + T{k: [1, 2]}`},
	{"spaces and tabs", "x  =\ty   +  z", "x  =\ty   +  z"},
	{"multi-line arguments", "x = f(a,\n            b)", "x = f(a,\n            b)"},
}

// A raw statement's text and a return value are their source span verbatim,
// with a trailing comment kept as its own comment statement (#295).
func TestRawTextIsSourceSpan(t *testing.T) {
	for _, tc := range rawTextCases {
		for _, trail := range []string{"", " # note", " \t # note"} {
			t.Run(tc.name+fmt.Sprintf("/%q", trail), func(t *testing.T) {
				wantComment := ""
				if trail != "" {
					wantComment = " note"
				}
				src := fmt.Sprintf("workflow P(x):\n    update U(v) -> (R):\n        return %s%s\n    %s%s\n    close complete(x)\n", tc.src, trail, tc.src, trail)
				file, err := ParseFile(src)
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				wf := file.Definitions[0].(*ast.WorkflowDef)
				checkTextAndComment(t, wf.Body, (*ast.RawStmt)(nil), tc.want, wantComment)
				checkTextAndComment(t, wf.Updates[0].Body, (*ast.ReturnStmt)(nil), tc.want, wantComment)
			})
		}
	}
}

// checkTextAndComment checks that body opens with a statement of want's type
// carrying text, followed by a comment statement when comment is set.
func checkTextAndComment(t *testing.T, body []ast.Statement, want ast.Statement, text, comment string) {
	t.Helper()
	if reflect.TypeOf(body[0]) != reflect.TypeOf(want) {
		t.Fatalf("first statement = %T, want %T", body[0], want)
	}
	var got string
	switch s := body[0].(type) {
	case *ast.RawStmt:
		got = s.Text
	case *ast.ReturnStmt:
		got = s.Value
	}
	if got != text {
		t.Errorf("%T text = %q, want %q", body[0], got, text)
	}
	var c *ast.Comment
	if len(body) > 1 {
		c, _ = body[1].(*ast.Comment)
	}
	switch {
	case comment == "" && c != nil:
		t.Errorf("unexpected comment %q", c.Text)
	case comment != "" && (c == nil || c.Text != comment):
		t.Errorf("no comment %q after the %T", comment, body[0])
	}
}

// The other raw positions: a return holding only a comment, raw lines in an
// activity body and a state: block, and switch case values.
func TestRawTextOtherPositions(t *testing.T) {
	file, err := ParseFile(`workflow P(x):
    state:
        count = "a\"b" + f(x) # init
    switch (x):
        case "a\"b": # quoted
            return # nothing
        case (y + 1):
            return
    close complete(x)

activity A(x):
    do(x)  # call
    return  f(x,  "y") # result
`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	if got, want := wf.State.RawStmts[0].Text, `count = "a\"b" + f(x)`; got != want {
		t.Errorf("state raw = %q, want %q", got, want)
	}
	sw := wf.Body[0].(*ast.SwitchBlock)
	if got := []string{sw.Cases[0].Value, sw.Cases[1].Value}; !reflect.DeepEqual(got, []string{`"a\"b"`, `(y + 1)`}) {
		t.Errorf("case values = %q", got)
	}
	checkTextAndComment(t, sw.Cases[0].Body, (*ast.ReturnStmt)(nil), "", " nothing")
	act := file.Definitions[1].(*ast.ActivityDef)
	checkTextAndComment(t, act.Body, (*ast.RawStmt)(nil), "do(x)", " call")
	checkTextAndComment(t, act.Body[2:], (*ast.ReturnStmt)(nil), `f(x,  "y")`, " result")
}

// A string with an unknown escape is an error, yet its raw line keeps the
// source as written.
func TestRawTextKeepsUnknownEscape(t *testing.T) {
	file, errs := ParseFileAll("workflow P(x):\n    x = \"a\\qb\" + y # note\n    close complete(x)\n")
	if len(errs) != 1 {
		t.Fatalf("errors = %v, want the unknown escape", errs)
	}
	checkTextAndComment(t, file.Definitions[0].(*ast.WorkflowDef).Body, (*ast.RawStmt)(nil), `x = "a\qb" + y`, " note")
}
