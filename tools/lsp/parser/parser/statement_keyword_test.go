package parser

import (
	"fmt"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// keywordLineBlocks place a line, at %s, in every block that holds workflow
// statements. "body" is the reference: a workflow body past its first
// statement, where handler declarations no longer parse.
var keywordLineBlocks = []struct{ name, src string }{
	{"body", "workflow P(x):\n\tactivity A(x)\n\t%s\n\tclose complete(x)\n"},
	{"await all", "workflow P(x):\n\tawait all:\n\t\t%s\n\tclose complete(x)\n"},
	{"await one case", "workflow P(x):\n\tawait one:\n\t\ttimer(1m):\n\t\t\t%s\n\tclose complete(x)\n"},
	{"await all in await one", "workflow P(x):\n\tawait one:\n\t\tawait all:\n\t\t\t%s\n\tclose complete(x)\n"},
	{"if", "workflow P(x):\n\tif (x):\n\t\t%s\n\tclose complete(x)\n"},
	{"else", "workflow P(x):\n\tif (x):\n\t\tactivity A(x)\n\telse:\n\t\t%s\n\tclose complete(x)\n"},
	{"for", "workflow P(x):\n\tfor (i in x):\n\t\t%s\n\tclose complete(x)\n"},
	{"switch case", "workflow P(x):\n\tswitch (x):\n\t\tcase 1:\n\t\t\t%s\n\tclose complete(x)\n"},
	{"switch else", "workflow P(x):\n\tswitch (x):\n\t\tcase 1:\n\t\t\tactivity A(x)\n\t\telse:\n\t\t\t%s\n\tclose complete(x)\n"},
	{"signal handler", "workflow P(x):\n\tsignal S(v):\n\t\tactivity A(v)\n\t\t%s\n\tclose complete(x)\n"},
	{"update handler", "workflow P(x):\n\tupdate U(v) -> (R):\n\t\tactivity A(v)\n\t\t%s\n\tclose complete(x)\n"},
}

// keywordLineOutcome parses src and returns its error message, or "ok" after
// failing t if a raw statement starts with kw.
func keywordLineOutcome(t *testing.T, src, kw string) string {
	file, err := ParseFile(src)
	if err != nil {
		return "error: " + err.(*ParseError).Msg
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	bodies := [][]ast.Statement{wf.Body}
	for _, s := range wf.Signals {
		bodies = append(bodies, s.Body)
	}
	for _, u := range wf.Updates {
		bodies = append(bodies, u.Body)
	}
	for _, body := range bodies {
		ast.WalkStatements(body, func(s ast.Statement) bool {
			if raw, ok := s.(*ast.RawStmt); ok && strings.HasPrefix(raw.Text, kw+" ") {
				t.Errorf("%q became a raw statement", raw.Text)
			}
			return true
		})
	}
	return "ok"
}

// A keyword-led line parses the same in every block that holds workflow
// statements as in the workflow body, and a keyword with no statement of its
// own is an error there, never a raw statement (#291).
func TestKeywordLineSameInEveryBlock(t *testing.T) {
	for tt := token.TokenType(0); !strings.HasPrefix(tt.String(), "TokenType("); tt++ {
		if !tt.IsKeyword() {
			continue
		}
		kw := strings.ToLower(tt.String())
		line := kw + " Missing"
		want := keywordLineOutcome(t, fmt.Sprintf(keywordLineBlocks[0].src, line), kw)
		if _, ok := workflowStmtParsers[tt]; !ok && !strings.HasPrefix(want, "error: ") {
			t.Errorf("body: %q parsed, want an error", line)
		}
		for _, b := range keywordLineBlocks[1:] {
			if got := keywordLineOutcome(t, fmt.Sprintf(b.src, line), kw); got != want {
				t.Errorf("%s: %q gives %q, want %q as in the body", b.name, line, got, want)
			}
		}
	}
}

// A keyword-led line with no statement of its own is an error in every
// workflow context, nested blocks included, and stays a raw statement in an
// activity body, nested blocks included.
func TestKeywordLineStrictOnlyInWorkflowContexts(t *testing.T) {
	strict := []struct{ name, src string }{
		{"state field in a workflow body", "workflow P(x):\n\tactivity A(x)\n\tstate.count = 1\n"},
		{"options in a workflow body", "workflow P(x):\n\tactivity A(x)\n\toptions = {}\n"},
		{"all in a workflow body", "workflow P(x):\n\tall = x\n\tclose complete(x)\n"},
		{"complete in a query handler", "workflow P(x):\n\tquery Q() -> (R):\n\t\tcomplete = 1\n\t\treturn x\n"},
		{"fail in a query handler's if", "workflow P(x):\n\tquery Q() -> (R):\n\t\tif (x):\n\t\t\tfail(x)\n\t\treturn x\n"},
		{"update in await all", "workflow P(x):\n\tawait all:\n\t\tupdate Missing\n\tclose complete(x)\n"},
		{"complete in a sync nexus operation", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tcomplete = 1\n\t\treturn x\n"},
		{"in within a sync nexus operation's for", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tfor (i in x):\n\t\t\tin parallel, run(i)\n\t\treturn x\n"},
	}
	for _, tt := range strict {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseFile(tt.src)
			if pe, ok := err.(*ParseError); !ok || !strings.HasSuffix(pe.Msg, "cannot start a statement") && !strings.HasPrefix(pe.Msg, "update arrivals") {
				t.Errorf("got %v, want a misplaced-keyword error", err)
			}
		})
	}

	file, err := ParseFile(`activity A(x):
	fail with X if x is missing
	complete the transfer
	in parallel, notify(x)
	if (x):
		fail(x)
	for (i in x):
		options = load(i)
		case i
	switch (x):
		case 1:
			as needed, retry(x)
		else:
			else fall back
	return x
`)
	if err != nil {
		t.Fatalf("activity body: unexpected error: %v", err)
	}
	var got []string
	ast.WalkStatements(file.Definitions[0].(*ast.ActivityDef).Body, func(s ast.Statement) bool {
		if raw, ok := s.(*ast.RawStmt); ok {
			got = append(got, raw.Text)
		}
		return true
	})
	want := []string{"fail with X if x is missing", "complete the transfer", "in parallel, notify(x)", "fail(x)",
		"options = load(i)", "case i", "as needed, retry(x)", "else fall back"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("activity raw lines = %q, want %q", got, want)
	}
}

// The #291 repro, and the handler and arrival errors a misplaced keyword
// names.
func TestMisplacedKeywordErrors(t *testing.T) {
	tests := []struct{ name, src, want string }{
		{"update in await all", "workflow P(x):\n\tawait all:\n\t\tupdate Missing\n\tclose complete(x)\n",
			"3:3 update arrivals must be awaited: `await update Name`"},
		{"update before the first statement", "workflow P(x):\n\tupdate Missing\n\tclose complete(x)\n",
			"2:2 update arrivals must be awaited: `await update Name`"},
		{"update with a comment before the first statement", "workflow P(x):\n\tupdate Missing # note\n\tclose complete(x)\n",
			"2:2 update arrivals must be awaited: `await update Name`"},
		{"signal handler after a statement", "workflow P(x):\n\tactivity A(x)\n\tsignal S(v):\n\t\treturn\n",
			"3:2 signal handler S is declared after the workflow body's first statement; declare handlers before it"},
		{"update handler inside a handler", "workflow P(x):\n\tsignal S(v):\n\t\tupdate U(v) -> (R):\n\t\t\treturn v\n",
			"3:3 update handler U is declared inside a handler; declare handlers at the top of the workflow body"},
		{"signal handler inside a handler", "workflow P(x):\n\tupdate U(v) -> (R):\n\t\tsignal S(v):\n\t\t\treturn\n",
			"3:3 signal handler S is declared inside a handler; declare handlers at the top of the workflow body"},
		{"update handler in a sync nexus operation", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tupdate U(v) -> (R):\n\t\t\treturn v\n",
			"3:3 a sync nexus operation declares no update handlers; declare U in a workflow"},
		{"signal handler in a sync nexus operation", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tsignal S(v):\n\t\t\treturn\n",
			"3:3 a sync nexus operation declares no signal handlers; declare S in a workflow"},
		{"bare update in a sync nexus operation", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tupdate Missing\n",
			"3:3 a sync nexus operation receives no updates; only a workflow awaits one"},
		{"update handler after a statement", "workflow P(x):\n\tawait all:\n\t\tupdate U(v) -> (R):\n\t\t\treturn v\n",
			"3:3 update handler U is declared after the workflow body's first statement; declare handlers before it"},
		{"query handler after a statement", "workflow P(x):\n\tactivity A(x)\n\tquery Q() -> (R):\n\t\treturn x\n",
			"3:2 query handler Q is declared after the workflow body's first statement; declare handlers before it"},
		{"timer", "workflow P(x):\n\tawait all:\n\t\ttimer(1m)\n",
			"3:3 a timer must be awaited: `await timer(duration)`"},
		{"options without a call", "workflow P(x):\n\tawait all:\n\t\toptions:\n",
			`3:3 "options" cannot start a statement`},
		{"keyword in a query handler", "workflow P(x):\n\tquery Q() -> (R):\n\t\tcomplete = 1\n\t\treturn x\n",
			`3:3 "complete" cannot start a statement`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseFile(tt.src)
			pe, ok := err.(*ParseError)
			if !ok {
				t.Fatalf("got %v, want a ParseError", err)
			}
			if got := fmt.Sprintf("%d:%d %s", pe.Line, pe.Column, pe.Msg); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

// A sync nexus operation body holds only client forms and control flow: every
// other workflow statement is one error at its keyword, nested or not.
func TestSyncBodyRejects(t *testing.T) {
	forms := []struct{ line, kw string }{
		{"activity A(x)", "activity"},
		{"nexus Ep Svc.Op(x) -> r", "nexus"},
		{"detach nexus Ep Svc.Op(x)", "detach nexus"},
		{"await timer(1m)", "await"},
		{"await one:\n\ttimer(1m):\n\t\treturn x", "await"},
		{"await all:\n\tawait timer(1m)", "await"},
		{"promise p <- workflow W(x)", "promise"},
		{"await signal S", "await"},
		{"await update U", "await"},
		{"condition Ready", "condition"},
		{"state:\n\tcondition Ready", "state"},
		{"set Ready", "set"},
		{"unset Ready", "unset"},
		{"timer(1m)", "timer"},
	}
	blocks := []struct{ name, src, indent string }{
		{"body", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tworkflow W(x)\n\t\t%s\n\t\treturn x\n", "\t\t"},
		{"for", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tfor (i in x):\n\t\t\t%s\n\t\treturn x\n", "\t\t\t"},
	}
	for _, b := range blocks {
		for _, f := range forms {
			t.Run(b.name+"/"+f.line, func(t *testing.T) {
				_, errs := ParseFileAll(fmt.Sprintf(b.src, strings.ReplaceAll(f.line, "\n", "\n"+b.indent)))
				if len(errs) != 1 {
					t.Fatalf("got %d errors, want 1: %v", len(errs), errs)
				}
				if want := f.kw + " is not allowed in a sync nexus operation body"; errs[0].Msg != want {
					t.Errorf("got %q, want %q", errs[0].Msg, want)
				}
			})
		}
	}
}
