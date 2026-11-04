package resolver

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

const promiseScopeTargets = `
workflow Q(id: string) -> (string):
	signal Go():
		go = true
	close complete(id)

workflow R(id: string) -> (string):
	signal Go():
		go = true
	close complete(id)
`

// TestPromiseScope pins promise scope: a promise is in scope from its binding
// to the end of the block that binds it, nested blocks included; a handler sees
// the promises bound at the top level of its workflow body.
func TestPromiseScope(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		undefined bool
	}{
		{"top level of a workflow body", `workflow P(id: string):
	promise p <- workflow Q(id)
	await p -> r
	close complete()
`, false},
		{"nested block in a workflow body", `workflow P(id: string, flag: bool):
	if (flag):
		promise p <- workflow Q(id)
		await p -> r
	close complete()
`, false},
		{"outer promise in a nested block", `workflow P(id: string, flag: bool):
	promise p <- workflow Q(id)
	if (flag):
		await p -> r
	close complete()
`, false},
		{"handler body", `workflow P(id: string):
	update Go(x: string) -> (string):
		promise u <- workflow Q(x)
		await u -> r
		return r
	close complete()
`, false},
		{"handler sees a top-level body promise", `workflow P(id: string):
	signal Stop():
		await p
	promise p <- workflow Q(id)
	close complete()
`, false},
		{"sync nexus operation body", `nexus service Svc:
	sync Op(id: string) -> (string):
		promise p <- workflow Q(id)
		await p -> r
		close complete(r)
`, false},
		{"use after the block that binds it", `workflow P(id: string, flag: bool):
	if (flag):
		promise p <- workflow Q(id)
	await p
	close complete()
`, true},
		{"use in a sibling branch", `workflow P(id: string, flag: bool):
	if (flag):
		promise p <- workflow Q(id)
	else:
		await p
	close complete()
`, true},
		{"use before the binding", `workflow P(id: string):
	await p
	promise p <- workflow Q(id)
	close complete()
`, true},
		{"use in a sibling switch case", `workflow P(id: string, kind: string):
	switch (kind):
		case "a":
			promise p <- workflow Q(id)
		case "b":
			await p
	close complete()
`, true},
		{"use in a sibling await-one case", `workflow P(id: string):
	await one:
		signal Go:
			promise p <- workflow Q(id)
		timer(1m):
			await p
	close complete()
`, true},
		{"use after a for body", `workflow P(ids: Ids):
	for (id in ids):
		promise p <- workflow Q(id)
	await p
	close complete()
`, true},
		{"workflow body does not see a handler's promise", `workflow P(id: string):
	update Go(x: string) -> (string):
		promise u <- workflow Q(x)
		await u -> r
		return r
	await u
	close complete()
`, true},
		{"handler does not see a nested body promise", `workflow P(id: string, flag: bool):
	signal Stop():
		await p
	if (flag):
		promise p <- workflow Q(id)
	close complete()
`, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var undefined []*ResolveError
			for _, e := range Resolve(mustParse(t, tt.input+promiseScopeTargets)) {
				if e.Kind == ErrUndefinedPromiseOrCondition {
					undefined = append(undefined, e)
				}
			}
			if got := len(undefined) > 0; got != tt.undefined {
				t.Errorf("UNDEFINED_PROMISE_OR_CONDITION present = %v, want %v: %v", got, tt.undefined, undefined)
			}
		})
	}
}

// TestPromiseHandleResolution pins which binding a signal-send handle resolves
// to, and that its workflow target is linked.
func TestPromiseHandleResolution(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		wantTarget string // workflow the send's handle starts
	}{
		{"same name in sibling branches", `workflow P(id: string, flag: bool):
	if (flag):
		promise p <- workflow Q(id)
		signal p.Go()
	else:
		promise p <- workflow R(id)
	close complete()
`, "Q"},
		{"a later binding shadows an earlier one", `workflow P(id: string):
	promise p <- workflow Q(id)
	await p
	promise p <- workflow R(id)
	signal p.Go()
	close complete()
`, "R"},
		{"an inner shadow does not leak", `workflow P(id: string, flag: bool):
	promise p <- workflow Q(id)
	if (flag):
		promise p <- workflow R(id)
		await p
	signal p.Go()
	close complete()
`, "Q"},
		{"handler send to a body promise", `workflow P(id: string):
	signal Stop():
		signal p.Go()
	promise p <- workflow Q(id)
	close complete()
`, "Q"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := mustParse(t, tt.input+promiseScopeTargets)
			if errs := Resolve(file); len(errs) > 0 {
				t.Fatalf("unexpected resolve errors: %v", errs)
			}
			p := file.Definitions[0].(*ast.WorkflowDef)
			bodies := [][]ast.Statement{p.Body}
			for _, s := range p.Signals {
				bodies = append(bodies, s.Body)
			}
			var send *ast.SignalSendStmt
			for _, body := range bodies {
				ast.WalkStatements(body, func(s ast.Statement) bool {
					if ss, ok := s.(*ast.SignalSendStmt); ok {
						send = ss
					}
					return true
				})
			}
			if send == nil || send.Head.Handle.Resolved == nil {
				t.Fatalf("send handle not resolved: %+v", send)
			}
			wt, ok := send.Head.Handle.Resolved.Target.(*ast.WorkflowTarget)
			if !ok || wt.Workflow.Resolved == nil {
				t.Fatalf("handle target not a resolved workflow: %+v", send.Head.Handle.Resolved.Target)
			}
			if got := wt.Workflow.Resolved.Name; got != tt.wantTarget {
				t.Errorf("handle starts %s, want %s", got, tt.wantTarget)
			}
		})
	}
}
