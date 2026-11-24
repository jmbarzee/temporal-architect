package validator

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
)

// checkUnreachable reports, per workflow, activity and sync Nexus operation,
// each statement no path reaches: one after a close, return, break or continue
// that every path before it takes, or after a loop that never ends. A
// statement nested in an unreachable one is covered by its report. Handlers
// start at their Entry, which a run reaches wherever its workflow yields.
func (v *validationCtx) checkUnreachable(defs []ast.Definition) {
	for _, def := range defs {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			v.unreachableIn(d, d.SourceFile)
		case *ast.ActivityDef:
			v.unreachableIn(d, d.SourceFile)
		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				v.unreachableIn(op, d.SourceFile)
			}
		}
	}
}

func (v *validationCtx) unreachableIn(def ast.Node, file string) {
	g := flow.Of(def)
	if g == nil {
		return
	}
	for _, b := range g.Bodies() {
		v.unreachableStmts(g, bodyStatements(b.Owner), file)
	}
}

func (v *validationCtx) unreachableStmts(g *flow.Graph, stmts []ast.Statement, file string) {
	for _, s := range stmts {
		if _, ok := s.(*ast.Comment); ok {
			continue
		}
		if !g.Reached(flow.Node{At: s}) {
			v.errs = append(v.errs, &Error{
				Msg:      "statement is unreachable: no path leads to it",
				Line:     s.NodeLine(),
				Column:   s.NodeColumn(),
				Severity: "hint",
				Kind:     ErrUnreachableStatement,
				File:     file,
			})
			continue
		}
		for _, block := range ast.ChildBlocks(s) {
			v.unreachableStmts(g, block, file)
		}
	}
}
