package decompose

import "sort"

// This file measures a division's parallel width — how many of its authorable
// leaf units are mutually independent (no call dependency either way), i.e. can
// be authored in parallel. It is the decoupling reward in the ranking key: a
// balance cut is blind to it, but service / subtree extraction that genuinely
// separates work scores higher. Parallel width is the maximum antichain of the
// leaf dependency poset, computed via Dilworth's theorem (max antichain =
// elements − maximum matching of the strict-reachability relation).

// parallelWidth returns the size of the maximum antichain over a division's
// leaf sections (after full recursion) under the binding call relation. Leaves
// partition the chunk's members, so the relation is well defined; mutually
// reachable leaves (a split SCC, rare since loops are exempt) collapse into one
// element first so the relation is a genuine partial order.
func (wg *workGraph) parallelWidth(d Division) int {
	leaves := collectLeaves(d)
	if len(leaves) <= 1 {
		return len(leaves)
	}

	leafOf := map[string]int{}
	for i, s := range leaves {
		for _, m := range s.Members {
			leafOf[m] = i
		}
	}

	// Direct leaf→leaf edges from binding edges crossing leaf boundaries.
	n := len(leaves)
	adj := make([][]int, n)
	seen := make([]map[int]bool, n)
	for i := range seen {
		seen[i] = map[int]bool{}
	}
	for from := range wg.binding {
		lf, ok := leafOf[from]
		if !ok {
			continue
		}
		for to := range wg.binding[from] {
			lt, ok := leafOf[to]
			if !ok || lt == lf || seen[lf][lt] {
				continue
			}
			seen[lf][lt] = true
			adj[lf] = append(adj[lf], lt)
		}
	}

	reach := transitiveReach(adj)

	// Collapse mutually-reachable leaves into components (genuine poset).
	comp := make([]int, n)
	for i := range comp {
		comp[i] = -1
	}
	nComp := 0
	for i := 0; i < n; i++ {
		if comp[i] != -1 {
			continue
		}
		comp[i] = nComp
		for j := i + 1; j < n; j++ {
			if comp[j] == -1 && reach[i][j] && reach[j][i] {
				comp[j] = nComp
			}
		}
		nComp++
	}

	// Strict precedence between distinct components.
	strict := make([]map[int]bool, nComp)
	for i := range strict {
		strict[i] = map[int]bool{}
	}
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			if comp[i] != comp[j] && reach[i][j] {
				strict[comp[i]][comp[j]] = true
			}
		}
	}
	bip := make([][]int, nComp)
	for i := 0; i < nComp; i++ {
		for j := range strict[i] {
			bip[i] = append(bip[i], j)
		}
		sort.Ints(bip[i])
	}

	return nComp - maxBipartiteMatching(nComp, bip)
}

// transitiveReach computes the reachability closure of a digraph given as a
// sorted adjacency list (reach[i][j] true when j is reachable from i over ≥1
// edge). Sizes here are tens of nodes, so a per-source BFS is ample.
func transitiveReach(adj [][]int) [][]bool {
	n := len(adj)
	reach := make([][]bool, n)
	for i := 0; i < n; i++ {
		reach[i] = make([]bool, n)
		queue := append([]int(nil), adj[i]...)
		for len(queue) > 0 {
			v := queue[0]
			queue = queue[1:]
			if reach[i][v] {
				continue
			}
			reach[i][v] = true
			queue = append(queue, adj[v]...)
		}
	}
	return reach
}

// maxBipartiteMatching returns the size of a maximum matching of the bipartite
// graph with n left and n right vertices and edges adj (Kuhn's augmenting-path
// algorithm). Used by parallelWidth for the Dilworth minimum path cover.
func maxBipartiteMatching(n int, adj [][]int) int {
	matchR := make([]int, n)
	for i := range matchR {
		matchR[i] = -1
	}
	var try func(u int, used []bool) bool
	try = func(u int, used []bool) bool {
		for _, v := range adj[u] {
			if used[v] {
				continue
			}
			used[v] = true
			if matchR[v] == -1 || try(matchR[v], used) {
				matchR[v] = u
				return true
			}
		}
		return false
	}
	res := 0
	for u := 0; u < n; u++ {
		used := make([]bool, n)
		if try(u, used) {
			res++
		}
	}
	return res
}
