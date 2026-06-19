package decompose

import "sort"

// superSource is the virtual entry above all roots in the dominator computation.
// It is a non-empty sentinel (member keys are always "kind:Name") so a root's
// immediate dominator is distinguishable from an absent map entry.
const superSource = "\x00super-source"

// This file computes dominators over the binding subgraph — the structural
// primitive behind the service and subtree strategies. A node X *dominates* Y
// when every path from an entry point to Y passes through X; X's dominated
// closure (X plus everything it dominates) is therefore a clean module —
// reachable only via X — which is exactly the unit those strategies extract.
// Raw in-degree can't recover this (a shared service's private activities have
// in-degree 1 from the service yet are dominated by it); dominators can.

// bindingDominators computes the immediate dominator of every member reachable
// from roots over the binding subgraph restricted to memberSet. A virtual
// super-source above all roots is modeled by the sentinel key "" (member keys
// are never empty), so a root's immediate dominator is "". Members unreachable
// from any root are absent from the result.
//
// Cooper–Harvey–Kennedy iterative dominance over a deterministic reverse
// postorder — O(n·E) worst case, ample at this scale and fully deterministic.
func (wg *workGraph) bindingDominators(roots []string, memberSet map[string]bool) map[string]string {
	const src = superSource
	succ := func(v string) []string {
		if v == src {
			rs := append([]string(nil), roots...)
			sort.Strings(rs)
			return rs
		}
		var out []string
		for _, w := range sortedSet(wg.binding[v]) {
			if memberSet[w] {
				out = append(out, w)
			}
		}
		return out
	}

	// Postorder DFS from the super-source (successors visited in sorted order
	// → deterministic numbering). The source receives the highest number.
	var postorder []string
	seen := map[string]bool{src: true}
	var dfs func(v string)
	dfs = func(v string) {
		for _, w := range succ(v) {
			if !seen[w] {
				seen[w] = true
				dfs(w)
			}
		}
		postorder = append(postorder, v)
	}
	dfs(src)

	poNum := make(map[string]int, len(postorder))
	for i, v := range postorder {
		poNum[v] = i
	}
	rpo := make([]string, 0, len(postorder)) // reverse postorder, excluding src
	for i := len(postorder) - 1; i >= 0; i-- {
		if postorder[i] != src {
			rpo = append(rpo, postorder[i])
		}
	}

	preds := map[string][]string{}
	for _, v := range postorder {
		for _, w := range succ(v) {
			preds[w] = append(preds[w], v)
		}
	}

	idom := map[string]string{src: src}
	intersect := func(a, b string) string {
		for a != b {
			for poNum[a] < poNum[b] {
				a = idom[a]
			}
			for poNum[b] < poNum[a] {
				b = idom[b]
			}
		}
		return a
	}

	for changed := true; changed; {
		changed = false
		for _, b := range rpo {
			newIdom, have := "", false
			for _, p := range preds[b] {
				if _, ok := idom[p]; !ok {
					continue // predecessor not yet processed
				}
				if !have {
					newIdom, have = p, true
				} else {
					newIdom = intersect(p, newIdom)
				}
			}
			if have && idom[b] != newIdom {
				idom[b] = newIdom
				changed = true
			}
		}
	}

	delete(idom, src) // leave roots pointing at the sentinel to mark them as entries
	return idom
}

// dominatedClosure returns the set of members dominated by hub (hub itself plus
// every node whose dominator chain passes through hub) given an immediate-
// dominator map from bindingDominators. This is the clean module rooted at hub.
func dominatedClosure(hub string, idom map[string]string) map[string]bool {
	closure := map[string]bool{hub: true}
	for x := range idom {
		for cur := x; ; {
			if cur == hub {
				closure[x] = true
				break
			}
			next, ok := idom[cur]
			if !ok || next == superSource || next == cur {
				break
			}
			cur = next
		}
	}
	return closure
}
