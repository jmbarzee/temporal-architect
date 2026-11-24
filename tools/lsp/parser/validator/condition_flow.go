package validator

import (
	"fmt"
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
)

// conditionUse is a set of a condition, or an await of it.
type conditionUse struct {
	stmt     ast.Statement
	body     *flow.Body
	parallel []branch // the await all branches around stmt, outermost first
}

// branch is one statement of an await all.
type branch struct {
	all *ast.AwaitAllBlock
	at  int
}

// checkConditions reports, per workflow, each condition declared and never
// awaited, and each await of a condition that no set can precede. A set
// precedes an await when a path leads from the set to it, the two run in
// different branches of one await all, or a handler holds the set: a handler
// runs wherever its workflow yields, so its set precedes any await, and a set
// in the workflow body precedes a handler's await when the body yields after
// it. Only conditions are read: a condition named in an expression counts for
// nothing.
func (v *validationCtx) checkConditions(defs []ast.Definition) {
	for _, def := range defs {
		d, ok := def.(*ast.WorkflowDef)
		if !ok || d.State == nil {
			continue
		}
		g := flow.Of(d)
		sets, awaits := map[*ast.ConditionDecl][]conditionUse{}, map[*ast.ConditionDecl][]conditionUse{}
		for _, b := range g.Bodies() {
			collectConditionUses(bodyStatements(b.Owner), b, nil, sets, awaits)
		}
		for _, c := range d.State.Conditions {
			if len(awaits[c]) == 0 {
				v.conditionError(d, c.Pos, "warning", fmt.Sprintf("condition %s is never awaited", c.Name), c.Name)
			}
			for _, a := range awaits[c] {
				if g.Reached(flow.Node{At: a.stmt}) && !precededBySet(g, a, sets[c]) {
					v.conditionError(d, ast.Pos{Line: a.stmt.NodeLine(), Column: a.stmt.NodeColumn()}, "error", fmt.Sprintf("condition %s is awaited but no set precedes it", c.Name), c.Name)
				}
			}
		}
	}
}

func (v *validationCtx) conditionError(d *ast.WorkflowDef, at ast.Pos, severity, msg, name string) {
	v.errs = append(v.errs, &Error{Msg: msg, Line: at.Line, Column: at.Column, Severity: severity, Kind: ErrConditionUnpaired, Name: name, File: d.SourceFile})
}

// collectConditionUses adds each set and await of a condition in stmts, a
// block of body b inside the await all branches in around.
func collectConditionUses(stmts []ast.Statement, b *flow.Body, around []branch, sets, awaits map[*ast.ConditionDecl][]conditionUse) {
	use := conditionUse{body: b, parallel: around}
	for _, s := range stmts {
		use.stmt = s
		switch s := s.(type) {
		case *ast.SetStmt:
			if c := s.Condition.Resolved; c != nil {
				sets[c] = append(sets[c], use)
			}
		case *ast.AwaitStmt:
			addAwait(s.Target, use, awaits)
		case *ast.AwaitOneCase:
			addAwait(s.Target, use, awaits)
		}
		var all *ast.AwaitAllBlock
		switch s := s.(type) {
		case *ast.AwaitAllBlock:
			all = s
		case *ast.AwaitOneCase:
			all = s.AwaitAll
		}
		for i, block := range ast.ChildBlocks(s) {
			if all == nil || i > 0 { // the first block of an await all is its branches
				collectConditionUses(block, b, around, sets, awaits)
				continue
			}
			for at, statement := range block {
				collectConditionUses([]ast.Statement{statement}, b, append(slices.Clone(around), branch{all, at}), sets, awaits)
			}
		}
	}
}

func addAwait(target ast.AsyncTarget, use conditionUse, awaits map[*ast.ConditionDecl][]conditionUse) {
	if t, ok := target.(*ast.IdentTarget); ok && t.Resolved.Condition != nil {
		awaits[t.Resolved.Condition] = append(awaits[t.Resolved.Condition], use)
	}
}

// precededBySet reports whether any reached set can run before the await a.
func precededBySet(g *flow.Graph, a conditionUse, sets []conditionUse) bool {
	for _, s := range sets {
		n := flow.Node{At: s.stmt}
		if !g.Reached(n) {
			continue
		}
		switch {
		case s.body.Context != ast.BodyWorkflow:
			return true // a handler runs wherever its workflow yields
		case siblings(s.parallel, a.parallel), g.Follows(n)[flow.Node{At: a.stmt}]:
			return true
		case a.body != s.body && yieldsAfter(g, g.Bodies()[0], n):
			return true // a handler's await, after a body yield that follows the set
		}
	}
	return false
}

// siblings reports whether two uses run in different branches of one await all.
func siblings(a, b []branch) bool {
	for _, x := range a {
		for _, y := range b {
			if x.all == y.all && x.at != y.at {
				return true
			}
		}
	}
	return false
}

// yieldsAfter reports whether a run can yield in b after n.
func yieldsAfter(g *flow.Graph, b *flow.Body, n flow.Node) bool {
	after := g.Follows(n)
	for _, y := range g.Yields(b) {
		if after[y] {
			return true
		}
	}
	return false
}
