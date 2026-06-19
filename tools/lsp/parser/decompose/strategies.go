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
	all := []string{StrategyTree, StrategyNexus, StrategyWorker, StrategyNamespace, StrategyService, StrategySubtree}
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

// splitBy dispatches to the requested strategy's member→label splitter. ceiling
// is the explore-phase complexity ceiling; selective strategies (subtree) peel
// only until the trunk fits under it, the rest ignore it.
func (wg *workGraph) splitBy(strategy string, c *Chunk, ceiling int) map[string]string {
	switch strategy {
	case StrategyTree:
		return wg.splitByTree(c)
	case StrategyNexus:
		return wg.splitByNexus(c)
	case StrategyWorker:
		return wg.splitByAttr(c, StrategyWorker)
	case StrategyNamespace:
		return wg.splitByAttr(c, StrategyNamespace)
	case StrategyService:
		return wg.splitByService(c)
	case StrategySubtree:
		return wg.splitBySubtree(c, ceiling)
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

// splitByService extracts a shared service — the highest-fan-in hub plus its
// dominated closure — and splits the remainder into its binding components. The
// hub is the member with the largest in-chunk binding in-degree (ties break to
// the lexicographically smallest key); nothing is extracted unless that in-
// degree is at least two, so the strategy yields no split on hub-free chunks.
// The closure (the hub and everything reachable only through it — recovered via
// dominators, not raw in-degree, so the service's private activities come with
// it) forms one "service:<hub>" section. The remaining members are partitioned
// into their weakly-connected binding components ("component:<key>"): when the
// hub is an articulation point joining otherwise-separate subsystems, peeling
// it apart exposes them as independently-authorable units.
func (wg *workGraph) splitByService(c *Chunk) map[string]string {
	memberSet := setOf(c.Members)
	hub := wg.maxInDegreeHub(c.Members, memberSet)
	if hub == "" {
		return map[string]string{} // no shared hub to peel
	}

	idom := wg.bindingDominators(rootKeysOf(c), memberSet)
	closure := dominatedClosure(hub, idom)

	remainder := make([]string, 0, len(c.Members))
	for _, m := range c.Members {
		if !closure[m] {
			remainder = append(remainder, m)
		}
	}
	if len(remainder) == 0 {
		return map[string]string{} // hub dominates everything — nothing to separate
	}

	labels := map[string]string{}
	for m := range closure {
		labels[m] = "service:" + hub
	}
	for _, comp := range wg.bindingComponents(remainder) {
		label := "component:" + comp[0] // comp arrives sorted; smallest key names it
		for _, m := range comp {
			labels[m] = label
		}
	}
	return labels
}

// maxInDegreeHub returns the member with the greatest in-chunk binding in-degree
// when that in-degree is at least two (a node nobody shares isn't a hub), or ""
// otherwise. Ties break toward the lexicographically smallest key.
func (wg *workGraph) maxInDegreeHub(members []string, memberSet map[string]bool) string {
	indeg := make(map[string]int, len(members))
	for _, from := range members {
		for _, to := range sortedSet(wg.binding[from]) {
			if memberSet[to] {
				indeg[to]++
			}
		}
	}
	hub, best := "", 0
	sorted := append([]string(nil), members...)
	sort.Strings(sorted)
	for _, m := range sorted { // sorted → first max wins (smallest key)
		if indeg[m] > best {
			hub, best = m, indeg[m]
		}
	}
	if best < 2 {
		return ""
	}
	return hub
}

// bindingComponents partitions a member subset into its weakly-connected
// components over binding edges (both endpoints in the subset), each returned
// sorted; the component slice is ordered by its smallest member.
func (wg *workGraph) bindingComponents(members []string) [][]string {
	memberSet := setOf(members)
	adj := map[string]map[string]bool{}
	link := func(a, b string) {
		if adj[a] == nil {
			adj[a] = map[string]bool{}
		}
		adj[a][b] = true
	}
	for _, from := range members {
		for _, to := range sortedSet(wg.binding[from]) {
			if memberSet[to] {
				link(from, to)
				link(to, from)
			}
		}
	}
	visited := map[string]bool{}
	var comps [][]string
	sorted := append([]string(nil), members...)
	sort.Strings(sorted)
	for _, start := range sorted {
		if visited[start] {
			continue
		}
		var comp []string
		queue := []string{start}
		visited[start] = true
		for len(queue) > 0 {
			v := queue[0]
			queue = queue[1:]
			comp = append(comp, v)
			for _, w := range sortedSet(adj[v]) {
				if !visited[w] {
					visited[w] = true
					queue = append(queue, w)
				}
			}
		}
		sort.Strings(comp)
		comps = append(comps, comp)
	}
	sort.Slice(comps, func(i, j int) bool { return comps[i][0] < comps[j][0] })
	return comps
}

// splitBySubtree selectively peels the heaviest dominated child-workflow
// subtrees into their own sections until the trunk's effective complexity fits
// under the ceiling, leaving lighter branches inline. Peel points are
// workflow-call targets (childWf seams) other than the chunk roots; each peels
// its dominated closure — the module reachable only through it, activities
// included, so activities stay glued to their owning workflow. Heaviest closure
// first means an outer subtree is peeled before its own inner pieces (whose
// closures nest inside it). With no useful ceiling, or nothing worth peeling, it
// returns no split.
func (wg *workGraph) splitBySubtree(c *Chunk, ceiling int) map[string]string {
	if ceiling <= 0 {
		return map[string]string{}
	}
	memberSet := setOf(c.Members)
	idom := wg.bindingDominators(rootKeysOf(c), memberSet)
	rootSet := setOf(rootKeysOf(c))

	// Candidate peel points: child-workflow-call targets, not the roots.
	candSet := map[string]bool{}
	for _, from := range c.Members {
		for to := range wg.childWf[from] {
			if memberSet[to] && !rootSet[to] {
				candSet[to] = true
			}
		}
	}
	closureOf := map[string]map[string]bool{}
	weight := map[string]int{}
	candidates := make([]string, 0, len(candSet))
	for w := range candSet {
		cl := dominatedClosure(w, idom)
		closureOf[w] = cl
		weight[w] = wg.effectiveComplexity(setKeys(cl))
		candidates = append(candidates, w)
	}
	sort.Slice(candidates, func(i, j int) bool {
		if weight[candidates[i]] != weight[candidates[j]] {
			return weight[candidates[i]] > weight[candidates[j]] // heaviest first
		}
		return candidates[i] < candidates[j]
	})

	labels := map[string]string{}
	assigned := map[string]bool{}
	peeled := false
	trunkEc := func() int {
		var rest []string
		for _, m := range c.Members {
			if !assigned[m] {
				rest = append(rest, m)
			}
		}
		return wg.effectiveComplexity(rest)
	}
	for _, w := range candidates {
		if trunkEc() <= ceiling {
			break // trunk already fits — keep remaining branches inline
		}
		if assigned[w] {
			continue // already inside a peeled outer subtree
		}
		// Peel only members still in the trunk; a fully-overlapping closure
		// (would empty the trunk) leaves no seam, so skip it.
		var take []string
		for m := range closureOf[w] {
			if memberSet[m] && !assigned[m] {
				take = append(take, m)
			}
		}
		remaining := 0
		for _, m := range c.Members {
			if !assigned[m] {
				remaining++
			}
		}
		if len(take) == 0 || len(take) >= remaining {
			continue
		}
		for _, m := range take {
			labels[m] = "subtree:" + w
			assigned[m] = true
		}
		peeled = true
	}
	if !peeled {
		return map[string]string{}
	}
	for _, m := range c.Members {
		if !assigned[m] {
			labels[m] = "trunk"
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
	case StrategyService:
		return "extract the shared service (hub + its private closure), separating the rest"
	case StrategySubtree:
		return "peel the heaviest child-workflow subtrees until the trunk fits"
	default:
		return ""
	}
}
