package parser

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// TestStartOptionsByKind pins which keys each workflow start kind accepts: a
// child start (workflow body or handler) carries no conflict policy; a client
// start (sync nexus operation body) carries no parent_close_policy.
func TestStartOptionsByKind(t *testing.T) {
	tests := []struct {
		name  string
		input string
		code  string // "" means the input parses cleanly
	}{
		{"conflict policy in workflow defaults", `workflow W(a: A):
    default_options:
        workflow_id_conflict_policy: USE_EXISTING
    close complete()
`, ""},
		{"conflict policy at a client start", `nexus service Svc:
    sync Op(a: A) -> (R):
        workflow T(a) -> r
            options:
                workflow_id_conflict_policy: TERMINATE_EXISTING
        close complete(r)
`, ""},
		{"conflict policy at a detached client start", `nexus service Svc:
    sync Op(a: A) -> (R):
        detach workflow T(a)
            options:
                workflow_id_conflict_policy: FAIL
        close complete(a)
`, ""},
		{"parent_close_policy at a child start", `workflow W(a: A):
    workflow T(a)
        options:
            parent_close_policy: ABANDON
`, ""},
		{"conflict policy at a child start", `workflow W(a: A):
    workflow T(a)
        options:
            workflow_id_conflict_policy: USE_EXISTING
`, CodeOptionMisplaced},
		{"conflict policy at a detached child start", `workflow W(a: A):
    detach workflow T(a)
        options:
            workflow_id_conflict_policy: USE_EXISTING
`, CodeOptionMisplaced},
		{"conflict policy at a child start in a handler", `workflow W(a: A):
    signal Go():
        workflow T(a)
            options:
                workflow_id_conflict_policy: USE_EXISTING
    close complete()
`, CodeOptionMisplaced},
		{"parent_close_policy at a client start", `nexus service Svc:
    sync Op(a: A) -> (R):
        workflow T(a) -> r
            options:
                parent_close_policy: ABANDON
        close complete(r)
`, CodeOptionMisplaced},
		{"parent_close_policy in workflow defaults", `workflow W(a: A):
    default_options:
        parent_close_policy: TERMINATE
    close complete()
`, CodeOptionMisplaced},
		{"workflow_id at a client start", `nexus service Svc:
    sync Op(a: A) -> (R):
        workflow T(a) -> r
            options:
                workflow_id: "t"
        close complete(r)
`, CodeIDAtStart},
		{"workflow_id in workflow defaults", `workflow W(a: A):
    default_options:
        workflow_id: "t"
    close complete()
`, CodeIDAtStart},
		{"conflict policy in activity defaults", `activity Do(a: A):
    default_options:
        workflow_id_conflict_policy: FAIL
    return a
`, CodeSyntax},
		{"child start after a sync body", `nexus service Svc:
    sync Op(a: A) -> (R):
        close complete(a)

workflow W(a: A):
    workflow T(a)
        options:
            workflow_id_conflict_policy: USE_EXISTING
`, CodeOptionMisplaced},
		{"TERMINATE_IF_RUNNING at a child start", `workflow W(a: A):
    workflow T(a)
        options:
            workflow_id_reuse_policy: TERMINATE_IF_RUNNING
`, CodeSyntax},
		{"TERMINATE_IF_RUNNING in workflow defaults", `workflow W(a: A):
    default_options:
        workflow_id_reuse_policy: TERMINATE_IF_RUNNING
    close complete()
`, CodeSyntax},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, errs := ParseFileAll(tt.input)
			if tt.code == "" {
				if len(errs) > 0 {
					t.Fatalf("expected a clean parse, got %v", errs)
				}
				return
			}
			for _, e := range errs {
				if e.Code() == tt.code {
					return
				}
			}
			t.Fatalf("expected %s, got %v", tt.code, errs)
		})
	}
}

// TestOptionValueErrorPosition pins option value errors at the value token,
// not the token after it.
func TestOptionValueErrorPosition(t *testing.T) {
	tests := []struct {
		name  string
		input string
		col   int
	}{
		{"invalid enum value", `workflow W(a: A):
    default_options:
        workflow_id_reuse_policy: TERMINATE_IF_RUNNING
    close complete()
`, 35},
		{"string for a duration", `workflow W(a: A):
    default_options:
        workflow_run_timeout: "1h"
    close complete()
`, 31},
		{"number for an enum", `workflow W(a: A):
    default_options:
        workflow_id_conflict_policy: 3
    close complete()
`, 38},
		{"bool for a string", `workflow W(a: A):
    default_options:
        task_queue: true
    close complete()
`, 21},
		{"list for a duration", `workflow W(a: A):
    default_options:
        workflow_run_timeout: ["1h"]
    close complete()
`, 31},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, errs := ParseFileAll(tt.input)
			if len(errs) == 0 {
				t.Fatal("expected a value error")
			}
			if got := errs[0]; got.Line != 3 || got.Column != tt.col {
				t.Errorf("error at %d:%d, want 3:%d: %v", got.Line, got.Column, tt.col, got)
			}
		})
	}
}

// TestWorkflowStartKind pins the start kind the parser records: a client start
// in a sync nexus operation body, a child start anywhere else.
func TestWorkflowStartKind(t *testing.T) {
	file, errs := ParseFileAll(`workflow W(a: A):
    signal Go():
        detach workflow T(a)
    update Up() -> (R):
        workflow T(a) -> r
        return r
    workflow T(a)
    promise p <- workflow T(a)
    close complete()

nexus service Svc:
    sync Op(a: A) -> (R):
        workflow T(a) -> r
        detach workflow T(a)
        await workflow T(a)
        await one:
            workflow T(a):
                close complete(r)
            timer(1m):
                close complete(r)
        close complete(r)
`)
	if len(errs) > 0 {
		t.Fatalf("parse: %v", errs)
	}
	var got []ast.StartKind
	collect := func(body []ast.Statement) {
		ast.WalkStatements(body, func(s ast.Statement) bool {
			if call, ok := s.(*ast.WorkflowCall); ok {
				got = append(got, call.Start)
			}
			return true
		}, ast.WithAsyncTargets(func(target ast.AsyncTarget, _ ast.Statement) bool {
			if wt, ok := target.(*ast.WorkflowTarget); ok {
				got = append(got, wt.Start)
			}
			return true
		}))
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	collect(wf.Body)
	collect(wf.Signals[0].Body)
	collect(wf.Updates[0].Body)
	collect(file.Definitions[1].(*ast.NexusServiceDef).Operations[0].Body)
	want := []ast.StartKind{
		ast.StartChild, ast.StartChild, // workflow body: plain, promise
		ast.StartChild,                                                     // signal handler: detach
		ast.StartChild,                                                     // update handler: plain
		ast.StartClient, ast.StartClient, ast.StartClient, ast.StartClient, // sync body: plain, detach, await, await-one case
	}
	if len(got) != len(want) {
		t.Fatalf("got %d starts, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("start %d kind = %d, want %d", i, got[i], want[i])
		}
	}
}
