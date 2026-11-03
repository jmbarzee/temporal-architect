package validator

import (
	"fmt"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

func TestIDPolicyDiagnostics(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		kind     ErrorKind
		severity string
		want     bool
	}{
		{"defaults pair TERMINATE_EXISTING with REJECT_DUPLICATE", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_reuse_policy: REJECT_DUPLICATE
        workflow_id_conflict_policy: TERMINATE_EXISTING
    close complete()
`, ErrIDPolicyIncompatible, "", true},
		{"client start overrides reuse into the pair", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: TERMINATE_EXISTING
    close complete()

nexus service Svc:
    sync Op(a: A) -> (R):
        workflow Q(a) -> r
            options:
                workflow_id_reuse_policy: REJECT_DUPLICATE
        close complete(r)
`, ErrIDPolicyIncompatible, "", true},
		{"client start overrides conflict into the pair", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_reuse_policy: REJECT_DUPLICATE
    close complete()

nexus service Svc:
    sync Op(a: A) -> (R):
        workflow Q(a) -> r
            options:
                workflow_id_conflict_policy: TERMINATE_EXISTING
        close complete(r)
`, ErrIDPolicyIncompatible, "", true},
		{"child start overriding reuse never makes the pair", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: TERMINATE_EXISTING
    close complete()

workflow P(a: A):
    workflow Q(a)
        options:
            workflow_id_reuse_policy: REJECT_DUPLICATE
    close complete()
`, ErrIDPolicyIncompatible, "", false},
		{"conflict policy without a scheme", `
workflow Q(a: A):
    default_options:
        workflow_id_conflict_policy: USE_EXISTING
    close complete()
`, ErrIDPolicyWithoutIDScheme, "hint", true},
		{"reuse policy at a child start without a scheme", `
workflow Q(a: A):
    close complete()

workflow P(a: A):
    workflow Q(a)
        options:
            workflow_id_reuse_policy: REJECT_DUPLICATE
    close complete()
`, ErrIDPolicyWithoutIDScheme, "hint", true},
		{"policy with a scheme", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_reuse_policy: REJECT_DUPLICATE
    close complete()
`, ErrIDPolicyWithoutIDScheme, "hint", false},
		{"child start of a joining type", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: USE_EXISTING
    close complete()

workflow P(a: A):
    workflow Q(a)
    close complete()
`, ErrChildStartConflictMismatch, "hint", true},
		{"promise child start of a replacing type", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: TERMINATE_EXISTING
    close complete()

workflow P(a: A):
    promise q <- workflow Q(a)
    await q
    close complete()
`, ErrChildStartConflictMismatch, "hint", true},
		{"child start of a FAIL type", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: FAIL
    close complete()

workflow P(a: A):
    workflow Q(a)
    close complete()
`, ErrChildStartConflictMismatch, "hint", false},
		{"child start of an unschemed joining type", `
workflow Q(a: A):
    default_options:
        workflow_id_conflict_policy: USE_EXISTING
    close complete()

workflow P(a: A):
    workflow Q(a)
    close complete()
`, ErrChildStartConflictMismatch, "hint", false},
		{"client start of a joining type", `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: USE_EXISTING
    close complete()

nexus service Svc:
    sync Op(a: A) -> (R):
        workflow Q(a) -> r
        close complete(r)
`, ErrChildStartConflictMismatch, "hint", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := Validate(mustParseAndResolve(t, tt.input))
			if got := hasKind(errs, tt.kind, tt.severity); got != tt.want {
				t.Errorf("%s present = %v, want %v; got %v", tt.kind, got, tt.want, errs)
			}
		})
	}
}

// TestChildStartConflictMismatchPosition pins the hint for a promise-bound
// child start at the statement holding it, since a target has no position.
func TestChildStartConflictMismatchPosition(t *testing.T) {
	errs := Validate(mustParseAndResolve(t, `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        workflow_id_conflict_policy: USE_EXISTING
    close complete()

workflow P(a: A):
    promise q <- workflow Q(a)
    await q
    close complete()
`))
	for _, e := range errs {
		if e.Kind == ErrChildStartConflictMismatch {
			if e.Line != 9 || e.Column != 5 {
				t.Errorf("hint at %d:%d, want 9:5", e.Line, e.Column)
			}
			return
		}
	}
	t.Fatalf("expected CHILD_START_CONFLICT_MISMATCH, got %v", errs)
}

// TestIDPolicyIncompatibleReport pins where ID_POLICY_INCOMPATIBLE reports and
// which side of the merge its message names.
func TestIDPolicyIncompatibleReport(t *testing.T) {
	const target = `
workflow Q(a: A):
    id_scheme: "q-{a.id}"
    default_options:
        %s
    close complete()

nexus service Svc:
    sync Op(a: A) -> (R):
        workflow %s(a) -> r
            options:
                %s
                %s
        close complete(r)
`
	tests := []struct {
		name             string
		defaults, callee string
		call1, call2     string
		want             int // number of ID_POLICY_INCOMPATIBLE errors
		line, col        int // of the first one
		msg              string
	}{
		{"defaults pair", "workflow_id_reuse_policy: REJECT_DUPLICATE\n        workflow_id_conflict_policy: TERMINATE_EXISTING", "Q",
			"task_queue: \"q\"", "priority:\n                    priority_key: 1", 1, 6, 9, "Q's default_options pair"},
		{"call-site reuse meets default conflict", "workflow_id_conflict_policy: TERMINATE_EXISTING", "Q",
			"task_queue: \"q\"", "workflow_id_reuse_policy: REJECT_DUPLICATE", 1, 13, 17, "this start's workflow_id_reuse_policy: REJECT_DUPLICATE meets Q's default workflow_id_conflict_policy"},
		{"call-site conflict meets default reuse", "workflow_id_reuse_policy: REJECT_DUPLICATE", "Q",
			"task_queue: \"q\"", "workflow_id_conflict_policy: TERMINATE_EXISTING", 1, 13, 17, "this start's workflow_id_conflict_policy: TERMINATE_EXISTING meets Q's default workflow_id_reuse_policy"},
		{"both at the call site", "task_queue: \"q\"", "Q",
			"workflow_id_conflict_policy: TERMINATE_EXISTING", "workflow_id_reuse_policy: REJECT_DUPLICATE", 1, 12, 17, "this start pairs"},
		{"unresolved callee", "task_queue: \"q\"", "Missing",
			"workflow_id_conflict_policy: TERMINATE_EXISTING", "workflow_id_reuse_policy: REJECT_DUPLICATE", 0, 0, 0, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, perr := parser.ParseFile(fmt.Sprintf(target, tt.defaults, tt.callee, tt.call1, tt.call2))
			if perr != nil {
				t.Fatalf("parse: %v", perr)
			}
			resolver.Resolve(file)
			var got []*Error
			for _, e := range Validate(file) {
				if e.Kind == ErrIDPolicyIncompatible {
					got = append(got, e)
				}
			}
			if len(got) != tt.want {
				t.Fatalf("got %d ID_POLICY_INCOMPATIBLE, want %d: %v", len(got), tt.want, got)
			}
			if tt.want == 0 {
				return
			}
			if e := got[0]; e.Line != tt.line || e.Column != tt.col || !strings.Contains(e.Msg, tt.msg) {
				t.Errorf("got %d:%d %q, want %d:%d containing %q", e.Line, e.Column, e.Msg, tt.line, tt.col, tt.msg)
			}
		})
	}
}
