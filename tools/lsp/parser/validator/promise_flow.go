package validator

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
)

// checkPromises warns, per workflow, on each promise that no await, race or
// signal send reached after its binding takes: its result is lost and its
// failure unseen. A promise awaited out of its scope is the resolver's
// UNDEFINED_PROMISE_OR_CONDITION, so every use seen here is in scope. A
// signal sent to a promise's workflow counts as a use, as the handle it is.
func (v *validationCtx) checkPromises(defs []ast.Definition) {
	for _, def := range defs {
		d, ok := def.(*ast.WorkflowDef)
		if !ok {
			continue
		}
		g := flow.Of(d)
		var promises []use
		takes := map[*ast.PromiseStmt][]use{}
		eachUse(g, func(u use) {
			switch s := u.stmt.(type) {
			case *ast.PromiseStmt:
				promises = append(promises, u)
			case *ast.AwaitStmt:
				addTake(s.Target, u, takes)
			case *ast.AwaitOneCase:
				addTake(s.Target, u, takes)
			case *ast.SignalSendStmt:
				if p := s.Head.Handle.Resolved; s.Head.Kind == ast.SendHeadHandle && p != nil {
					takes[p] = append(takes[p], u)
				}
			}
		})
		for _, p := range promises {
			bound := p.stmt.(*ast.PromiseStmt)
			if !takenAfter(g, p, takes[bound]) {
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("promise %s is never awaited", bound.Name),
					Line:     p.stmt.NodeLine(),
					Column:   p.stmt.NodeColumn(),
					Severity: "warning",
					Kind:     ErrPromiseNeverAwaited,
					Name:     bound.Name,
					File:     d.SourceFile,
				})
			}
		}
	}
}

func addTake(target ast.AsyncTarget, u use, takes map[*ast.PromiseStmt][]use) {
	if t, ok := target.(*ast.IdentTarget); ok && t.Resolved.Promise != nil {
		takes[t.Resolved.Promise] = append(takes[t.Resolved.Promise], u)
	}
}

// takenAfter reports whether a reached use can run after the promise p binds.
func takenAfter(g *flow.Graph, p use, takes []use) bool {
	if !g.Reached(p.node()) {
		return true // dead code is no promise's fault
	}
	for _, t := range takes {
		if g.Reached(t.node()) && follows(g, p, t) {
			return true
		}
	}
	return false
}
