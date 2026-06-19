package decompose

import (
	"sort"
)

// This file owns the explore phase — the soft divisions suggested for
// over-ceiling chunks. It drives the cut strategies (strategies.go), turns each
// resulting labeling into sections + a dependency DAG, recursively re-divides
// any section still over the ceiling, and ranks the candidates by whole-compound
// balance. Where the decide phase (partition, components.go) returns one
// mandatory answer, this phase explores many and offers the harness a ranked
// menu. Loops are never cut here, at any level.

// exploreDivisions suggests soft divisions for every hard chunk that exceeds the
// ceiling and has a condensation seam to cut. Loops are never cut: a chunk whose
// members span fewer than two SCCs (e.g. one pure cycle) has no seam and is left
// undivided regardless of score.
func exploreDivisions(wg *workGraph, res *Result, opts Options) {
	for i := range res.Chunks {
		c := &res.Chunks[i]
		if c.Complexity <= res.Ceiling {
			continue
		}
		if wg.distinctSCCs(c.Members) < 2 {
			continue // SCC-collapsed (loop) chunk — exempt from the explore phase
		}
		c.Divisions = wg.exploreStrategies(c, opts, res.Floor)
	}
}

// exploreStrategies tries every requested strategy on one over-ceiling chunk,
// recursively re-divides any section that is still over the ceiling, and returns
// the ranked candidate divisions. Each strategy that yields ≥2 sections — none
// below the floor — is a candidate. The candidates form a *portfolio* (every
// top-level strategy is fully expanded); within each, every over-ceiling section
// is replaced by the single best fully-recursed sub-division (bestDivision picks
// it with look-ahead). Candidates are ranked by whole-compound balance
// (rankDivisions). Strategies are explored independently, not in priority order.
func (wg *workGraph) exploreStrategies(c *Chunk, opts Options, floor int) []Division {
	divs := wg.candidateDivisions(c, opts.By, floor, opts.Ceiling)
	maxDepth := opts.effectiveMaxDepth()
	for i := range divs {
		wg.expandSections(divs[i].Sections, opts.By, floor, opts.Ceiling, maxDepth, 1)
	}
	wg.rankDivisions(divs, opts.Ceiling)
	return divs
}

// bestDivision returns the fully-expanded, top-ranked division for a (sub-)chunk
// at nesting level depth, or nil when no strategy divides it. Every candidate is
// recursively expanded *before* ranking, so the choice is made on each
// candidate's whole-recursed-compound balance, not its flat first-cut profile —
// without this lookahead a strategy that leaves "one big component" out-ranks one
// that leaves "several medium sections" purely because the former has fewer
// immediate over-ceiling leaves, even though it recurses far worse.
func (wg *workGraph) bestDivision(c *Chunk, by []string, floor, ceiling, maxDepth, depth int) *Division {
	cands := wg.candidateDivisions(c, by, floor, ceiling)
	if len(cands) == 0 {
		return nil
	}
	for i := range cands {
		wg.expandSections(cands[i].Sections, by, floor, ceiling, maxDepth, depth)
	}
	wg.rankDivisions(cands, ceiling)
	chosen := cands[0]
	chosen.Rank = 1
	return &chosen
}

// candidateDivisions runs each requested strategy once over a (sub-)chunk and
// returns the flat (un-recursed) divisions that actually split it — ≥2 sections,
// none below the floor. Ranking and recursion are layered on by the callers.
func (wg *workGraph) candidateDivisions(c *Chunk, by []string, floor, ceiling int) []Division {
	divs := []Division{}
	for _, strat := range selectStrategies(by) {
		labels := wg.splitBy(strat, c, ceiling)
		sections, dag := wg.buildSections(c, labels)
		if len(sections) < 2 {
			continue // strategy didn't actually divide the chunk
		}
		if floor > 0 && anyBelowFloor(sections, floor) {
			continue // never suggest a cut yielding a sub-chunk under the floor
		}
		divs = append(divs, Division{
			Strategy:  strat,
			Sections:  sections,
			DAG:       dag,
			Rationale: rationaleFor(strat),
		})
	}
	return divs
}

// expandSections lazily re-divides each over-ceiling section in place. It
// recurses only into sections that are over the ceiling (by effective
// complexity), span ≥2 SCCs (loops are never cut, at any level), and re-divide
// cleanly; the section keeps the single best fully-recursed sub-division chosen
// by bestDivision (look-ahead — every candidate is expanded before the choice is
// made). curDepth is the level of the division owning these sections (top-level
// == 1); nested divisions land at curDepth+1 and are bounded by maxDepth. Floors
// are enforced by candidateDivisions.
func (wg *workGraph) expandSections(sections []Section, by []string, floor, ceiling, maxDepth, curDepth int) {
	if curDepth >= maxDepth {
		return // a nested division here would exceed the depth budget
	}
	for i := range sections {
		s := &sections[i]
		if wg.effectiveComplexity(s.Members) <= ceiling {
			continue // lazy: only break down sections still too big (coupling-aware)
		}
		if wg.distinctSCCs(s.Members) < 2 {
			continue // loop / single-node section — no seam to cut
		}
		sub := wg.subChunk(s.ID, s.Members)
		if best := wg.bestDivision(sub, by, floor, ceiling, maxDepth, curDepth+1); best != nil {
			s.Divisions = []Division{*best}
		}
	}
}

// subChunk builds a transient chunk over a section's member set so the strategy
// menu can be re-run on it. Roots are the subset's binding-in-degree-0 entry
// points (or the smallest member when the subset is a pure cycle). The section
// ID is reused as the sub-chunk ID so nested section IDs stay hierarchical.
func (wg *workGraph) subChunk(id string, members []string) *Chunk {
	memberSet := setOf(members)
	indeg := make(map[string]int, len(members))
	for _, m := range members {
		indeg[m] = 0
	}
	for _, from := range members {
		for _, to := range sortedSet(wg.binding[from]) {
			if memberSet[to] {
				indeg[to]++
			}
		}
	}
	var roots []ChunkRoot
	for _, m := range members { // members arrive sorted from buildSections
		if indeg[m] == 0 {
			roots = append(roots, ChunkRoot{Key: m, Reaches: wg.bindingReachable(m, memberSet)})
		}
	}
	if len(roots) == 0 && len(members) > 0 {
		roots = append(roots, ChunkRoot{Key: members[0], Reaches: wg.bindingReachable(members[0], memberSet)})
	}
	return &Chunk{ID: id, Roots: roots, Members: members}
}

// effectiveComplexity is the coupling-aware Ec(S) = N(S) + λ·Ein(S) with λ=1:
// the additive node-complexity sum N plus the count of binding edges internal
// to S. A tangled unit therefore costs more than the sum of its sub-units (the
// severed edges drop out of the children), which is what lets a cut reduce
// effective complexity — the "tree > sum of subtrees" property. Used only for
// the explore phase's decision logic (the recursion over-ceiling test and the
// ranking); the public Section/Chunk complexity stays the additive N.
func (wg *workGraph) effectiveComplexity(members []string) int {
	n := 0
	for _, m := range members {
		n += wg.nodes[m].complexity
	}
	return n + wg.internalBindingEdges(setOf(members))
}

// rankDivisions sorts whole-compound candidates by the coupling-aware ranking
// key and assigns 1-based ranks. The deterministic lexicographic key, evaluated
// on the fully-recursed compound:
//
//  1. fewer leaves still over the ceiling *that were cuttable* (did the compound
//     tame what it could — loop/single-node residue does not count, see
//     leavesOverCeiling);
//  2. lower worst-leaf effective complexity Ec (coupling-aware balance — the
//     biggest authorable unit left behind);
//  3. fewer top-level sections (coherence / anti-shatter — the harness reads the
//     top level first, so a few coherent units beat a spray of fragments);
//  4. greater parallel width (the decoupling reward — more mutually-independent
//     authorable units — as a tie-break once taming and coherence agree);
//  5. fewer total sections, then shallower depth (parsimony);
//  6. strategy priority (structural-call strategies before deployment ones, see
//     strategyPriority): when two cuts are otherwise equivalent, prefer the one
//     intrinsic to the call structure over one that merely follows the
//     deployment layout, and break final ties deterministically by name.
//
// Why this order (calibrated against temporal-compranda; see
// internal/changes/temp-change-set/chunks/METRIC_CALIBRATION.md): parallel width
// measured on the recursed leaves rewards gratuitous shattering, so it must sit
// *below* the coherence brake, not above it; and once recursion has a proper
// look-ahead the strategies converge on the same leaves, so the headline choice
// comes down to which top-level grouping is most coherent and structural.
func (wg *workGraph) rankDivisions(divs []Division, ceiling int) {
	sort.SliceStable(divs, func(i, j int) bool {
		if oi, oj := wg.leavesOverCeiling(divs[i], ceiling), wg.leavesOverCeiling(divs[j], ceiling); oi != oj {
			return oi < oj
		}
		if wi, wj := wg.worstLeafEc(divs[i]), wg.worstLeafEc(divs[j]); wi != wj {
			return wi < wj
		}
		if ti, tj := len(divs[i].Sections), len(divs[j].Sections); ti != tj {
			return ti < tj
		}
		if pi, pj := wg.parallelWidth(divs[i]), wg.parallelWidth(divs[j]); pi != pj {
			return pi > pj
		}
		if si, sj := totalSectionCount(divs[i]), totalSectionCount(divs[j]); si != sj {
			return si < sj
		}
		if di, dj := divisionDepth(divs[i]), divisionDepth(divs[j]); di != dj {
			return di < dj
		}
		if ai, aj := strategyPriority(divs[i].Strategy), strategyPriority(divs[j].Strategy); ai != aj {
			return ai < aj
		}
		return divs[i].Strategy < divs[j].Strategy
	})
	for i := range divs {
		divs[i].Rank = i + 1
	}
}

// strategyPriority orders strategies for the ranking's penultimate tie-break:
// the call-structure strategies (service, subtree, tree, nexus) — intrinsic to
// the design — are preferred over the deployment strategies (worker, namespace),
// which merely follow how the design happens to be deployed. service and subtree
// lead because surfacing a shared service or a composition seam is the headline
// structural insight for authorship parallelism.
func strategyPriority(s string) int {
	switch s {
	case StrategyService:
		return 0
	case StrategySubtree:
		return 1
	case StrategyTree:
		return 2
	case StrategyNexus:
		return 3
	case StrategyWorker:
		return 4
	case StrategyNamespace:
		return 5
	default:
		return 6
	}
}

// collectLeaves returns a division's leaf sections (those with no sub-division)
// after full recursion — the authorable units the compound leaves behind.
func collectLeaves(d Division) []Section {
	var out []Section
	for _, s := range d.Sections {
		if len(s.Divisions) == 0 {
			out = append(out, s)
			continue
		}
		for _, nd := range s.Divisions {
			out = append(out, collectLeaves(nd)...)
		}
	}
	return out
}

// worstLeafEc is the largest effective complexity Ec among a division's leaf
// sections — the coupling-aware balance metric (the biggest authorable unit the
// compound leaves behind).
func (wg *workGraph) worstLeafEc(d Division) int {
	m := 0
	for _, s := range collectLeaves(d) {
		if ec := wg.effectiveComplexity(s.Members); ec > m {
			m = ec
		}
	}
	return m
}

// leavesOverCeiling counts the leaf sections the compound *failed to tame*:
// over the ceiling (by effective complexity) and still cuttable — i.e. spanning
// ≥2 SCCs. A leaf that is a single loop or a single node is uncuttable by this
// pass (loops are never cut), so leaving it over the ceiling is not a failure
// and must not be counted against a division — otherwise the cleanest
// structural cut is penalized for the chunk's irreducible tangle. This is the
// "did the compound tame what it could" key.
func (wg *workGraph) leavesOverCeiling(d Division, ceiling int) int {
	if ceiling <= 0 {
		return 0
	}
	n := 0
	for _, s := range collectLeaves(d) {
		if wg.effectiveComplexity(s.Members) > ceiling && wg.distinctSCCs(s.Members) >= 2 {
			n++
		}
	}
	return n
}

// totalSectionCount counts every section across the whole compound tree.
func totalSectionCount(d Division) int {
	n := len(d.Sections)
	for _, s := range d.Sections {
		for _, nd := range s.Divisions {
			n += totalSectionCount(nd)
		}
	}
	return n
}

// divisionDepth is the deepest nesting level of divisions (this division == 1).
func divisionDepth(d Division) int {
	deepest := 0
	for _, s := range d.Sections {
		for _, nd := range s.Divisions {
			if dd := divisionDepth(nd); dd > deepest {
				deepest = dd
			}
		}
	}
	return 1 + deepest
}

// buildSections groups members by label into sections (sorted, with a stable ID
// per label) and derives the dependency DAG from binding edges that cross
// section boundaries. A SectionEdge From→To means From depends on To (From calls
// into To), so the harness can order authoring. labels is a member→section
// labeling produced by a splitBy* strategy.
func (wg *workGraph) buildSections(c *Chunk, labels map[string]string) ([]Section, []SectionEdge) {
	byLabel := map[string][]string{}
	for _, m := range c.Members {
		byLabel[labels[m]] = append(byLabel[labels[m]], m)
	}

	orderedLabels := make([]string, 0, len(byLabel))
	for lab := range byLabel {
		orderedLabels = append(orderedLabels, lab)
	}
	sort.Strings(orderedLabels)

	secID := map[string]string{}
	sections := make([]Section, 0, len(orderedLabels))
	for _, lab := range orderedLabels {
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
		lf := labels[from]
		for _, to := range sortedSet(wg.binding[from]) {
			lt, in := labels[to]
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

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

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
