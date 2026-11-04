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
	{"body", "workflow P(x):\n    activity A(x)\n    %s\n    close complete(x)\n"},
	{"await all", "workflow P(x):\n    await all:\n        %s\n    close complete(x)\n"},
	{"await one case", "workflow P(x):\n    await one:\n        timer(1m):\n            %s\n    close complete(x)\n"},
	{"await all in await one", "workflow P(x):\n    await one:\n        await all:\n            %s\n    close complete(x)\n"},
	{"if", "workflow P(x):\n    if (x):\n        %s\n    close complete(x)\n"},
	{"else", "workflow P(x):\n    if (x):\n        activity A(x)\n    else:\n        %s\n    close complete(x)\n"},
	{"for", "workflow P(x):\n    for (i in x):\n        %s\n    close complete(x)\n"},
	{"switch case", "workflow P(x):\n    switch (x):\n        case 1:\n            %s\n    close complete(x)\n"},
	{"switch else", "workflow P(x):\n    switch (x):\n        case 1:\n            activity A(x)\n        else:\n            %s\n    close complete(x)\n"},
	{"signal handler", "workflow P(x):\n    signal S(v):\n        activity A(v)\n        %s\n    close complete(x)\n"},
	{"update handler", "workflow P(x):\n    update U(v) -> (R):\n        activity A(v)\n        %s\n    close complete(x)\n"},
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

// The #291 repro, and the handler and arrival errors a misplaced keyword
// names.
func TestMisplacedKeywordErrors(t *testing.T) {
	tests := []struct{ name, src, want string }{
		{"update in await all", "workflow P(x):\n    await all:\n        update Missing\n    close complete(x)\n",
			"3:9 update arrivals must be awaited: `await update Name`"},
		{"update before the first statement", "workflow P(x):\n    update Missing\n    close complete(x)\n",
			"2:5 update arrivals must be awaited: `await update Name`"},
		{"update handler after a statement", "workflow P(x):\n    await all:\n        update U(v) -> (R):\n            return v\n",
			"3:9 update handler U is declared after the workflow body's first statement; declare handlers before it"},
		{"query handler after a statement", "workflow P(x):\n    activity A(x)\n    query Q() -> (R):\n        return x\n",
			"3:5 query handler Q is declared after the workflow body's first statement; declare handlers before it"},
		{"timer", "workflow P(x):\n    await all:\n        timer(1m)\n",
			"3:9 a timer must be awaited: `await timer(duration)`"},
		{"options without a call", "workflow P(x):\n    await all:\n        options:\n",
			`3:9 "options" cannot start a statement`},
		{"keyword in an activity body", "activity A(x):\n    case x\n",
			`2:5 "case" cannot start a statement`},
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
