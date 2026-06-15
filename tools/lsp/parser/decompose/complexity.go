package decompose

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

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

// computeComplexity sets the deterministic per-definition complexity scalar on
// every working node, derived from AST body counts. Workflow handler bodies are
// folded into the owning workflow's score.
func computeComplexity(file *ast.File, wg *workGraph) {
	if file == nil {
		return // no bodies to measure; nodes keep their base complexity
	}
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			wn := wg.nodes[graph.DefKey(graph.KindWorkflow, d.Name)]
			if wn == nil {
				continue
			}
			st, fo, cw, dep := measureBody(d.Body)
			for _, h := range d.Signals {
				st2, fo2, cw2, dep2 := measureBody(h.Body)
				st, fo, cw = st+st2, fo+fo2, cw+cw2
				dep = max(dep, dep2)
			}
			for _, q := range d.Queries {
				st2, fo2, cw2, dep2 := measureBody(q.Body)
				st, fo, cw = st+st2, fo+fo2, cw+cw2
				dep = max(dep, dep2)
			}
			for _, u := range d.Updates {
				st2, fo2, cw2, dep2 := measureBody(u.Body)
				st, fo, cw = st+st2, fo+fo2, cw+cw2
				dep = max(dep, dep2)
			}
			handlers := len(d.Signals) + len(d.Queries) + len(d.Updates)
			wn.complexity = score(st, fo, cw, dep, handlers)

		case *ast.ActivityDef:
			wn := wg.nodes[graph.DefKey(graph.KindActivity, d.Name)]
			if wn == nil {
				continue
			}
			st, fo, cw, dep := measureBody(d.Body)
			wn.complexity = score(st, fo, cw, dep, 0)

		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				wn := wg.nodes[graph.DefKey(graph.KindNexusOperation, d.Name+"."+op.Name)]
				if wn == nil {
					continue
				}
				st, fo, cw, dep := measureBody(op.Body) // sync ops carry a body; async ones don't
				wn.complexity = score(st, fo, cw, dep, 0)
			}
		}
	}
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

// score combines the body counts into the final scalar.
func score(statements, fanout, childWf, depth, handlers int) int {
	return weightBase +
		weightStatement*statements +
		weightFanout*fanout +
		weightDepth*depth +
		weightHandler*handlers +
		weightChildWf*childWf
}

// measureBody walks a statement body and returns its statement count, distinct
// callee fan-out, child-workflow-call count, and maximum branch/loop/await
// nesting depth. Depth is 0 for a flat body, 1 inside one control block, etc.
func measureBody(stmts []ast.Statement) (statements, fanout, childWf, depth int) {
	callees := map[string]bool{}

	addTarget := func(t ast.AsyncTarget) {
		switch tt := t.(type) {
		case *ast.ActivityTarget:
			callees["activity:"+tt.Activity.Name] = true
		case *ast.WorkflowTarget:
			callees["workflow:"+tt.Workflow.Name] = true
			childWf++
		case *ast.NexusTarget:
			callees["nexus:"+tt.Service.Name+"."+tt.Operation.Name] = true
		}
	}

	var rec func(list []ast.Statement, d int)
	rec = func(list []ast.Statement, d int) {
		if len(list) > 0 && d > depth {
			depth = d
		}
		for _, s := range list {
			statements++
			switch n := s.(type) {
			case *ast.ActivityCall:
				callees["activity:"+n.Activity.Name] = true
			case *ast.WorkflowCall:
				callees["workflow:"+n.Workflow.Name] = true
				childWf++
			case *ast.NexusCall:
				callees["nexus:"+n.Service.Name+"."+n.Operation.Name] = true
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
	return statements, len(callees), childWf, depth
}
