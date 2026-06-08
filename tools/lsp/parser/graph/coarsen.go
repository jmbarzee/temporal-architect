package graph

import "strings"

// emitCoarsenedEdges projects each dispatch edge up to higher
// containment tiers (worker, namespace) and aggregates by
// (from, to, tier). Containment edges don't contribute. Self-loops
// are dropped per REVISIONS_003 § "Coarsened edges":
//
//   - A call between two definitions hosted on the same worker
//     yields no worker-tier edge (worker → itself).
//   - A call within one namespace yields no namespace-tier edge.
//
// AsyncBacking edges DO contribute (they're dispatch — the operation
// starts the workflow on the queue, which is a real cross-deployment
// dispatch when the workflow lives on a different worker).
//
// Tier IDs are obtained by parent-lookup from the deployment node:
// worker-tier is the node's parent worker (looked up via the
// containment edges already emitted), namespace-tier is the parent
// namespace. Endpoint and namespace nodes don't participate as
// edge endpoints — they never appear on dispatch edges.
func (g *Graph) emitCoarsenedEdges() {
	parents := g.buildParentIndex()

	type aggKey struct {
		from, to, tier string
	}
	agg := map[aggKey]int{}

	for _, e := range g.Edges {
		if e.Kind == EdgeContainment {
			continue
		}

		fromWorker, okF := parents.worker[e.From]
		toWorker, okT := parents.worker[e.To]
		if okF && okT && fromWorker != toWorker {
			agg[aggKey{from: fromWorker, to: toWorker, tier: TierWorker}]++
		}

		fromNS, okFN := parents.namespace[e.From]
		toNS, okTN := parents.namespace[e.To]
		if okFN && okTN && fromNS != toNS {
			agg[aggKey{from: fromNS, to: toNS, tier: TierNamespace}]++
		}
	}

	for k, w := range agg {
		g.CoarsenedEdges = append(g.CoarsenedEdges, CoarsenedEdge{
			From:   k.from,
			To:     k.to,
			Tier:   k.tier,
			Weight: w,
		})
	}
}

// parentIndex maps each deployment node ID to its containing worker
// deployment ID and namespace ID, both derived purely from the
// already-emitted containment edges (the single source of truth for
// membership).
type parentIndex struct {
	worker    map[string]string
	namespace map[string]string
}

func (g *Graph) buildParentIndex() parentIndex {
	// child → parent from containment edges, and node-id → kind so we can
	// walk the chain looking for the enclosing worker / namespace.
	parentEdge := make(map[string]string, len(g.Edges))
	for _, e := range g.Edges {
		if e.Kind == EdgeContainment {
			parentEdge[e.From] = e.To
		}
	}
	kindByID := make(map[string]string, len(g.Nodes))
	for i := range g.Nodes {
		kindByID[g.Nodes[i].ID] = defKindOf(g.Nodes[i].Definition)
	}

	pi := parentIndex{
		worker:    map[string]string{},
		namespace: map[string]string{},
	}
	for i := range g.Nodes {
		n := &g.Nodes[i]
		if n.Orphan {
			continue
		}
		if w := ancestorOfKind(n.ID, kindWorker, parentEdge, kindByID); w != "" {
			pi.worker[n.ID] = w
		}
		if ns := ancestorOfKind(n.ID, kindNamespace, parentEdge, kindByID); ns != "" {
			pi.namespace[n.ID] = ns
		}
	}

	return pi
}

// ancestorOfKind walks containment parents upward from id (exclusive of
// id itself) and returns the first ancestor node whose definition kind
// matches wantKind, or "" if none is found.
func ancestorOfKind(id, wantKind string, parentEdge, kindByID map[string]string) string {
	for cur := id; ; {
		p, ok := parentEdge[cur]
		if !ok {
			return ""
		}
		if kindByID[p] == wantKind {
			return p
		}
		cur = p
	}
}

// defKindOf returns the kind segment of a definition key
// (`workflow:Foo` → `workflow`, `nexusOperation:Svc.Op` → `nexusOperation`).
func defKindOf(def string) string {
	if i := strings.IndexByte(def, ':'); i >= 0 {
		return def[:i]
	}
	return def
}
