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
	{"activity call", "workflow P(x):\n    activity A(x) -> y%s\n    close complete(y)\n", "start_to_close_timeout: 1m",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.ActivityCall).Options
		}},
	{"workflow call", "workflow P(x):\n    workflow Child(x) -> y%s\n    close complete(y)\n", "workflow_execution_timeout: 1h",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.WorkflowCall).Options
		}},
	{"detach workflow call", "workflow P(x):\n    detach workflow Child(x)%s\n    close complete(x)\n", "workflow_execution_timeout: 1h",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.WorkflowCall).Options
		}},
	{"nexus call", "workflow P(x):\n    nexus Ep Svc.Op(x) -> y%s\n    close complete(y)\n", "schedule_to_close_timeout: 1m",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.NexusCall).Options
		}},
	{"detach nexus call", "workflow P(x):\n    detach nexus Ep Svc.Op(x)%s\n    close complete(x)\n", "schedule_to_close_timeout: 1m",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.NexusCall).Options
		}},
	{"client start", "nexus service Svc:\n    sync Op(x) -> (R):\n        workflow Child(x) -> y%s\n        return y\n", "workflow_id_conflict_policy: FAIL",
		func(f *ast.File) *ast.OptionsBlock {
			return f.Definitions[0].(*ast.NexusServiceDef).Operations[0].Body[0].(*ast.WorkflowCall).Options
		}},
	{"namespace worker", "namespace ns:\n    worker w%s\n    worker v\n", `task_queue: "q"`,
		func(f *ast.File) *ast.OptionsBlock { return f.Definitions[0].(*ast.NamespaceDef).Workers[0].Options }},
	{"namespace endpoint", "namespace ns:\n    nexus endpoint Ep%s\n    worker v\n", `task_queue: "q"`,
		func(f *ast.File) *ast.OptionsBlock { return f.Definitions[0].(*ast.NamespaceDef).Endpoints[0].Options }},
}

// Comments may sit around a call's options: block as they may inside it: on
// their own lines above or below it, with blank lines between, or alone under
// the call (#301).
func TestCommentsAroundOptionsBlock(t *testing.T) {
	// Each layout follows the call line; {I} is the call's indent.
	layouts := []struct{ name, lines string }{
		{"own-line comment above", "\n{I}    # note\n{I}    options:\n{I}        %s"},
		{"comments and blank lines above", "\n{I}    # one\n\n{I}    # two\n\n{I}    options:\n{I}        %s"},
		{"trailing and own-line comment above", " # trailing\n{I}    # note\n{I}    options:\n{I}        %s"},
		{"comment after the entries", "\n{I}    options:\n{I}        %s\n{I}        # after"},
		{"comment after the block", "\n{I}    options:\n{I}        %s\n{I}    # after"},
		{"comments above and below", "\n{I}    # above\n{I}    options: # header\n{I}        # first\n{I}        %s # value\n\n{I}    # below"},
		{"comment alone under the call", "\n{I}    # note"},
	}
	for _, form := range optionsForms {
		// The call line is the one holding %s.
		line := form.src[strings.LastIndex(form.src[:strings.Index(form.src, "%s")], "\n")+1:]
		indent := line[:len(line)-len(strings.TrimLeft(line, " "))]
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

// Under a call, a comment still leads only to options: or the end of the call.
func TestCommentUnderCallThenOtherLine(t *testing.T) {
	tests := []struct{ name, src, want string }{
		{"statement", "workflow P(x):\n    activity A(x)\n        # note\n        activity B(x)\n",
			`4:9 expected options: or a comment, got ACTIVITY ("activity")`},
		{"after the block", "workflow P(x):\n    activity A(x)\n        options:\n            start_to_close_timeout: 1m\n        # note\n        activity B(x)\n",
			`6:9 expected the end of the options block, got ACTIVITY ("activity")`},
		{"address under a start", "workflow P(x):\n    workflow C(x)\n        # note\n        id: \"x\"\n",
			"4:9 a workflow start takes no id:; the ID derives from the started type's id_scheme"},
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
