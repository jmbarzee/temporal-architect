package validator

import (
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
)

// use is a statement of a workflow's flow graph, in the body that holds it.
type use struct {
	stmt     ast.Statement
	body     *flow.Body
	parallel []branch // the await all branches around stmt, outermost first
}

// branch is one statement of an await all.
type branch struct {
	all *ast.AwaitAllBlock
	at  int
}

func (u use) node() flow.Node { return flow.Node{At: u.stmt} }

// eachUse calls visit on every statement of g's bodies, nested ones after
// their parent, each body in its source order.
func eachUse(g *flow.Graph, visit func(use)) {
	for _, b := range g.Bodies() {
		visitBlock(bodyStatements(b.Owner), use{body: b}, visit)
	}
}

func visitBlock(stmts []ast.Statement, in use, visit func(use)) {
	for _, s := range stmts {
		in.stmt = s
		visit(in)
		var all *ast.AwaitAllBlock
		switch s := s.(type) {
		case *ast.AwaitAllBlock:
			all = s
		case *ast.AwaitOneCase:
			all = s.AwaitAll
		}
		for i, block := range ast.ChildBlocks(s) {
			if all == nil || i > 0 { // the first block of an await all is its branches
				visitBlock(block, in, visit)
				continue
			}
			for at, branchStmt := range block {
				inBranch := in
				inBranch.parallel = append(slices.Clone(in.parallel), branch{all, at})
				visitBlock([]ast.Statement{branchStmt}, inBranch, visit)
			}
		}
	}
}

// follows reports whether a run can reach b after a: along a flow path, from
// a sibling branch of an await all, or, when a is in the workflow body, in a
// handler that runs at a yield following it.
func follows(g *flow.Graph, a, b use) bool {
	if g.Follows(a.node())[b.node()] || siblings(a.parallel, b.parallel) {
		return true
	}
	if a.body == b.body || a.body.Context != ast.BodyWorkflow {
		return false
	}
	after := g.Follows(a.node())
	return slices.ContainsFunc(g.Yields(a.body), func(y flow.Node) bool { return after[y] })
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
