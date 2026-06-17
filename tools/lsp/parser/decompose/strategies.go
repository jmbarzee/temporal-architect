package decompose

import (
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// This file is the menu of cut strategies for the explore phase. Each strategy
// is a member→label split over a chunk's members; divisions.go turns a labeling
// into ranked sections + a dependency DAG. To add a strategy: write a splitBy*
// here, register it in selectStrategies / splitBy, and give it a rationale.

// selectStrategies resolves the requested strategy bias into a concrete,
// de-duplicated list. An empty request means all strategies, in canonical order.
// This order is only a default and a ranking tiebreaker — the explore phase
// ranks candidates by balance, not by this sequence.
func selectStrategies(by []string) []string {
	all := []string{StrategyTree, StrategyNexus, StrategyWorker, StrategyNamespace, StrategyHub}
	if len(by) == 0 {
		return all
	}
	known := setOf(all)
	seen := map[string]bool{}
	var out []string
	for _, b := range by {
		if known[b] && !seen[b] {
			seen[b] = true
			out = append(out, b)
		}
	}
	return out
}

// splitBy dispatches to the requested strategy's member→label splitter.
func (wg *workGraph) splitBy(strategy string, c *Chunk) map[string]string {
	switch strategy {
	case StrategyTree:
		return wg.splitByTree(c)
	case StrategyNexus:
		return wg.splitByNexus(c)
	case StrategyWorker:
		return wg.splitByAttr(c, StrategyWorker)
	case StrategyNamespace:
		return wg.splitByAttr(c, StrategyNamespace)
	case StrategyHub:
		return wg.splitByHub(c)
	default:
		return map[string]string{}
	}
}

// splitByTree splits a chunk along its reachable-subtree seams. With two or
// more roots, each root's exclusively-reachable members form a branch and the
// shared remainder forms a "core". With a single root, the root's own SCC forms
// "root" and each of its immediate child subtrees forms a section.
func (wg *workGraph) splitByTree(c *Chunk) map[string]string {
	memberSet := setOf(c.Members)
	sources := rootKeysOf(c)
	if len(sources) == 0 {
		return map[string]string{}
	}
	if len(sources) >= 2 {
		return wg.splitByOwners(c, sources, memberSet, "branch:", "core")
	}

	root := sources[0]
	rootSCC := wg.sccOf[root]
	labels := map[string]string{}
	excluded := map[string]bool{}
	for _, m := range wg.scc[rootSCC] {
		if memberSet[m] {
			labels[m] = "root:" + root
			excluded[m] = true
		}
	}

	var children []string
	childSeen := map[string]bool{}
	for _, m := range wg.scc[rootSCC] {
		if !memberSet[m] {
			continue
		}
		for _, w := range sortedSet(wg.binding[m]) {
			if memberSet[w] && wg.sccOf[w] != rootSCC && !childSeen[w] {
				childSeen[w] = true
				children = append(children, w)
			}
		}
	}
	sort.Strings(children)
	if len(children) == 0 {
		return labels // nothing below the root to split into sections
	}

	owners := map[string][]string{}
	for _, ch := range children {
		for _, r := range wg.bindingReachable(ch, memberSet) {
			if excluded[r] {
				continue
			}
			owners[r] = append(owners[r], ch)
		}
	}
	for _, m := range c.Members {
		if excluded[m] {
			continue
		}
		switch os := owners[m]; {
		case len(os) == 1:
			labels[m] = "subtree:" + os[0]
		case len(os) > 1:
			labels[m] = "shared"
		default:
			labels[m] = "subtree:" + m // soft-only member, own section
		}
	}
	return labels
}

// splitByOwners assigns each member to the single source that reaches it, the
// shared label when reached by more than one, or an isolated label when reached
// by none (soft-only members).
func (wg *workGraph) splitByOwners(c *Chunk, sources []string, memberSet map[string]bool, branchPrefix, sharedLabel string) map[string]string {
	owners := map[string][]string{}
	for _, s := range sources {
		for _, r := range wg.bindingReachable(s, memberSet) {
			owners[r] = append(owners[r], s)
		}
	}
	labels := map[string]string{}
	for _, m := range c.Members {
		switch os := owners[m]; {
		case len(os) == 1:
			labels[m] = branchPrefix + os[0]
		case len(os) > 1:
			labels[m] = sharedLabel
		default:
			labels[m] = "isolated:" + m
		}
	}
	return labels
}

// splitByNexus peels each nexus operation's reachable closure into its own
// section (claimed in sorted order so closures don't overlap), leaving the rest
// as a "core". This follows the contract seam the nexus tier already implies.
func (wg *workGraph) splitByNexus(c *Chunk) map[string]string {
	memberSet := setOf(c.Members)
	labels := map[string]string{}

	var ops []string
	for _, m := range c.Members {
		if wg.nodes[m].kind == graph.KindNexusOperation {
			ops = append(ops, m)
		}
	}
	sort.Strings(ops)
	for _, op := range ops {
		for _, r := range wg.bindingReachable(op, memberSet) {
			if _, claimed := labels[r]; !claimed {
				labels[r] = "nexus:" + op
			}
		}
	}
	for _, m := range c.Members {
		if _, ok := labels[m]; !ok {
			labels[m] = "core"
		}
	}
	return labels
}

// splitByAttr groups members by a retained deployment attribute (hosting worker
// set or namespace set). Members sharing the same attribute signature land in
// the same section.
func (wg *workGraph) splitByAttr(c *Chunk, attr string) map[string]string {
	labels := map[string]string{}
	for _, m := range c.Members {
		wn := wg.nodes[m]
		var vals []string
		if attr == StrategyWorker {
			vals = sortedSet(wn.workers)
		} else {
			vals = sortedSet(wn.namespaces)
		}
		if len(vals) == 0 {
			labels[m] = attr + ":none"
			continue
		}
		labels[m] = attr + ":" + strings.Join(vals, ",")
	}
	return labels
}

// splitByHub peels the single highest-fan-in shared node — the hub — into its
// own section, leaving the remainder as "core". A hub is the member with the
// largest in-chunk binding in-degree; ties break toward the lexicographically
// smallest key (c.Members is sorted). Nothing is extracted unless that in-degree
// is at least two — a node nobody shares isn't a hub — so the strategy yields no
// split on hub-free chunks. On hub-dominated designs the lone {hub}+{core} cut
// looks unbalanced on its own, but it un-sticks the structural strategies: once
// the recursion (divisions.go) re-divides the core with the hub removed, the
// branches that all overlapped through the hub separate cleanly.
func (wg *workGraph) splitByHub(c *Chunk) map[string]string {
	memberSet := setOf(c.Members)
	indeg := make(map[string]int, len(c.Members))
	for _, m := range c.Members {
		indeg[m] = 0
	}
	for _, from := range c.Members {
		for _, to := range sortedSet(wg.binding[from]) {
			if memberSet[to] {
				indeg[to]++
			}
		}
	}

	hub, best := "", 0
	for _, m := range c.Members { // sorted → first max wins (smallest key)
		if indeg[m] > best {
			hub, best = m, indeg[m]
		}
	}
	if best < 2 {
		return map[string]string{} // no shared hub to peel
	}

	labels := map[string]string{}
	for _, m := range c.Members {
		if m == hub {
			labels[m] = "hub:" + hub
		} else {
			labels[m] = "core"
		}
	}
	return labels
}

// rationaleFor returns a short human-readable explanation per strategy.
func rationaleFor(strategy string) string {
	switch strategy {
	case StrategyTree:
		return "split along reachable-subtree seams in the call structure"
	case StrategyNexus:
		return "split at nexus operation contract boundaries"
	case StrategyWorker:
		return "split by hosting worker"
	case StrategyNamespace:
		return "split by hosting namespace"
	case StrategyHub:
		return "extract the shared hub node so the rest can be divided"
	default:
		return ""
	}
}
