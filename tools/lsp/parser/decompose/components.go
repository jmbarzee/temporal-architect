package decompose

import (
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// condense runs Tarjan's strongly-connected-components algorithm over the
// binding subgraph and records the condensation. Each SCC's members are sorted;
// SCCs are produced in reverse-topological order. Workflow-call cycles collapse
// into a single SCC so a loop is never split downstream.
func (wg *workGraph) condense() {
	index := 0
	indices := map[string]int{}
	low := map[string]int{}
	onStack := map[string]bool{}
	var stack []string
	var sccs [][]string

	var strongconnect func(v string)
	strongconnect = func(v string) {
		indices[v] = index
		low[v] = index
		index++
		stack = append(stack, v)
		onStack[v] = true

		for _, w := range sortedSet(wg.binding[v]) {
			if _, seen := indices[w]; !seen {
				strongconnect(w)
				if low[w] < low[v] {
					low[v] = low[w]
				}
			} else if onStack[w] {
				if indices[w] < low[v] {
					low[v] = indices[w]
				}
			}
		}

		if low[v] == indices[v] {
			var comp []string
			for {
				w := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				onStack[w] = false
				comp = append(comp, w)
				if w == v {
					break
				}
			}
			sort.Strings(comp)
			sccs = append(sccs, comp)
		}
	}

	for _, v := range wg.sortedKeys() {
		if _, seen := indices[v]; !seen {
			strongconnect(v)
		}
	}

	wg.scc = sccs
	wg.sccOf = map[string]int{}
	for i, comp := range sccs {
		for _, m := range comp {
			wg.sccOf[m] = i
		}
	}

	wg.cond = map[int]map[int]bool{}
	for from := range wg.binding {
		for to := range wg.binding[from] {
			fi, ti := wg.sccOf[from], wg.sccOf[to]
			if fi == ti {
				continue
			}
			if wg.cond[fi] == nil {
				wg.cond[fi] = map[int]bool{}
			}
			wg.cond[fi][ti] = true
		}
	}
}

// partition computes the #1 hard partition: weakly-connected components of the
// binding+soft subgraph. Every definition lands in exactly one chunk. It also
// returns the inter-chunk contract dependency DAG (nexusCall edges between
// chunks). Isolated definitions (no edges) are singleton chunks.
func (wg *workGraph) partition(roots map[string]*Root) ([]Chunk, []ChunkEdge) {
	adj := map[string]map[string]bool{}
	addUndir := func(a, b string) {
		if adj[a] == nil {
			adj[a] = map[string]bool{}
		}
		if adj[b] == nil {
			adj[b] = map[string]bool{}
		}
		adj[a][b] = true
		adj[b][a] = true
	}
	for from := range wg.binding {
		for to := range wg.binding[from] {
			addUndir(from, to)
		}
	}
	for from := range wg.soft {
		for to := range wg.soft[from] {
			addUndir(from, to)
		}
	}

	visited := map[string]bool{}
	compOf := map[string]string{}
	var chunks []Chunk
	for _, start := range wg.sortedKeys() {
		if visited[start] {
			continue
		}
		var members []string
		queue := []string{start}
		visited[start] = true
		for len(queue) > 0 {
			v := queue[0]
			queue = queue[1:]
			members = append(members, v)
			for _, w := range sortedSet(adj[v]) {
				if !visited[w] {
					visited[w] = true
					queue = append(queue, w)
				}
			}
		}
		sort.Strings(members)
		chunk := wg.buildChunk(members, roots)
		for _, m := range members {
			compOf[m] = chunk.ID
		}
		chunks = append(chunks, chunk)
	}
	sort.Slice(chunks, func(i, j int) bool { return chunks[i].ID < chunks[j].ID })

	// inter-chunk contract edges (nexusCall), deduped.
	seen := map[string]bool{}
	cedges := []ChunkEdge{}
	for _, from := range wg.sortedKeys() {
		for _, to := range sortedSet(wg.contract[from]) {
			cf, ct := compOf[from], compOf[to]
			if cf == "" || ct == "" || cf == ct {
				continue
			}
			k := cf + "\x00" + ct
			if seen[k] {
				continue
			}
			seen[k] = true
			cedges = append(cedges, ChunkEdge{From: cf, To: ct, Via: graph.EdgeNexusCall})
		}
	}
	sort.Slice(cedges, func(i, j int) bool {
		if cedges[i].From != cedges[j].From {
			return cedges[i].From < cedges[j].From
		}
		return cedges[i].To < cedges[j].To
	})

	return chunks, cedges
}

// buildChunk assembles a single chunk from its weakly-connected member set:
// roots present in it, per-root SCC-collapsed binding reachability, the overlap
// set (members reachable from more than one root), complexity rollup, and the
// cyclic flag (any non-trivial SCC present).
func (wg *workGraph) buildChunk(members []string, roots map[string]*Root) Chunk {
	memberSet := setOf(members)

	complexity := 0
	cyclic := false
	for _, m := range members {
		complexity += wg.nodes[m].complexity
		if len(wg.scc[wg.sccOf[m]]) > 1 {
			cyclic = true
		}
	}

	var rootKeys []string
	for _, m := range members {
		if roots[m] != nil {
			rootKeys = append(rootKeys, m)
		}
	}
	sort.Strings(rootKeys)

	reachCount := map[string]int{}
	chunkRoots := make([]ChunkRoot, 0, len(rootKeys))
	for _, rk := range rootKeys {
		reaches := wg.bindingReachable(rk, memberSet)
		for _, x := range reaches {
			reachCount[x]++
		}
		chunkRoots = append(chunkRoots, ChunkRoot{Key: rk, Reaches: reaches})
	}

	var overlap []string
	for _, m := range members {
		if reachCount[m] > 1 {
			overlap = append(overlap, m)
		}
	}
	sort.Strings(overlap)

	return Chunk{
		ID:         chunkID(rootKeys, members),
		Roots:      chunkRoots,
		Members:    members,
		Overlap:    overlap,
		Complexity: complexity,
		Cyclic:     cyclic,
	}
}

// bindingReachable returns the set of members reachable from root over binding
// edges (including root itself), sorted. Cycle members are mutually reachable,
// so this set is naturally SCC-collapsed.
func (wg *workGraph) bindingReachable(root string, memberSet map[string]bool) []string {
	visited := map[string]bool{root: true}
	queue := []string{root}
	for len(queue) > 0 {
		v := queue[0]
		queue = queue[1:]
		for _, w := range sortedSet(wg.binding[v]) {
			if memberSet[w] && !visited[w] {
				visited[w] = true
				queue = append(queue, w)
			}
		}
	}
	return sortedSet(visited)
}

// distinctSCCs counts how many distinct SCCs the member set spans. A chunk with
// fewer than two has no condensation-DAG seam to cut and is exempt from #2.
func (wg *workGraph) distinctSCCs(members []string) int {
	seen := map[int]bool{}
	for _, m := range members {
		seen[wg.sccOf[m]] = true
	}
	return len(seen)
}

// chunkID derives a stable chunk identifier from the lexicographically smallest
// root key (or member key, when a chunk somehow has no root).
func chunkID(rootKeys, members []string) string {
	base := ""
	switch {
	case len(rootKeys) > 0:
		base = rootKeys[0]
	case len(members) > 0:
		base = members[0]
	}
	return "chunk:" + base
}

// setOf builds a presence set from a slice.
func setOf(keys []string) map[string]bool {
	m := make(map[string]bool, len(keys))
	for _, k := range keys {
		m[k] = true
	}
	return m
}
