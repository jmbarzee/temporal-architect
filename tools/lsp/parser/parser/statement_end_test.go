package parser

import (
	"fmt"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// workflowLineContexts place a line, at %s, in each kind of body that holds
// workflow statements.
var workflowLineContexts = []struct{ name, src string }{
	{"workflow body", "workflow P(x):\n\tactivity A(x)\n\t%s\n\tclose complete(x)\n"},
	{"signal handler", "workflow P(x):\n\tsignal S(v):\n\t\t%s\n\tclose complete(x)\n"},
	{"update handler", "workflow P(x):\n\tupdate U(v) -> (R):\n\t\t%s\n\tclose complete(x)\n"},
	{"if", "workflow P(x):\n\tif (x):\n\t\t%s\n\tclose complete(x)\n"},
	{"for", "workflow P(x):\n\tfor (i in x):\n\t\t%s\n\tclose complete(x)\n"},
	{"await all", "workflow P(x):\n\tawait all:\n\t\t%s\n\tclose complete(x)\n"},
	{"await one case", "workflow P(x):\n\tawait one:\n\t\ttimer(1m):\n\t\t\t%s\n\tclose complete(x)\n"},
	{"sync nexus operation", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\t%s\n\t\treturn x\n"},
}

// activityLineContexts place a line, at %s, in the bodies that hold activity
// statements, inside a for loop so break and continue belong.
var activityLineContexts = []struct{ name, src string }{
	{"activity body", "activity A(x):\n\tfor (i in x):\n\t\t%s\n\treturn x\n"},
	{"query handler", "workflow P(x):\n\tquery Q() -> (R):\n\t\tfor (i in x):\n\t\t\t%s\n\t\treturn x\n\tclose complete(x)\n"},
}

// shortStatements are statements of a fixed form, each with the name its error
// gives it.
var shortStatements = []struct{ line, what string }{
	{"break", "break"},
	{"continue", "continue"},
	{"set Ready", "set Ready"},
	{"unset Ready", "unset Ready"},
	{"close complete(x)", "close"},
	{"close fail", "close"},
	{"close continue_as_new(x)", "close"},
	{"activity A(x)", "a call"},
	{"activity A(x) -> r", "a call"},
	{"activity pkg.A(x) -> r.field", "a call"},
	{"workflow W(x) -> r", "a call"},
	{"detach workflow W(x)", "a call"},
	{"nexus Ep Svc.Op(x) -> r", "a nexus call"},
	{"detach nexus Ep Svc.Op(x)", "a nexus call"},
	{"signal W.S(x)", "a signal send"},
	{"await timer(1m)", "an await"},
	{"await signal S", "an await"},
	{"await signal S -> v", "an await"},
	{"await update U -> (a, b)", "an await"},
	{"await activity A(x) -> r", "an await"},
	{"await workflow W(x) -> r", "an await"},
	{"await nexus Ep Svc.Op(x) -> r", "an await"},
	{"await p", "an await"},
	{"await p -> r", "an await"},
	{"promise p <- timer(1m)", "a promise"},
	{"promise p <- activity A(x)", "a promise"},
	{"promise p <- workflow W(x)", "a promise"},
}

// activityShortStatements are the fixed-form statements an activity body holds.
var activityShortStatements = shortStatements[:2]

// A short statement takes nothing after it on its line but a comment or
// whitespace, in every body that holds it: a trailing token is an error, not a
// raw statement of its own.
func TestShortStatementEndsItsLine(t *testing.T) {
	type ctx = struct{ name, src string }
	run := func(t *testing.T, contexts []ctx, stmts []struct{ line, what string }) {
		for _, c := range contexts {
			for _, s := range stmts {
				t.Run(c.name+"/"+s.line, func(t *testing.T) {
					checkLineEnds(t, c.src, s.line, s.what)
				})
			}
		}
	}
	run(t, workflowLineContexts, shortStatements)
	run(t, activityLineContexts, activityShortStatements)
}

// The declaration lines of a fixed form end their line the same way.
func TestDeclarationLineEndsItsLine(t *testing.T) {
	cases := []struct{ name, src, line, what string }{
		{"condition", "workflow P(x):\n\tstate:\n\t\t%s\n\tclose complete(x)\n", "condition Ready", "condition Ready"},
		{"id_scheme", "workflow P(x):\n\t%s\n\tclose complete(x)\n", `id_scheme: "p-{x}"`, "id_scheme:"},
		{"async operation", "nexus service Svc:\n\t%s\n", "async Op workflow W", "an async operation"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			checkLineEnds(t, c.src, c.line, c.what)
		})
	}
}

// checkLineEnds checks line at the %s of src: a trailing token is an error at
// that token, while a trailing comment or trailing whitespace parses.
func checkLineEnds(t *testing.T, src, line, what string) {
	t.Helper()
	for _, trail := range []string{"", " # note", "\t", " \t# note"} {
		if _, err := ParseFile(fmt.Sprintf(src, line+trail)); err != nil {
			t.Errorf("%q: unexpected error: %v", line+trail, err)
		}
	}
	for _, junk := range []string{"Missing", "Missing(y)", "activity B(x)", ":", `"s"`} {
		checkJunkAfter(t, src, line, junk, what)
	}
}

// checkJunkAfter checks that line followed by junk, at the %s of src, is a
// syntax error at junk that names what.
func checkJunkAfter(t *testing.T, src, line, junk, what string) {
	t.Helper()
	bad := line + " " + junk
	full := fmt.Sprintf(src, bad)
	_, err := ParseFile(full)
	if err == nil {
		t.Errorf("%q parsed, want an error", bad)
		return
	}
	pe := err.(*ParseError)
	if want := "expected the end of the line after " + what; !strings.HasPrefix(pe.Msg, want) || pe.Code() != CodeSyntax {
		t.Errorf("%q: error %s %q, want %s starting %q", bad, pe.Code(), pe.Msg, CodeSyntax, want)
	}
	at := strings.Index(full, bad) + len(line) + 1
	wantLine := strings.Count(full[:at], "\n") + 1
	wantCol := at - strings.LastIndex(full[:at], "\n")
	if pe.Line != wantLine || pe.Column != wantCol {
		t.Errorf("%q: error at %d:%d, want %d:%d", bad, pe.Line, pe.Column, wantLine, wantCol)
	}
}

// A promise takes no result binding; one is a trailing token, not a raw line.
func TestPromiseTakesNoResult(t *testing.T) {
	checkJunkAfter(t, workflowLineContexts[0].src, "promise p <- activity A(x)", "-> r", "a promise")
}

// The only await an await one case takes is `await all:`; another is named in
// the error, which used to print a Go struct.
func TestAwaitInAwaitOneCase(t *testing.T) {
	_, err := ParseFile("workflow P(x):\n\tawait one:\n\t\tawait timer(1m):\n\t\t\tactivity A(x)\n\tclose complete(x)\n")
	want := "expected 'await all' in await one case, got 'await timer'"
	if err == nil || err.(*ParseError).Msg != want || err.(*ParseError).Line != 3 {
		t.Errorf("got %v, want %q on line 3", err, want)
	}
}

// A bare `await` in an await one case names the token after it.
func TestBareAwaitInAwaitOneCase(t *testing.T) {
	_, err := ParseFile("workflow W():\n\tawait one:\n\t\tawait\n\t\ttimer(1m):\n\t\t\tbreak\n")
	want := "expected 'await all' in await one case, got 'await NEWLINE'"
	if err == nil || err.(*ParseError).Msg != want || err.(*ParseError).Line != 3 {
		t.Errorf("got %v, want %q on line 3", err, want)
	}
}

// A trailing comment after a short statement stays a comment statement.
func TestShortStatementKeepsTrailingComment(t *testing.T) {
	file, err := ParseFile("workflow P(x):\n\tfor (i in x):\n\t\tbreak # done\n\tclose complete(x)\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	body := file.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.ForStmt).Body
	if len(body) != 2 {
		t.Fatalf("for body has %d statements, want break and a comment", len(body))
	}
	if _, ok := body[0].(*ast.BreakStmt); !ok {
		t.Errorf("first statement is %T, want *ast.BreakStmt", body[0])
	}
	if c, ok := body[1].(*ast.Comment); !ok || c.Text != " done" {
		t.Errorf("second statement is %#v, want the comment \" done\"", body[1])
	}
}
