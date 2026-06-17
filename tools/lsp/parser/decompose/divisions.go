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
// top-level strategy is fully expanded); within each, recursion is greedy —
// every over-ceiling section keeps only its single locally-best sub-division
// (see expandSections). Candidates are ranked by whole-compound balance
// (rankDivisions). Strategies are explored independently, not in priority order.
func (wg *workGraph) exploreStrategies(c *Chunk, opts Options, floor int) []Division {
	divs := wg.candidateDivisions(c, opts.By, floor)
	maxDepth := opts.effectiveMaxDepth()
	for i := range divs {
		wg.expandSections(divs[i].Sections, opts.By, floor, opts.Ceiling, maxDepth, 1)
	}
	rankDivisions(divs)
	return divs
}

// candidateDivisions runs each requested strategy once over a (sub-)chunk and
// returns the flat (un-recursed) divisions that actually split it — ≥2 sections,
// none below the floor. Ranking and recursion are layered on by the callers.
func (wg *workGraph) candidateDivisions(c *Chunk, by []string, floor int) []Division {
	divs := []Division{}
	for _, strat := range selectStrategies(by) {
		labels := wg.splitBy(strat, c)
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
// recurses only into sections that are over the ceiling, span ≥2 SCCs (loops are
// never cut, at any level), and re-divide cleanly; the section keeps a single
// locally-best sub-division (greedy inner choice — rank-1 by the same metric),
// which is itself recursively expanded. curDepth is the level of the division
// owning these sections (top-level == 1); nested divisions land at curDepth+1
// and are bounded by maxDepth. Floors are enforced by candidateDivisions.
func (wg *workGraph) expandSections(sections []Section, by []string, floor, ceiling, maxDepth, curDepth int) {
	if curDepth >= maxDepth {
		return // a nested division here would exceed the depth budget
	}
	for i := range sections {
		s := &sections[i]
		if s.Complexity <= ceiling {
			continue // lazy: only break down sections that are still too big
		}
		if wg.distinctSCCs(s.Members) < 2 {
			continue // loop / single-node section — no seam to cut
		}
		sub := wg.subChunk(s.ID, s.Members)
		cands := wg.candidateDivisions(sub, by, floor)
		if len(cands) == 0 {
			continue
		}
		rankDivisions(cands)
		chosen := cands[0]
		wg.expandSections(chosen.Sections, by, floor, ceiling, maxDepth, curDepth+1)
		chosen.Rank = 1
		s.Divisions = []Division{chosen}
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

// rankDivisions sorts candidates by whole-compound balance and assigns 1-based
// ranks. The primary key is the worst *leaf* complexity (the largest unit left
// after full recursion — smaller is better), then leaf count, then nesting
// depth (shallower wins for an equal result), then total section count, then
// strategy name. For a flat (un-recursed) division this reduces to the original
// "max-section complexity, then section count, then name" ordering.
func rankDivisions(divs []Division) {
	sort.SliceStable(divs, func(i, j int) bool {
		if wi, wj := worstLeafComplexity(divs[i]), worstLeafComplexity(divs[j]); wi != wj {
			return wi < wj
		}
		if li, lj := leafCount(divs[i]), leafCount(divs[j]); li != lj {
			return li < lj
		}
		if di, dj := divisionDepth(divs[i]), divisionDepth(divs[j]); di != dj {
			return di < dj
		}
		if si, sj := totalSectionCount(divs[i]), totalSectionCount(divs[j]); si != sj {
			return si < sj
		}
		return divs[i].Strategy < divs[j].Strategy
	})
	for i := range divs {
		divs[i].Rank = i + 1
	}
}

// worstLeafComplexity is the largest complexity among a division's leaf sections
// (those with no sub-division), recursing through nested divisions. It is the
// whole-compound balance metric: the biggest authorable unit the compound leaves
// behind.
func worstLeafComplexity(d Division) int {
	m := 0
	for _, s := range d.Sections {
		if len(s.Divisions) == 0 {
			if s.Complexity > m {
				m = s.Complexity
			}
			continue
		}
		for _, nd := range s.Divisions {
			if w := worstLeafComplexity(nd); w > m {
				m = w
			}
		}
	}
	return m
}

// leafCount counts the division's leaf sections after full recursion.
func leafCount(d Division) int {
	n := 0
	for _, s := range d.Sections {
		if len(s.Divisions) == 0 {
			n++
			continue
		}
		for _, nd := range s.Divisions {
			n += leafCount(nd)
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
