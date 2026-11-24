package validator

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
)

// checkUnboundedLoops warns, per workflow, on each reached for with no
// condition that no reached statement in it leaves: a break of it, a return,
// or a close, `close continue_as_new` among them. Such a loop grows its
// history without bound, and no path in it resets the history or ends the run.
func (v *validationCtx) checkUnboundedLoops(defs []ast.Definition) {
	for _, def := range defs {
		d, ok := def.(*ast.WorkflowDef)
		if !ok {
			continue
		}
		g := flow.Of(d)
		bodies := [][]ast.Statement{d.Body}
		for _, h := range d.Signals {
			bodies = append(bodies, h.Body)
		}
		for _, h := range d.Updates {
			bodies = append(bodies, h.Body)
		}
		for _, body := range bodies {
			ast.WalkStatements(body, func(s ast.Statement) bool {
				if f, ok := s.(*ast.ForStmt); ok && f.Variant == ast.ForInfinite && g.Reached(flow.Node{At: f}) && !leaves(g, f.Body, false) {
					v.errs = append(v.errs, &Error{
						Msg:      "for without a condition never exits and never continues as new; history grows without bound",
						Line:     f.Line,
						Column:   f.Column,
						Severity: "warning",
						Kind:     ErrUnboundedLoop,
						File:     d.SourceFile,
					})
				}
				return true
			})
		}
	}
}

// leaves reports whether a reached statement of body, nested blocks included,
// leaves the for that holds it. A break inside an inner for leaves only that
// one, which inner says body is in.
func leaves(g *flow.Graph, body []ast.Statement, inner bool) bool {
	for _, s := range body {
		if g.Reached(flow.Node{At: s}) {
			switch s.(type) {
			case *ast.CloseStmt, *ast.ReturnStmt:
				return true
			case *ast.BreakStmt:
				if !inner {
					return true
				}
			}
		}
		_, isFor := s.(*ast.ForStmt)
		for _, block := range ast.ChildBlocks(s) {
			if leaves(g, block, inner || isFor) {
				return true
			}
		}
	}
	return false
}
