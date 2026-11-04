package parser

import (
	"fmt"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// optionsForms are the lines that take an indented options: block, each with
// the definition around it (the line at %s, its option entry at %%s) and how
// to find its options in the parsed file.
var optionsForms = []struct {
	name, src, entry string
	options          func(*ast.File) *ast.OptionsBlock
}{
	{"activity call", "workflow P(x):\n\tactivity A(x) -> y%s\n\tclose complete(y)\n", "start_to_close_timeout: 1m",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.ActivityCall).Options
		}},
	{"workflow call", "workflow P(x):\n\tworkflow Child(x) -> y%s\n\tclose complete(y)\n", "workflow_execution_timeout: 1h",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.WorkflowCall).Options
		}},
	{"detach workflow call", "workflow P(x):\n\tdetach workflow Child(x)%s\n\tclose complete(x)\n", "workflow_execution_timeout: 1h",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.WorkflowCall).Options
		}},
	{"nexus call", "workflow P(x):\n\tnexus Ep Svc.Op(x) -> y%s\n\tclose complete(y)\n", "schedule_to_close_timeout: 1m",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.NexusCall).Options
		}},
	{"detach nexus call", "workflow P(x):\n\tdetach nexus Ep Svc.Op(x)%s\n\tclose complete(x)\n", "schedule_to_close_timeout: 1m",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.NexusCall).Options
		}},
	{"client start", "nexus service Svc:\n\tsync Op(x) -> (R):\n\t\tworkflow Child(x) -> y%s\n\t\treturn y\n", "workflow_id_conflict_policy: FAIL",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.NexusServiceDef).Operations[0].Body[0].(*ast.WorkflowCall).Options
		}},
	{"namespace worker", "namespace ns:\n\tworker w%s\n\tworker v\n", `task_queue: "q"`,
		func(f *ast.File) *ast.OptionsBlock { return f.Definitions[0].(*ast.NamespaceDef).Workers[0].Options }},
	{"namespace endpoint", "namespace ns:\n\tnexus endpoint Ep%s\n\tworker v\n", `task_queue: "q"`,
		func(f *ast.File) *ast.OptionsBlock { return f.Definitions[0].(*ast.NamespaceDef).Endpoints[0].Options }},
}

// Comments may sit around a call's options: block as they may inside it: on
// their own lines above or below it, with blank lines between, or alone under
// the call (#301).
func TestCommentsAroundOptionsBlock(t *testing.T) {
	// Each layout follows the call line; {I} is the call's indent.
	layouts := []struct{ name, lines string }{
		{"own-line comment above", "\n{I}\t# note\n{I}\toptions:\n{I}\t\t%s"},
		{"comments and blank lines above", "\n{I}\t# one\n\n{I}\t# two\n\n{I}\toptions:\n{I}\t\t%s"},
		{"trailing and own-line comment above", " # trailing\n{I}\t# note\n{I}\toptions:\n{I}\t\t%s"},
		{"comment after the entries", "\n{I}\toptions:\n{I}\t\t%s\n{I}\t\t# after"},
		{"comment after the block", "\n{I}\toptions:\n{I}\t\t%s\n{I}\t# after"},
		{"comments above and below", "\n{I}\t# above\n{I}\toptions: # header\n{I}\t\t# first\n{I}\t\t%s # value\n\n{I}\t# below"},
		{"comment alone under the call", "\n{I}\t# note"},
	}
	for _, form := range optionsForms {
		// The call line is the one holding %s.
		line := form.src[strings.LastIndex(form.src[:strings.Index(form.src, "%s")], "\n")+1:]
		indent := line[:len(line)-len(strings.TrimLeft(line, "\t"))]
		for _, layout := range layouts {
			t.Run(form.name+"/"+layout.name, func(t *testing.T) {
				lines := strings.ReplaceAll(layout.lines, "{I}", indent)
				if strings.Contains(lines, "%s") {
					lines = fmt.Sprintf(lines, form.entry)
				}
				file, err := ParseFile(fmt.Sprintf(form.src, lines))
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				opts := form.options(file)
				switch {
				case !strings.Contains(layout.lines, "%s") && opts != nil:
					t.Errorf("options = %q, want none", optionEntries(opts))
				case strings.Contains(layout.lines, "%s") && (opts == nil || len(opts.Entries) != 1):
					t.Errorf("options = %q, want %q", optionEntries(opts), form.entry)
				}
			})
		}
	}
}

// Comment lines may sit above a handler's options: block or a definition's
// default_options: block. With no block below them, they stay in the body.
func TestCommentsAboveHeadOptions(t *testing.T) {
	forms := []struct {
		name, src, head, entry string
		parts                  func(*ast.File) (*ast.OptionsBlock, []ast.Statement)
	}{
		{"signal handler", "workflow P(x):\n\tsignal S(v):\n%s\t\treturn\n\tclose complete(x)\n", "\t\toptions", `description: "d"`,
			func(f *ast.File) (*ast.OptionsBlock, []ast.Statement) {
				s := f.Definitions[0].(*ast.WorkflowDef).Signals[0]
				return s.Options, s.Body
			}},
		{"update handler", "workflow P(x):\n\tupdate U(v) -> (R):\n%s\t\treturn v\n\tclose complete(x)\n", "\t\toptions", `description: "d"`,
			func(f *ast.File) (*ast.OptionsBlock, []ast.Statement) {
				u := f.Definitions[0].(*ast.WorkflowDef).Updates[0]
				return u.Options, u.Body
			}},
		{"query handler", "workflow P(x):\n\tquery Q() -> (R):\n%s\t\treturn x\n\tclose complete(x)\n", "\t\toptions", `description: "d"`,
			func(f *ast.File) (*ast.OptionsBlock, []ast.Statement) {
				q := f.Definitions[0].(*ast.WorkflowDef).Queries[0]
				return q.Options, q.Body
			}},
		{"activity default_options", "activity A(x):\n%s\treturn x\n", "\tdefault_options", "start_to_close_timeout: 1m",
			func(f *ast.File) (*ast.OptionsBlock, []ast.Statement) {
				a := f.Definitions[0].(*ast.ActivityDef)
				return a.DefaultOptions, a.Body
			}},
		{"workflow default_options", "workflow W(x):\n%s\tclose complete(x)\n", "\tdefault_options", "workflow_run_timeout: 1m",
			func(f *ast.File) (*ast.OptionsBlock, []ast.Statement) {
				w := f.Definitions[0].(*ast.WorkflowDef)
				return w.DefaultOptions, w.Body
			}},
	}
	for _, form := range forms {
		indent := form.head[:len(form.head)-len(strings.TrimLeft(form.head, "\t"))]
		t.Run(form.name+"/above the block", func(t *testing.T) {
			lines := fmt.Sprintf("%[1]s# one\n\n%[1]s# two\n%[2]s:\n%[1]s\t%[3]s\n%[1]s# body\n", indent, form.head, form.entry)
			file, err := ParseFile(fmt.Sprintf(form.src, lines))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			opts, body := form.parts(file)
			if opts == nil || len(opts.Entries) != 1 {
				t.Errorf("options = %q, want %q", optionEntries(opts), form.entry)
			}
			if form.name == "workflow default_options" {
				return // a workflow body drops the comments at its head, as before
			}
			if c, ok := body[0].(*ast.Comment); !ok || c.Text != " body" {
				t.Errorf("body[0] = %#v, want only the comment below the block", body[0])
			}
		})
		t.Run(form.name+"/no block", func(t *testing.T) {
			file, err := ParseFile(fmt.Sprintf(form.src, indent+"# one\n"+indent+"# two\n"))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			opts, body := form.parts(file)
			if opts != nil {
				t.Errorf("options = %q, want none", optionEntries(opts))
			}
			if form.name == "workflow default_options" {
				return // a workflow body drops the comments at its head, as before
			}
			var got []string
			for _, s := range body[:2] {
				if c, ok := s.(*ast.Comment); ok {
					got = append(got, c.Text)
				}
			}
			if strings.Join(got, ",") != " one, two" {
				t.Errorf("body = %#v, want the two comments first", body)
			}
		})
	}
}

// Under a call, a line that is neither a comment nor options: is an unexpected
// indent.
func TestCommentUnderCallThenOtherLine(t *testing.T) {
	tests := []struct{ name, src, want string }{
		{"statement", "workflow P(x):\n\tactivity A(x)\n\t\t# note\n\t\tactivity B(x)\n",
			"4:3 unexpected indent: only comments and one options: block sit under a call"},
		{"after the block", "workflow P(x):\n\tactivity A(x)\n\t\toptions:\n\t\t\tstart_to_close_timeout: 1m\n\t\t# note\n\t\tactivity B(x)\n",
			"6:3 unexpected indent: only comments and one options: block sit under a call"},
		{"address under a start", "workflow P(x):\n\tworkflow C(x)\n\t\t# note\n\t\tid: \"x\"\n",
			"4:3 a workflow start takes no id:; the ID derives from the started type's id_scheme"},
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
