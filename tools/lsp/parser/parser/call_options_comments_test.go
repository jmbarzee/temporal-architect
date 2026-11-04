package parser

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

func callOptions(t *testing.T, stmt ast.Statement) *ast.OptionsBlock {
	t.Helper()
	switch call := stmt.(type) {
	case *ast.ActivityCall:
		return call.Options
	case *ast.WorkflowCall:
		return call.Options
	case *ast.NexusCall:
		return call.Options
	default:
		t.Fatalf("expected call, got %T", stmt)
		return nil
	}
}

func TestCallOptionsAfterOwnLineComments(t *testing.T) {
	calls := []struct{ name, call, key string }{
		{"activity", "activity Work(x) -> result", "start_to_close_timeout"},
		{"workflow", "workflow Child(x) -> result", "workflow_execution_timeout"},
		{"nexus", "nexus Endpoint Service.Work(x) -> result", "schedule_to_close_timeout"},
	}
	comments := []struct{ name, text string }{
		{"single", "        # own-line note\n"},
		{"multiple and blank lines", "\n        # first note\n\n        # second note\n\n"},
	}
	for _, call := range calls {
		for _, comment := range comments {
			t.Run(call.name+"/"+comment.name, func(t *testing.T) {
				input := fmt.Sprintf("workflow Parent(x):\n    %s\n%s        options:\n            %s: 1h\n    # next statement\n    close complete(result)\n", call.call, comment.text, call.key)
				file, err := ParseFile(input)
				if err != nil {
					t.Fatal(err)
				}
				body := file.Definitions[0].(*ast.WorkflowDef).Body
				if len(body) != 3 {
					t.Fatalf("expected call, comment, close; got %d statements", len(body))
				}
				opts := callOptions(t, body[0])
				if opts == nil || len(opts.Entries) != 1 || opts.Entries[0].Key != call.key || opts.Entries[0].Value != "1h" {
					t.Fatalf("expected %s: 1h, got %#v", call.key, opts)
				}
				if note, ok := body[1].(*ast.Comment); !ok || note.Text != " next statement" {
					t.Fatalf("following comment lost: %#v", body[1])
				}
				if _, ok := body[2].(*ast.CloseStmt); !ok {
					t.Fatalf("expected following close, got %T", body[2])
				}
			})
		}
	}
}

func TestCallWithoutOptionsPreservesFollowingComments(t *testing.T) {
	for _, call := range []string{"activity Work(x)", "workflow Child(x)", "nexus Endpoint Service.Work(x)"} {
		t.Run(call, func(t *testing.T) {
			file, err := ParseFile("workflow Parent(x):\n    " + call + "\n    # first note\n\n    # second note\n    close complete(x)\n")
			if err != nil {
				t.Fatal(err)
			}
			body := file.Definitions[0].(*ast.WorkflowDef).Body
			if len(body) != 4 || callOptions(t, body[0]) != nil {
				t.Fatalf("expected call without options, two comments, close; got %#v", body)
			}
			for i, text := range []string{" first note", " second note"} {
				if note, ok := body[i+1].(*ast.Comment); !ok || note.Text != text {
					t.Errorf("following comment %d lost: %#v", i, body[i+1])
				}
			}
		})
	}
}

func TestOptionalOptionsCommentsLeaveTokensWhenAbsent(t *testing.T) {
	for _, suffix := range []string{"    unrelated\n", "unrelated\n", "        options:\n            start_to_close_timeout: 1h\n", "", "# final comment"} {
		t.Run(suffix, func(t *testing.T) {
			input := "    # note\n" + suffix
			p := &Parser{lex: lexer.New(input)}
			p.advance()
			p.advance()
			opts, err := p.parseOptionalOptionsLine(OptionsContextActivity)
			if err != nil || opts != nil {
				t.Fatalf("expected no options, got %#v, %v", opts, err)
			}
			var got []token.Token
			for p.current.Type != token.EOF {
				got = append(got, p.current)
				p.advance()
			}
			got = append(got, p.current)
			want := lexer.New(input).AllTokens()
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("lookahead changed remaining tokens:\ngot %#v\nwant %#v", got, want)
			}
		})
	}
}
