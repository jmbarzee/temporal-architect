package decompose

import (
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// applyDivisions computes #2 soft divisions for every hard chunk that exceeds
// the ceiling and has a condensation seam to cut. Loops are never cut: a chunk
// whose members span fewer than two SCCs (e.g. one pure cycle) has no seam and
// is left undivided regardless of score.
func applyDivisions(wg *workGraph, res *Result, opts Options) {
	for i := range res.Chunks {
		c := &res.Chunks[i]
		if c.Complexity <= res.Ceiling {
			continue
		}
		if wg.distinctSCCs(c.Members) < 2 {
			continue // SCC-collapsed (loop) chunk — exempt from #2
		}
		c.Divisions = wg.divisionsFor(c, opts, res.Floor)
	}
}

// divisionsFor builds the ranked candidate divisions for one over-ceiling chunk.
// Each requested strategy that yields ≥2 sections — none below the floor — is a
// candidate; candidates are ranked by balance (smallest max-section complexity
// first), then by section count, then by strategy name.
func (wg *workGraph) divisionsFor(c *Chunk, opts Options, floor int) []Division {
	divs := []Division{}
	for _, strat := range selectStrategies(opts.By) {
		parts := wg.partitionBy(strat, c)
		sections, dag := wg.buildSections(c, parts)
		if len(sections) < 2 {
			continue // strategy didn't actually divide the chunk
		}
		if floor > 0 && anyBelowFloor(sections, floor) {
			continue // never propose a cut yielding a sub-chunk under the floor
		}
		divs = append(divs, Division{
			Strategy:  strat,
			Sections:  sections,
			DAG:       dag,
			Rationale: rationaleFor(strat),
		})
	}

	sort.SliceStable(divs, func(i, j int) bool {
		mi, mj := maxSectionComplexity(divs[i].Sections), maxSectionComplexity(divs[j].Sections)
		if mi != mj {
			return mi < mj
		}
		if len(divs[i].Sections) != len(divs[j].Sections) {
			return len(divs[i].Sections) < len(divs[j].Sections)
		}
		return divs[i].Strategy < divs[j].Strategy
	})
	for i := range divs {
		divs[i].Rank = i + 1
	}
	return divs
}

// selectStrategies resolves the requested strategy bias into a concrete,
// de-duplicated list. An empty request means all strategies, in canonical order.
func selectStrategies(by []string) []string {
	all := []string{StrategyTree, StrategyNexus, StrategyWorker, StrategyNamespace}
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

// partitionBy dispatches to the requested strategy's member→label partitioner.
func (wg *workGraph) partitionBy(strategy string, c *Chunk) map[string]string {
	switch strategy {
	case StrategyTree:
		return wg.partitionByTree(c)
	case StrategyNexus:
		return wg.partitionByNexus(c)
	case StrategyWorker:
		return wg.partitionByAttr(c, StrategyWorker)
	case StrategyNamespace:
		return wg.partitionByAttr(c, StrategyNamespace)
	default:
		return map[string]string{}
	}
}

// partitionByTree splits a chunk along its reachable-subtree seams. With two or
// more roots, each root's exclusively-reachable members form a branch and the
// shared remainder forms a "core". With a single root, the root's own SCC forms
// "root" and each of its immediate child subtrees forms a section.
func (wg *workGraph) partitionByTree(c *Chunk) map[string]string {
	memberSet := setOf(c.Members)
	sources := rootKeysOf(c)
	if len(sources) == 0 {
		return map[string]string{}
	}
	if len(sources) >= 2 {
		return wg.ownerPartition(c, sources, memberSet, "branch:", "core")
	}

	root := sources[0]
	rootSCC := wg.sccOf[root]
	parts := map[string]string{}
	excluded := map[string]bool{}
	for _, m := range wg.scc[rootSCC] {
		if memberSet[m] {
			parts[m] = "root:" + root
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
		return parts // nothing below the root to split into sections
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
			parts[m] = "subtree:" + os[0]
		case len(os) > 1:
			parts[m] = "shared"
		default:
			parts[m] = "subtree:" + m // soft-only member, own section
		}
	}
	return parts
}

// ownerPartition assigns each member to the single source that reaches it, the
// shared label when reached by more than one, or an isolated label when reached
// by none (soft-only members).
func (wg *workGraph) ownerPartition(c *Chunk, sources []string, memberSet map[string]bool, branchPrefix, sharedLabel string) map[string]string {
	owners := map[string][]string{}
	for _, s := range sources {
		for _, r := range wg.bindingReachable(s, memberSet) {
			owners[r] = append(owners[r], s)
		}
	}
	parts := map[string]string{}
	for _, m := range c.Members {
		switch os := owners[m]; {
		case len(os) == 1:
			parts[m] = branchPrefix + os[0]
		case len(os) > 1:
			parts[m] = sharedLabel
		default:
			parts[m] = "isolated:" + m
		}
	}
	return parts
}

// partitionByNexus peels each nexus operation's reachable closure into its own
// section (claimed in sorted order so closures don't overlap), leaving the rest
// as a "core". This follows the contract seam the nexus tier already implies.
func (wg *workGraph) partitionByNexus(c *Chunk) map[string]string {
	memberSet := setOf(c.Members)
	parts := map[string]string{}

	var ops []string
	for _, m := range c.Members {
		if wg.nodes[m].kind == graph.KindNexusOperation {
			ops = append(ops, m)
		}
	}
	sort.Strings(ops)
	for _, op := range ops {
		for _, r := range wg.bindingReachable(op, memberSet) {
			if _, claimed := parts[r]; !claimed {
				parts[r] = "nexus:" + op
			}
		}
	}
	for _, m := range c.Members {
		if _, ok := parts[m]; !ok {
			parts[m] = "core"
		}
	}
	return parts
}

// partitionByAttr groups members by a retained deployment attribute (hosting
// worker set or namespace set). Members sharing the same attribute signature
// land in the same section.
func (wg *workGraph) partitionByAttr(c *Chunk, attr string) map[string]string {
	parts := map[string]string{}
	for _, m := range c.Members {
		wn := wg.nodes[m]
		var vals []string
		if attr == StrategyWorker {
			vals = sortedSet(wn.workers)
		} else {
			vals = sortedSet(wn.namespaces)
		}
		if len(vals) == 0 {
			parts[m] = attr + ":none"
			continue
		}
		parts[m] = attr + ":" + strings.Join(vals, ",")
	}
	return parts
}

// buildSections groups members by label into sections (sorted, with a stable ID
// per label) and derives the dependency DAG from binding edges that cross
// section boundaries. A SectionEdge From→To means From depends on To (From calls
// into To), so the harness can order authoring.
func (wg *workGraph) buildSections(c *Chunk, parts map[string]string) ([]Section, []SectionEdge) {
	byLabel := map[string][]string{}
	for _, m := range c.Members {
		byLabel[parts[m]] = append(byLabel[parts[m]], m)
	}

	labels := make([]string, 0, len(byLabel))
	for lab := range byLabel {
		labels = append(labels, lab)
	}
	sort.Strings(labels)

	secID := map[string]string{}
	sections := make([]Section, 0, len(labels))
	for _, lab := range labels {
		members := byLabel[lab]
		sort.Strings(members)
		id := c.ID + "/" + lab
		secID[lab] = id
		comp := 0
		for _, m := range members {
			comp += wg.nodes[m].complexity
		}
		sections = append(sections, Section{ID: id, Members: members, Complexity: comp})
	}

	seen := map[string]bool{}
	dag := []SectionEdge{}
	for _, from := range c.Members {
		lf := parts[from]
		for _, to := range sortedSet(wg.binding[from]) {
			lt, in := parts[to]
			if !in || lf == lt {
				continue
			}
			k := secID[lf] + "\x00" + secID[lt]
			if seen[k] {
				continue
			}
			seen[k] = true
			dag = append(dag, SectionEdge{From: secID[lf], To: secID[lt]})
		}
	}
	sort.Slice(dag, func(i, j int) bool {
		if dag[i].From != dag[j].From {
			return dag[i].From < dag[j].From
		}
		return dag[i].To < dag[j].To
	})

	return sections, dag
}

// rootKeysOf returns the chunk's root keys, sorted.
func rootKeysOf(c *Chunk) []string {
	out := make([]string, 0, len(c.Roots))
	for _, r := range c.Roots {
		out = append(out, r.Key)
	}
	sort.Strings(out)
	return out
}

// anyBelowFloor reports whether any section scores under the floor.
func anyBelowFloor(sections []Section, floor int) bool {
	for _, s := range sections {
		if s.Complexity < floor {
			return true
		}
	}
	return false
}

// maxSectionComplexity returns the largest section complexity (the balance
// metric — smaller is a more even cut).
func maxSectionComplexity(sections []Section) int {
	m := 0
	for _, s := range sections {
		if s.Complexity > m {
			m = s.Complexity
		}
	}
	return m
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
	default:
		return ""
	}
}
