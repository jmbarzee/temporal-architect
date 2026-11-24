package flow

import (
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// Multiplicity is how often a node runs.
type Multiplicity int

const (
	One     Multiplicity = iota // at most once per run of its body
	Many                        // on a for's cycle
	Unknown                     // in a handler: once per arrival
)

// Bodies returns the definition's own body, then each handler's.
func (g *Graph) Bodies() []*Body { return g.bodies }

// Out returns the edges leaving n, in source order.
func (g *Graph) Out(n Node) []Edge { return g.out[n] }

// In returns the edges arriving at n.
func (g *Graph) In(n Node) []Edge { return g.in[n] }

// Reached reports whether a run can arrive at n; at a Join, only once every
// branch of its await all can.
func (g *Graph) Reached(n Node) bool { return g.reached[n] }

// Follows returns n and what a run can arrive at after it, along every edge:
// a Join is passed on one branch's arrival, as the others run too.
func (g *Graph) Follows(n Node) map[Node]bool {
	return g.walk([]Node{n}, false, func(Edge) bool { return true })
}

// Yields returns where a handler may run during b: its Entry, every await,
// await one and Join, and every attached call; nothing in a body no handler
// interleaves with, an activity's, a query's or a sync nexus operation's.
func (g *Graph) Yields(b *Body) []Node {
	switch b.Context {
	case ast.BodyWorkflow, ast.BodySignalHandler, ast.BodyUpdateHandler:
	default:
		return nil
	}
	return slices.DeleteFunc(slices.Clone(b.nodes), func(n Node) bool { return !yields(n) })
}

func yields(n Node) bool {
	if n.Port != Stmt {
		return n.Port == Entry || n.Port == Join
	}
	switch s := n.At.(type) {
	case *ast.AwaitStmt, *ast.AwaitOneBlock, *ast.ActivityCall:
		return true
	case *ast.WorkflowCall:
		return s.Mode == ast.CallAttached
	case *ast.NexusCall:
		return !s.Detach
	}
	return false
}

// Loop returns the innermost for whose cycle holds n, or nil. A for that
// every run leaves before its back edge holds nothing.
func (g *Graph) Loop(n Node) *ast.ForStmt { return g.loop[n] }

// Back reports whether e enters a for from its own body.
func (g *Graph) Back(e Edge) bool { return g.inside[e.To][e.From] }

// Multiplicity returns how often n runs.
func (g *Graph) Multiplicity(n Node) Multiplicity {
	switch g.body[n].Context {
	case ast.BodySignalHandler, ast.BodyUpdateHandler, ast.BodyQueryHandler:
		return Unknown
	}
	if g.loop[n] != nil {
		return Many
	}
	return One
}

// Arms returns the Then, Else, Case, Default, Wins and Branch edges that
// every path from n's body's Entry to n takes, outermost first.
func (g *Graph) Arms(n Node) []Edge {
	b := g.body[n]
	from := []Node{b.Entry}
	if !g.reach(from, func(Edge) bool { return true })[n] {
		return nil
	}
	var arms []Edge
	without := map[Edge]map[Node]bool{} // what each arm's absence leaves reachable
	for _, m := range b.nodes {
		for _, e := range g.out[m] {
			if !e.Kind.arm() {
				continue
			}
			if rest := g.reach(from, func(x Edge) bool { return x != e }); !rest[n] {
				arms = append(arms, e)
				without[e] = rest
			}
		}
	}
	slices.SortFunc(arms, func(a, b Edge) int {
		switch {
		case a == b:
			return 0
		case !without[a][b.From]:
			return -1
		}
		return 1
	})
	return arms
}
