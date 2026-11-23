// Package flow derives a definition's control-flow graph from its AST, on
// demand: which statements can follow which, where a loop re-enters, which
// branches leave a point, and what a run can reach.
//
// A Graph holds one Body per body owner: a workflow's own body, then each
// handler's in source order; an activity's or a sync nexus operation's alone.
// A Node is a statement, a body's Entry or Exit, or the Join where an await
// all resumes. An Edge's Kind says how it leaves its source:
//
//	Next           in sequence, and every jump
//	Then, Else     an if; with no else, Else reaches what follows it
//	Case, Default  a switch, to each case, then its default or what follows
//	Wins           an await one, to each case in source order
//	Branch         an await all, to each statement, each ending at its Join
//	Iterate, Done  a for; for: has no Done
//
// close reaches the workflow body's Exit, from any body; return its own
// body's Exit; break and continue the innermost for in their body, and
// nothing outside one. A back edge is an edge into a for from its own body.
//
// Handlers join the workflow body through yields, not edges: a handler may
// run wherever its workflow yields.
//
// What a node does is still read off its At: conditions, targets, arguments,
// close reasons and options. Promise scope stays lexical.
package flow

import (
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// Port says which point of At a Node is.
type Port int

const (
	Stmt  Port = iota // the statement At
	Entry             // the start of the body At owns
	Exit              // the end of that body
	Join              // where the await all at At resumes
)

// Node is a point in a Graph. It keys maps; stmtid names its At.
type Node struct {
	At   ast.Node
	Port Port
}

// Kind is how an edge leaves its source.
type Kind int

const (
	Next Kind = iota
	Then
	Else
	Case
	Default
	Wins
	Branch
	Iterate
	Done
)

func (k Kind) String() string {
	return [...]string{"next", "then", "else", "case", "default", "wins", "branch", "iterate", "done"}[k]
}

// arm reports whether k picks one way out of several.
func (k Kind) arm() bool { return k >= Then && k <= Branch }

// Edge leads From one node To another.
type Edge struct {
	From, To Node
	Kind     Kind
}

// Body is one body of a definition: its own, or a handler's.
type Body struct {
	Owner       ast.Node
	Context     ast.BodyContext
	Entry, Exit Node
	nodes       []Node // in source order, from Entry to Exit
}

// Graph is a definition's control flow.
type Graph struct {
	bodies  []*Body
	out, in map[Node][]Edge
	body    map[Node]*Body
	loop    map[Node]*ast.ForStmt
	reached map[Node]bool
}

// Of returns the graph of a workflow, activity or sync nexus operation, and
// nil for anything else.
func Of(def ast.Node) *Graph {
	g := &Graph{out: map[Node][]Edge{}, in: map[Node][]Edge{}, body: map[Node]*Body{}, loop: map[Node]*ast.ForStmt{}}
	w := &builder{g: g, inside: map[Node]map[Node]bool{}}
	switch d := def.(type) {
	case *ast.WorkflowDef:
		w.add(d, d.Context, d.Body)
		for _, h := range d.Signals {
			w.add(h, h.Context, h.Body)
		}
		for _, h := range d.Queries {
			w.add(h, h.Context, h.Body)
		}
		for _, h := range d.Updates {
			w.add(h, h.Context, h.Body)
		}
		slices.SortFunc(g.bodies[1:], func(a, b *Body) int { return a.Owner.NodeLine() - b.Owner.NodeLine() })
	case *ast.ActivityDef:
		w.add(d, d.Context, d.Body)
	case *ast.NexusOperation:
		if d.OpType != ast.NexusOpSync {
			return nil
		}
		w.add(d, d.Context, d.Body)
	default:
		return nil
	}
	g.reach()
	w.cycles()
	return g
}

type builder struct {
	g      *Graph
	body   *Body
	loops  []loop                 // the fors around what is being placed, innermost last
	inside map[Node]map[Node]bool // each for's node, and every node it encloses
}

type loop struct{ at, after Node }

func (w *builder) add(owner ast.Node, ctx ast.BodyContext, stmts []ast.Statement) {
	w.body = &Body{Owner: owner, Context: ctx, Entry: Node{owner, Entry}, Exit: Node{owner, Exit}}
	w.g.bodies = append(w.g.bodies, w.body)
	w.place(w.body.Entry)
	w.g.edge(w.body.Entry, Next, w.seq(stmts, w.body.Exit))
	w.place(w.body.Exit)
}

func (w *builder) place(n Node) {
	w.body.nodes = append(w.body.nodes, n)
	w.g.body[n] = w.body
	for _, l := range w.loops {
		w.inside[l.at][n] = true
	}
}

// seq places stmts, the last followed by next, and returns where they start.
func (w *builder) seq(stmts []ast.Statement, next Node) Node {
	for i, s := range stmts {
		if _, ok := s.(*ast.Comment); !ok {
			w.stmt(s, head(stmts[i+1:], next))
		}
	}
	return head(stmts, next)
}

// head is where stmts start: their first statement, or next.
func head(stmts []ast.Statement, next Node) Node {
	for _, s := range stmts {
		if _, ok := s.(*ast.Comment); !ok {
			return Node{At: s}
		}
	}
	return next
}

// stmt places s, followed by next, and everything nested in it.
func (w *builder) stmt(s ast.Statement, next Node) {
	n := Node{At: s}
	w.place(n)
	switch s := s.(type) {
	case *ast.IfStmt:
		w.g.edge(n, Then, w.seq(s.Body, next))
		w.g.edge(n, Else, w.seq(s.ElseBody, next))
	case *ast.SwitchBlock:
		for _, c := range s.Cases {
			w.g.edge(n, Case, Node{At: c})
			w.stmt(c, next)
		}
		w.g.edge(n, Default, w.seq(s.Default, next))
	case *ast.SwitchCase:
		w.g.edge(n, Next, w.seq(s.Body, next))
	case *ast.AwaitOneBlock:
		for _, c := range s.Cases {
			w.g.edge(n, Wins, Node{At: c})
			w.stmt(c, next)
		}
	case *ast.AwaitOneCase:
		if s.AwaitAll == nil {
			w.g.edge(n, Next, w.seq(s.Body, next))
			break
		}
		w.all(n, s.AwaitAll.Body, head(s.Body, next))
		w.seq(s.Body, next)
	case *ast.AwaitAllBlock:
		w.all(n, s.Body, next)
	case *ast.ForStmt:
		w.inside[n] = map[Node]bool{n: true}
		w.loops = append(w.loops, loop{n, next})
		w.g.edge(n, Iterate, w.seq(s.Body, n))
		w.loops = w.loops[:len(w.loops)-1]
		if s.Variant != ast.ForInfinite {
			w.g.edge(n, Done, next)
		}
	case *ast.BreakStmt:
		if l, ok := w.innermost(); ok {
			w.g.edge(n, Next, l.after)
		}
	case *ast.ContinueStmt:
		if l, ok := w.innermost(); ok {
			w.g.edge(n, Next, l.at)
		}
	case *ast.ReturnStmt:
		w.g.edge(n, Next, w.body.Exit)
	case *ast.CloseStmt:
		w.g.edge(n, Next, w.g.bodies[0].Exit)
	default:
		w.g.edge(n, Next, next)
	}
}

// all branches from n to each statement in branches, each ending at n's
// Join, which resumes at next.
func (w *builder) all(n Node, branches []ast.Statement, next Node) {
	join := Node{At: n.At, Port: Join}
	for _, s := range branches {
		if _, ok := s.(*ast.Comment); !ok {
			w.g.edge(n, Branch, Node{At: s})
			w.stmt(s, join)
		}
	}
	w.place(join)
	w.g.edge(join, Next, next)
}

func (w *builder) innermost() (loop, bool) {
	if len(w.loops) == 0 {
		return loop{}, false
	}
	return w.loops[len(w.loops)-1], true
}

// cycles records, for each node on a reached cycle through a for's own body,
// the innermost such for.
func (w *builder) cycles() {
	g := w.g
	for _, b := range g.bodies {
		for _, n := range b.nodes { // outer fors before inner ones
			inside := w.inside[n]
			if inside == nil {
				continue
			}
			pass := func(e Edge) bool {
				return inside[e.From] && inside[e.To] && g.reached[e.From] && g.reached[e.To]
			}
			var back []Node
			for _, e := range g.in[n] {
				if inside[e.From] {
					back = append(back, e.From)
				}
			}
			ahead, behind := g.walk([]Node{n}, false, pass), g.walk(back, true, pass)
			for m := range ahead {
				if behind[m] {
					g.loop[m] = n.At.(*ast.ForStmt)
				}
			}
		}
	}
}

// reach records what a run can arrive at from any body's Entry, opening each
// Join once every branch arrives there without passing its await all again.
func (g *Graph) reach() {
	var entries []Node
	for _, b := range g.bodies {
		entries = append(entries, b.Entry)
	}
	open := map[Node]bool{}
	pass := func(e Edge) bool { return e.From.Port != Join || open[e.From] }
	for grew := true; grew; {
		grew = false
		g.reached = g.walk(entries, false, pass)
		for n := range g.reached {
			if n.Port != Join || open[n] {
				continue
			}
			opener := Node{At: n.At}
			within := func(e Edge) bool { return pass(e) && e.To != opener }
			open[n] = !slices.ContainsFunc(g.out[opener], func(e Edge) bool {
				return e.Kind == Branch && !g.walk([]Node{e.To}, false, within)[n]
			})
			grew = grew || open[n]
		}
	}
	for n := range g.reached {
		if n.Port == Join && !open[n] {
			delete(g.reached, n)
		}
	}
}

func (g *Graph) edge(from Node, k Kind, to Node) {
	e := Edge{from, to, k}
	g.out[from] = append(g.out[from], e)
	g.in[to] = append(g.in[to], e)
}

// walk returns the nodes reachable from from along edges pass allows,
// against their direction when back is set.
func (g *Graph) walk(from []Node, back bool, pass func(Edge) bool) map[Node]bool {
	edges := g.out
	if back {
		edges = g.in
	}
	seen := map[Node]bool{}
	for _, n := range from {
		seen[n] = true
	}
	for todo := slices.Clone(from); len(todo) > 0; {
		n := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		for _, e := range edges[n] {
			m := e.To
			if back {
				m = e.From
			}
			if pass(e) && !seen[m] {
				seen[m] = true
				todo = append(todo, m)
			}
		}
	}
	return seen
}
