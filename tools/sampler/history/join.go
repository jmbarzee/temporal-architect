package history

import (
	"fmt"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/execution"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/flow"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/stmtid"
)

const (
	// diagStmtAmbiguous is the code for a run's event that several statements
	// still fit at the run's end, so it takes its flat head.
	diagStmtAmbiguous = "EXECUTION_STMT_AMBIGUOUS"
	// diagStmtUnmatched is the code for a run's event that no statement its
	// run could reach fits, so it takes its flat head: the run drifted.
	diagStmtUnmatched = "EXECUTION_STMT_UNMATCHED"
)

// most is how many ways through a run the join keeps at once.
const most = 64

// thread is where one body of a run stands: the workflow's own, or a handler's
// for one arrival.
type thread struct {
	at     flow.Node
	prefix []int // the arrival a handler runs for; empty in the workflow's own body
	passes map[*ast.ForStmt]int
}

// fit is the statement an event ran, and its visit; a nil stmt is the body's
// end, which no statement names.
type fit struct {
	stmt  ast.Statement
	visit []int
}

// way is one way through a run that fits its events so far.
type way struct {
	threads []thread
	fits    map[*event]fit
}

func (w *way) fork() *way {
	n := &way{threads: slices.Clone(w.threads), fits: make(map[*event]fit, len(w.fits)+1)}
	for e, f := range w.fits {
		n.fits[e] = f
	}
	return n
}

// joiner replays one workflow's control flow.
type joiner struct {
	g     *flow.Graph
	names *stmtid.Index
	fors  map[ast.Statement][]*ast.ForStmt // the fors around each statement, outermost first
	alls  map[ast.Statement][]*ast.AwaitAllBlock
	block map[*ast.AwaitOneCase]*ast.AwaitOneBlock
}

// join gives each statement event of l the stmt and visit of the statement it
// ran, as the README's join says. A lane whose workflow the design lacks is
// left to its flat heads.
func (a *assembly) join(l *lane) {
	d := a.b.design
	if d == nil || d.Flow(l.key) == nil {
		return
	}
	j := &joiner{g: d.Flow(l.key), names: d.Statements, fors: map[ast.Statement][]*ast.ForStmt{},
		alls: map[ast.Statement][]*ast.AwaitAllBlock{}, block: map[*ast.AwaitOneCase]*ast.AwaitOneBlock{}}
	for _, b := range j.g.Bodies() {
		j.nest(bodyOf(b.Owner), nil, nil)
	}

	ways := []*way{{threads: []thread{{at: j.g.Bodies()[0].Entry}}, fits: map[*event]fit{}}}
	unmatched := map[*event]bool{}
	var awaits []*event
	for _, e := range slices.Clone(l.events) {
		switch e.Kind {
		case execution.Reach:
			next := j.advance(ways, e, j.wants(e.call), false)
			if len(next) == 0 {
				unmatched[e] = true
				continue
			}
			ways = next
		case execution.Arrive:
			h := j.handler(e.call)
			if h != nil {
				for i, w := range ways {
					w = w.fork()
					w.fits[e] = fit{h.Owner.(ast.Statement), e.Visit}
					w.threads = append(w.threads, thread{at: h.Entry, prefix: e.Visit})
					ways[i] = w
				}
			}
			if e.call.kind != callArriveSignal {
				continue
			}
			end := &event{Event: execution.Event{Kind: execution.End, Time: e.Time}, lane: l, at: e.at, history: e.history, arrival: e}
			ways = j.advance(ways, end, func(n flow.Node) bool { return callOf(n) == call{kind: callAwaitSignal, name: e.call.name} }, true)
			if slices.ContainsFunc(ways, func(w *way) bool { _, ok := w.fits[end]; return ok }) {
				awaits = append(awaits, end)
			} else if h == nil {
				unmatched[e] = true
			}
		}
	}

	report := func(code string, e *event, what string) {
		a.b.og.Diagnostics = append(a.b.og.Diagnostics, graph.Diagnostic{
			Severity: "warning",
			Code:     code,
			Message:  fmt.Sprintf("%s, event %d of run %s/%s, %s", e.head, e.history, l.run.workflowID, l.run.runID, what),
			From:     l.node,
		})
	}
	for _, e := range l.events {
		if unmatched[e] {
			report(diagStmtUnmatched, e, "fits no statement of "+l.key+" the run could reach")
			continue
		}
		f, names := settle(ways, e, j)
		switch {
		case len(names) > 1:
			report(diagStmtAmbiguous, e, "fits "+strings.Join(names, " and "))
		case len(names) == 1:
			e.Stmt, e.Visit = j.name(f.stmt), f.visit
		}
	}
	for _, end := range awaits {
		if f, names := settle(ways, end, j); len(names) == 1 {
			end.Stmt, end.Visit = j.name(f.stmt), f.visit
			i := slices.Index(l.events, end.arrival)
			l.events = slices.Insert(l.events, i+1, end)
		}
	}
}

// settle is the fit every way gives e, and the names of the distinct fits they
// give it: one when they agree, none when e has none or is the body's end.
func settle(ways []*way, e *event, j *joiner) (fit, []string) {
	var f fit
	var names []string
	for _, w := range ways {
		g, ok := w.fits[e]
		if !ok || g.stmt == nil {
			return fit{}, nil
		}
		name := j.name(g.stmt)
		if len(g.visit) > 0 {
			name += fmt.Sprintf(" visit %v", g.visit)
		}
		if !slices.Contains(names, name) {
			names = append(names, name)
		}
		f = g
	}
	return f, names
}

// advance moves each way to every site wanted that one of its threads reaches,
// keeping as key's fit what it reached. A way that reaches none is left out,
// or kept unmoved when optional.
func (j *joiner) advance(ways []*way, key *event, wanted func(flow.Node) bool, optional bool) []*way {
	var next []*way
	for _, w := range ways {
		moved := false
		for i, t := range w.threads {
			for _, to := range j.reach(t, wanted) {
				n := w.fork()
				n.threads[i] = to
				n.fits[key] = j.fit(to)
				next = append(next, n)
				moved = true
			}
		}
		if optional && !moved {
			next = append(next, w)
		}
	}
	return next[:min(len(next), most)]
}

// wants says which nodes a reach that calls c can be: a site calling it, or
// for a completing close, the end of the workflow's body.
func (j *joiner) wants(c call) func(flow.Node) bool {
	exit := j.g.Bodies()[0].Exit
	return func(n flow.Node) bool {
		if n == exit {
			return c == call{kind: callClose, name: "complete"}
		}
		s := callOf(n)
		return s.kind == c.kind && s.name == c.name && (s.on == "" || c.on == "" || s.on == c.on)
	}
}

// reach is where t can go next to a node wanted: along the flow, passing no
// statement history records, counting each for's passes. From an await one's
// case it may go to the others, and inside an await all to each branch, which
// run beside it.
func (j *joiner) reach(t thread, wanted func(flow.Node) bool) []thread {
	todo := j.siblings(t)
	for _, e := range j.g.Out(t.at) {
		todo = append(todo, j.enter(e, t))
	}
	seen := map[flow.Node]bool{}
	var out []thread
	for ; len(todo) > 0; todo = todo[1:] {
		s := todo[0]
		if seen[s.at] {
			continue
		}
		seen[s.at] = true
		if wanted(s.at) {
			out = append(out, s)
			continue
		}
		if c := callOf(s.at); c.kind != "" && c.kind != callAwaitSignal {
			continue
		}
		for _, e := range j.g.Out(s.at) {
			todo = append(todo, j.enter(e, s))
		}
	}
	return out
}

// enter is t moved along e, a for's pass counted on reaching it: from 1, or
// one more along its back edge.
func (j *joiner) enter(e flow.Edge, t thread) thread {
	t.at = e.To
	if f, ok := e.To.At.(*ast.ForStmt); ok && e.To.Port == flow.Stmt {
		passes := map[*ast.ForStmt]int{}
		for k, v := range t.passes {
			passes[k] = v
		}
		passes[f] = 1
		if j.g.Back(e) {
			passes[f] = t.passes[f] + 1
		}
		t.passes = passes
	}
	return t
}

// siblings is where t may go beside the flow: the other cases of the await one
// it stands on a case of, and the branches of each await all around it.
func (j *joiner) siblings(t thread) []thread {
	s, ok := t.at.At.(ast.Statement)
	if !ok || t.at.Port != flow.Stmt {
		return nil
	}
	var out []thread
	if c, ok := s.(*ast.AwaitOneCase); ok && j.block[c] != nil {
		for _, other := range j.block[c].Cases {
			if other != c {
				out = append(out, thread{flow.Node{At: other}, t.prefix, t.passes})
			}
		}
	}
	for _, all := range j.alls[s] {
		for _, e := range j.g.Out(flow.Node{At: all}) {
			if e.Kind == flow.Branch {
				out = append(out, thread{e.To, t.prefix, t.passes})
			}
		}
	}
	return out
}

// fit is the statement t stands on and its visit: the arrival it runs for, then
// each for's pass around it.
func (j *joiner) fit(t thread) fit {
	s, ok := t.at.At.(ast.Statement)
	if !ok || t.at.Port != flow.Stmt {
		return fit{}
	}
	visit := slices.Clone(t.prefix)
	for _, f := range j.fors[s] {
		visit = append(visit, max(t.passes[f], 1))
	}
	return fit{s, visit}
}

func (j *joiner) name(s ast.Statement) string {
	id, _ := j.names.Of(s)
	return id.String()
}

// handler is the body of the handler an arrival runs, or nil.
func (j *joiner) handler(c call) *flow.Body {
	for _, b := range j.g.Bodies()[1:] {
		switch o := b.Owner.(type) {
		case *ast.SignalDecl:
			if c == (call{kind: callArriveSignal, name: o.Name}) {
				return b
			}
		case *ast.UpdateDecl:
			if c == (call{kind: callArriveUpdate, name: o.Name}) {
				return b
			}
		}
	}
	return nil
}

// nest records the fors and await alls around each statement of stmts, and
// the block of each await one case.
func (j *joiner) nest(stmts []ast.Statement, fors []*ast.ForStmt, alls []*ast.AwaitAllBlock) {
	for _, s := range stmts {
		j.fors[s], j.alls[s] = fors, alls
		switch s := s.(type) {
		case *ast.ForStmt:
			j.nest(s.Body, append(slices.Clip(fors), s), alls)
			continue
		case *ast.AwaitAllBlock:
			j.nest(s.Body, fors, append(slices.Clip(alls), s))
			continue
		case *ast.AwaitOneBlock:
			for _, c := range s.Cases {
				j.block[c] = s
			}
		}
		for _, b := range ast.ChildBlocks(s) {
			j.nest(b, fors, alls)
		}
	}
}

func bodyOf(owner ast.Node) []ast.Statement {
	switch o := owner.(type) {
	case *ast.WorkflowDef:
		return o.Body
	case *ast.SignalDecl:
		return o.Body
	case *ast.UpdateDecl:
		return o.Body
	case *ast.QueryDecl:
		return o.Body
	}
	return nil
}

// callOf is what the statement at n calls, as history records it; zero for
// anything else.
func callOf(n flow.Node) call {
	if n.Port != flow.Stmt {
		return call{}
	}
	switch s := n.At.(type) {
	case *ast.ActivityCall:
		return call{kind: callActivity, name: s.Activity.Name}
	case *ast.WorkflowCall:
		return call{kind: callWorkflow, name: s.Workflow.Name}
	case *ast.NexusCall:
		return call{kind: callNexus, name: s.Endpoint.Name + " " + s.Service.Name + "." + s.Operation.Name}
	case *ast.SignalSendStmt:
		c := call{kind: callSignal, name: s.Signal}
		if s.Head.Kind == ast.SendHeadType {
			c.on = s.Head.Type.Name
		}
		return c
	case *ast.CloseStmt:
		return call{kind: callClose, name: [...]string{ast.CloseComplete: "complete", ast.CloseFailWorkflow: "fail", ast.CloseContinueAsNew: "continue_as_new"}[s.Reason]}
	case *ast.AwaitStmt:
		return targetCall(s.Target)
	case *ast.AwaitOneCase:
		return targetCall(s.Target)
	case *ast.PromiseStmt:
		if c := targetCall(s.Target); c.kind != callAwaitSignal {
			return c
		}
	}
	return call{}
}

// targetCall is what an awaited or promised target calls.
func targetCall(t ast.AsyncTarget) call {
	switch t := t.(type) {
	case *ast.TimerTarget:
		return call{kind: callTimer}
	case *ast.ActivityTarget:
		return call{kind: callActivity, name: t.Activity.Name}
	case *ast.WorkflowTarget:
		return call{kind: callWorkflow, name: t.Workflow.Name}
	case *ast.NexusTarget:
		return call{kind: callNexus, name: t.Endpoint.Name + " " + t.Service.Name + "." + t.Operation.Name}
	case *ast.SignalTarget:
		return call{kind: callAwaitSignal, name: t.Signal.Name}
	}
	return call{}
}
