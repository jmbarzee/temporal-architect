package decompose

import (
	"sort"
)

// This file owns the explore phase — the soft divisions suggested for
// over-ceiling chunks. It drives the cut strategies (strategies.go), turns each
// resulting labeling into sections + a dependency DAG, and ranks the candidates.
// Where the decide phase (partition, components.go) returns one mandatory
// answer, this phase explores many and offers the harness a ranked menu. Loops
// are never cut here.

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

// exploreStrategies tries every requested strategy on one over-ceiling chunk and
// returns the ranked candidate divisions. Each strategy that yields ≥2 sections
// — none below the floor — is a candidate; candidates are ranked by balance
// (smallest max-section complexity first), then by section count, then by
// strategy name. Strategies are explored independently, not in priority order.
func (wg *workGraph) exploreStrategies(c *Chunk, opts Options, floor int) []Division {
	divs := []Division{}
	for _, strat := range selectStrategies(opts.By) {
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

	rankDivisions(divs)
	return divs
}

// rankDivisions sorts candidates by balance (smallest max-section complexity
// first), then section count, then strategy name, and assigns 1-based ranks.
func rankDivisions(divs []Division) {
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
