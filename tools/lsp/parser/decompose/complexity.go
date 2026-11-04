package decompose

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// This file owns the complexity metric (the deterministic AST-derived scalar
// that ranks chunks) and the floor it feeds — both thresholds against which the
// partition is judged.

// Complexity weights. These are documented, tunable heuristics — NOT a
// calibrated model. The scalar exists to rank chunks against the floor and
// ceiling thresholds, not to estimate effort precisely. Each authorable node
// carries weightBase so even an empty definition scores nonzero.
const (
	weightBase      = 1 // every node is worth at least this
	weightStatement = 1 // per body statement
	weightFanout    = 2 // per distinct callee (activity / workflow / nexus op)
	weightDepth     = 2 // per level of branch/loop/await nesting
	weightHandler   = 2 // per signal/query/update handler (workflows)
	weightChildWf   = 1 // per child-workflow call
)

// bodyMetrics are the raw AST counts a definition's complexity is scored from.
// A workflow folds its handler bodies in via add before scoring.
type bodyMetrics struct {
	statements     int
	fanout         int // distinct callee count
	childWorkflows int
	depth          int // max branch/loop/await nesting
	handlers       int
}

// add folds another body's metrics in. Counts accumulate; depth takes the max
// (nesting doesn't sum across sibling bodies).
func (m *bodyMetrics) add(o bodyMetrics) {
	m.statements += o.statements
	m.fanout += o.fanout
	m.childWorkflows += o.childWorkflows
	m.handlers += o.handlers
	m.depth = max(m.depth, o.depth)
}

// score combines the counts into the final weighted scalar.
func (m bodyMetrics) score() int {
	return weightBase +
		weightStatement*m.statements +
		weightFanout*m.fanout +
		weightDepth*m.depth +
		weightHandler*m.handlers +
		weightChildWf*m.childWorkflows
}

// computeComplexity sets the deterministic per-definition complexity scalar on
// every working node, derived from AST body counts. Workflow handler bodies are
// folded into the owning workflow's score. With a nil AST the nodes keep their
// base complexity (a graph reconstructed from history has no bodies to measure).
func (wg *workGraph) computeComplexity(file *ast.File) {
	if file == nil {
		return
	}
	kept := firstDeclarations(file)
	for _, def := range file.Definitions {
		if !kept[def] {
			continue
		}
		switch d := def.(type) {
		case *ast.WorkflowDef:
			wn := wg.nodes[graph.DefKey(graph.KindWorkflow, ast.QualifiedName(ast.PackageIDOf(d, file), d.Name))]
			if wn == nil {
				continue
			}
			m := measureBody(d.Body)
			for _, h := range d.Signals {
				m.add(measureBody(h.Body))
			}
			for _, q := range d.Queries {
				m.add(measureBody(q.Body))
			}
			for _, u := range d.Updates {
				m.add(measureBody(u.Body))
			}
			m.handlers = len(d.Signals) + len(d.Queries) + len(d.Updates)
			wn.complexity = m.score()

		case *ast.ActivityDef:
			if wn := wg.nodes[graph.DefKey(graph.KindActivity, ast.QualifiedName(ast.PackageIDOf(d, file), d.Name))]; wn != nil {
				wn.complexity = measureBody(d.Body).score()
			}

		case *ast.NexusServiceDef:
			svcQName := ast.QualifiedName(ast.PackageIDOf(d, file), d.Name)
			for _, op := range d.Operations {
				// Sync ops carry a body; async ones don't (base score).
				if wn := wg.nodes[graph.DefKey(graph.KindNexusOperation, svcQName+"."+op.Name)]; wn != nil {
					wn.complexity = measureBody(op.Body).score()
				}
			}
		}
	}
}

// firstDeclarations is the set of file's workflow, activity and nexus service
// definitions that are the first of their kind, package and name: a name
// declared twice (a DUPLICATE_* resolve error) is its first declaration's, as
// the resolver keeps it.
func firstDeclarations(file *ast.File) map[ast.Definition]bool {
	kept := map[ast.Definition]bool{}
	seen := map[string]bool{}
	for _, def := range file.Definitions {
		var key string
		switch d := def.(type) {
		case *ast.WorkflowDef:
			key = graph.DefKey(graph.KindWorkflow, ast.QualifiedName(ast.PackageIDOf(d, file), d.Name))
		case *ast.ActivityDef:
			key = graph.DefKey(graph.KindActivity, ast.QualifiedName(ast.PackageIDOf(d, file), d.Name))
		case *ast.NexusServiceDef:
			key = graph.DefKey(graph.KindNexusService, ast.QualifiedName(ast.PackageIDOf(d, file), d.Name))
		default:
			continue
		}
		if !seen[key] {
			seen[key] = true
			kept[def] = true
		}
	}
	return kept
}

// calleeKey identifies a call's target for the distinct-callee count: the
// resolved definition's package and name, so `fabric.Setup` and `cf.Setup`
// are two callees; a target that did not resolve keys by its written qualifier
// under a prefix no package has, so it never merges with a resolved one.
func calleeKey[T interface {
	comparable
	ast.Packaged
}](kind string, r ast.Ref[T]) string {
	var zero T
	if r.Resolved != zero {
		return kind + ":" + ast.QualifiedName(ast.PackageIDOf(r.Resolved, nil), r.Name)
	}
	return kind + ":\x00" + r.Package + "." + r.Name
}

// measureBody walks a statement body and tallies its bodyMetrics. Depth is 0 for
// a flat body, 1 inside one control block, and so on.
func measureBody(stmts []ast.Statement) bodyMetrics {
	var m bodyMetrics
	callees := map[string]bool{}

	addTarget := func(t ast.AsyncTarget) {
		switch tt := t.(type) {
		case *ast.ActivityTarget:
			callees[calleeKey("activity", tt.Activity)] = true
		case *ast.WorkflowTarget:
			callees[calleeKey("workflow", tt.Workflow)] = true
			m.childWorkflows++
		case *ast.NexusTarget:
			callees[calleeKey("nexus", tt.Service)+"."+tt.Operation.Name] = true
		}
	}

	var rec func(list []ast.Statement, d int)
	rec = func(list []ast.Statement, d int) {
		if len(list) > 0 && d > m.depth {
			m.depth = d
		}
		for _, s := range list {
			m.statements++
			switch n := s.(type) {
			case *ast.ActivityCall:
				callees[calleeKey("activity", n.Activity)] = true
			case *ast.WorkflowCall:
				callees[calleeKey("workflow", n.Workflow)] = true
				m.childWorkflows++
			case *ast.NexusCall:
				callees[calleeKey("nexus", n.Service)+"."+n.Operation.Name] = true
			case *ast.AwaitStmt:
				addTarget(n.Target)
			case *ast.PromiseStmt:
				addTarget(n.Target)
			case *ast.IfStmt:
				rec(n.Body, d+1)
				rec(n.ElseBody, d+1)
			case *ast.ForStmt:
				rec(n.Body, d+1)
			case *ast.SwitchBlock:
				for _, c := range n.Cases {
					rec(c.Body, d+1)
				}
				rec(n.Default, d+1)
			case *ast.AwaitAllBlock:
				rec(n.Body, d+1)
			case *ast.AwaitOneBlock:
				for _, c := range n.Cases {
					if c.Target != nil {
						addTarget(c.Target)
					}
					if c.AwaitAll != nil {
						rec(c.AwaitAll.Body, d+1)
					}
					rec(c.Body, d+1)
				}
			}
		}
	}
	rec(stmts, 0)

	m.fanout = len(callees)
	return m
}

// applyFloor flags hard chunks scoring below the floor as too granular for
// their own subagent and recommends merging each into the chunk that dispatches
// into it (over a nexusCall contract edge). The recommendation is informational
// — never auto-applied, consistent with "informs, does not impose". A chunk with
// no inbound contract edge is still flagged, with no merge target.
func applyFloor(res *Result, floor int) {
	if floor <= 0 {
		return
	}
	for i := range res.Chunks {
		c := &res.Chunks[i]
		if c.Complexity >= floor {
			continue
		}
		c.BelowFloor = true
		var into string
		for _, e := range res.ChunkEdges {
			if e.To == c.ID && (into == "" || e.From < into) {
				into = e.From
			}
		}
		c.MergeInto = into
	}
}
