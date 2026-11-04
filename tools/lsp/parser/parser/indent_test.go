package parser

import (
	"reflect"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// overIndentContexts each wrap body lines, indented by indent, between a head
// whose first line is the definition header and a tail of statement lines.
var overIndentContexts = []struct {
	name, head, indent, tail string
	before, over             []string // statements that open no block; lines indented under them
	after                    string   // a statement at the body's depth
}{
	{
		name: "workflow body", head: "workflow P(x):\n", indent: "    ",
		before: workflowNoBlock, over: []string{"log(r)", "close complete(r)"}, after: "activity A(x)",
	},
	{
		name: "update handler", head: "workflow P(x):\n    update U(v) -> (R):\n", indent: "        ", tail: "    close complete(x)\n",
		before: workflowNoBlock, over: []string{"log(r)", "close complete(r)"}, after: "activity A(x)",
	},
	{
		name: "await all", head: "workflow P(x):\n    await all:\n", indent: "        ", tail: "    close complete(x)\n",
		before: workflowNoBlock, over: []string{"log(r)", "close complete(r)"}, after: "activity A(x)",
	},
	{
		name: "if", head: "workflow P(x):\n    if (x):\n", indent: "        ", tail: "    close complete(x)\n",
		before: workflowNoBlock, over: []string{"log(r)", "close complete(r)"}, after: "activity A(x)",
	},
	{
		name: "activity body", head: "activity P(x):\n", indent: "    ",
		before: []string{"notify(r)", "return r"}, over: []string{"log(r)", "return r"}, after: "y = x",
	},
}

// workflowNoBlock are workflow statements that open no block: a call, a close,
// a set and a raw line.
var workflowNoBlock = []string{"activity A(x) -> r", "close complete(r)", "set Ready", "notify(r)"}

// A line indented under a statement that opens no block is an "unexpected
// indent" error at that line, and the enclosing body does not end early: the
// statements after it survive. ParseFile stops at the same error.
func TestUnexpectedIndent(t *testing.T) {
	for _, c := range overIndentContexts {
		for _, before := range c.before {
			for _, over := range c.over {
				for _, after := range []string{c.after, ""} {
					body := c.indent + before + "\n" + c.indent + "    " + over + "\n"
					if after != "" {
						body += c.indent + after + "\n"
					}
					src := c.head + body + c.tail
					bad := strings.Count(c.head, "\n") + 2
					var keep []int // every line but the header and the bad one
					for l := 2; l <= strings.Count(src, "\n"); l++ {
						if l != bad {
							keep = append(keep, l)
						}
					}
					t.Run(c.name+"/"+before+"/"+over+"/"+after, func(t *testing.T) {
						checkUnexpectedIndent(t, src, bad, len(c.indent)+5, keep)
					})
				}
			}
		}
	}
}

// The repro from #325's review: a handler's over-indented line used to close
// the handler early, so strict mode reported an unrelated top-level error.
func TestUnexpectedIndentInHandler(t *testing.T) {
	src := `workflow W(x: int) -> (int):
    update U(v: int) -> (int):
        activity A(v) -> r
            log(r)
        return r
    activity A(x) -> y
    close complete(y)
`
	checkUnexpectedIndent(t, src, 4, 13, []int{2, 3, 5, 6, 7})
	src = `workflow W(x):
    signal S(v):
        activity A(v) -> r
            log(r)
        if (r):
            activity A(v)
        else:
            activity A(v)
    close complete(x)
`
	checkUnexpectedIndent(t, src, 4, 13, []int{2, 3, 5, 6, 8, 9})
}

// A whole over-indented block, however deep, is one error and is skipped.
func TestUnexpectedIndentSkipsTheBlock(t *testing.T) {
	src := `workflow P(x):
    activity A(x) -> r
        log(r)
        close complete(r)
            if (r):
                break
    activity A(x)
`
	checkUnexpectedIndent(t, src, 3, 9, []int{2, 7})
}

// A line indented under a state: condition is an error too.
func TestUnexpectedIndentInState(t *testing.T) {
	src := `workflow P(x):
    state:
        condition Ready
            junk
        condition Done
    set Ready
`
	checkUnexpectedIndent(t, src, 4, 13, []int{3, 5, 6})
}

// checkUnexpectedIndent checks that src's one error is an unexpected indent at
// line:col, in both modes, and that the statements on lines want survive.
func checkUnexpectedIndent(t *testing.T, src string, line, col int, want []int) {
	t.Helper()
	file, errs := ParseFileAll(src)
	if len(errs) != 1 || errs[0].Line != line || errs[0].Column != col || !strings.HasPrefix(errs[0].Msg, "unexpected indent") {
		t.Fatalf("errors %v, want one unexpected indent at %d:%d in\n%s", errs, line, col, src)
	}
	if _, err := ParseFile(src); err == nil || err.Error() != errs[0].Error() {
		t.Errorf("ParseFile: %v, want %v", err, errs[0])
	}
	if len(file.Definitions) != 1 {
		t.Fatalf("got %d definitions, want 1", len(file.Definitions))
	}
	if got := statementLines(file.Definitions[0]); !reflect.DeepEqual(got, want) {
		t.Errorf("surviving statements on lines %v, want %v in\n%s", got, want, src)
	}
}

// Comment lines alone may sit indented under any statement; they are kept.
func TestIndentedCommentsUnderAStatement(t *testing.T) {
	file, err := ParseFile("workflow P(x):\n    set Ready\n        # why\n            # deeper\n    activity A(x)\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	body := file.Definitions[0].(*ast.WorkflowDef).Body
	if len(body) != 4 {
		t.Fatalf("got %d statements, want set, two comments and the call: %#v", len(body), body)
	}
	if c, ok := body[1].(*ast.Comment); !ok || c.Text != " why" {
		t.Errorf("second statement is %#v, want the comment", body[1])
	}
	if _, ok := body[3].(*ast.ActivityCall); !ok {
		t.Errorf("last statement is %T, want the call", body[3])
	}
}

// Continuation lines of a parenthesized argument list and a call's options:
// block are not over-indented.
func TestIndentedContinuationsParse(t *testing.T) {
	src := `workflow P(x):
    activity A(
        x,
            x,
    ) -> r
        options:
            start_to_close_timeout: 1m
    notify(
        r
    )
    close complete(
        r
    )

activity A(x):
    notify(
        x
    )
    return x
`
	if _, errs := ParseFileAll(src); len(errs) != 0 {
		t.Errorf("unexpected errors: %v", errs)
	}
}
