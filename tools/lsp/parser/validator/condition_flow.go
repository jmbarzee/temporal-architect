package validator

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
)

// checkConditions reports, per workflow, each condition declared and never
// awaited, and each await of a condition that no set can precede. A set
// precedes an await when the await follows it, or a handler holds the set: a
// handler runs wherever its workflow yields, so its set precedes any await.
// Only conditions are read: a condition named in an expression counts for
// nothing.
func (v *validationCtx) checkConditions(defs []ast.Definition) {
	for _, def := range defs {
		d, ok := def.(*ast.WorkflowDef)
		if !ok || d.State == nil {
			continue
		}
		g := flow.Of(d)
		sets, awaits := map[*ast.ConditionDecl][]use{}, map[*ast.ConditionDecl][]use{}
		eachUse(g, func(u use) {
			switch s := u.stmt.(type) {
			case *ast.SetStmt:
				if c := s.Condition.Resolved; c != nil {
					sets[c] = append(sets[c], u)
				}
			case *ast.AwaitStmt:
				addAwait(s.Target, u, awaits)
			case *ast.AwaitOneCase:
				addAwait(s.Target, u, awaits)
			}
		})
		for _, c := range d.State.Conditions {
			if len(awaits[c]) == 0 {
				v.conditionError(d, c.Pos, "warning", fmt.Sprintf("condition %s is never awaited", c.Name), c.Name)
			}
			for _, a := range awaits[c] {
				if g.Reached(a.node()) && !setPrecedes(g, sets[c], a) {
					v.conditionError(d, ast.Pos{Line: a.stmt.NodeLine(), Column: a.stmt.NodeColumn()}, "error", fmt.Sprintf("condition %s is awaited but no set precedes it", c.Name), c.Name)
				}
			}
		}
	}
}

func (v *validationCtx) conditionError(d *ast.WorkflowDef, at ast.Pos, severity, msg, name string) {
	v.errs = append(v.errs, &Error{Msg: msg, Line: at.Line, Column: at.Column, Severity: severity, Kind: ErrConditionUnpaired, Name: name, File: d.SourceFile})
}

func addAwait(target ast.AsyncTarget, u use, awaits map[*ast.ConditionDecl][]use) {
	if t, ok := target.(*ast.IdentTarget); ok && t.Resolved.Condition != nil {
		awaits[t.Resolved.Condition] = append(awaits[t.Resolved.Condition], u)
	}
}

// setPrecedes reports whether any reached set can run before the await a.
func setPrecedes(g *flow.Graph, sets []use, a use) bool {
	for _, s := range sets {
		if g.Reached(s.node()) && (s.body.Context != ast.BodyWorkflow || follows(g, s, a)) {
			return true
		}
	}
	return false
}
