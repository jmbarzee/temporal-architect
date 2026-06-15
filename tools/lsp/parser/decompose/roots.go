package decompose

import (
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Heuristic root reasons. Each is auditable in Root.Reasons so a consumer can
// see why a definition was treated as an entry point.
const (
	reasonNoInEdge    = "no binding in-edge"
	reasonAsyncTarget = "asyncBacking target"
	reasonHandler     = "handler-bearing"
	reasonCycle       = "self-contained cycle"
)

// heuristicRoots computes the seed set of entry points per the design:
//
//	in-degree-0 (binding subgraph)
//	  ∪ asyncBacking targets
//	  ∪ handler-bearing workflows (signal/query/update handlers, from the AST)
//	  ∪ in-cycle-with-no-external-binding-in-edge
//
// Every root is tagged source "heuristic". #7 (declared inbound roots) later
// contributes source "declared" without changing this shape. Requires condense()
// to have already run (the cycle heuristic reads the SCC condensation).
func (wg *workGraph) heuristicRoots(file *ast.File) map[string]*Root {
	roots := map[string]*Root{}
	add := func(key, reason string) {
		if wg.nodes[key] == nil {
			return
		}
		r := roots[key]
		if r == nil {
			r = &Root{Key: key, Source: SourceHeuristic}
			roots[key] = r
		}
		for _, existing := range r.Reasons {
			if existing == reason {
				return
			}
		}
		r.Reasons = append(r.Reasons, reason)
		sort.Strings(r.Reasons)
	}

	// in-degree-0 over the binding subgraph.
	indeg := map[string]int{}
	for k := range wg.nodes {
		indeg[k] = 0
	}
	for _, from := range wg.sortedKeys() {
		for _, to := range sortedSet(wg.binding[from]) {
			indeg[to]++
		}
	}
	for _, k := range wg.sortedKeys() {
		if indeg[k] == 0 {
			add(k, reasonNoInEdge)
		}
	}

	// asyncBacking targets: external entries despite an in-edge.
	for _, k := range wg.sortedKeys() {
		if wg.asyncBackTo[k] {
			add(k, reasonAsyncTarget)
		}
	}

	// handler-bearing workflows: a signal/query/update handler is an external
	// entry point into the workflow. Only detectable with an AST.
	if file != nil {
		for _, def := range file.Definitions {
			wf, ok := def.(*ast.WorkflowDef)
			if !ok {
				continue
			}
			if len(wf.Signals)+len(wf.Queries)+len(wf.Updates) > 0 {
				add(graph.DefKey(graph.KindWorkflow, wf.Name), reasonHandler)
			}
		}
	}

	// in-cycle with no external binding in-edge: a self-contained loop has no
	// natural single entry, so its lexicographically smallest member seeds it.
	for _, members := range wg.scc {
		if len(members) < 2 {
			continue
		}
		memberSet := setOf(members)
		external := false
		for _, from := range wg.sortedKeys() {
			if memberSet[from] {
				continue
			}
			for to := range wg.binding[from] {
				if memberSet[to] {
					external = true
					break
				}
			}
			if external {
				break
			}
		}
		if !external {
			add(members[0], reasonCycle) // members are sorted by condense()
		}
	}

	return roots
}
