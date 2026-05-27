package graph

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
// deployment ID and namespace ID. Built from the already-emitted
// containment edges plus per-node fields so the lookup tolerates
// nodes that don't have an explicit parent edge (e.g. namespace
// nodes pointing to themselves trivially).
type parentIndex struct {
	worker    map[string]string
	namespace map[string]string
}

func (g *Graph) buildParentIndex() parentIndex {
	pi := parentIndex{
		worker:    map[string]string{},
		namespace: map[string]string{},
	}

	for i := range g.Nodes {
		n := &g.Nodes[i]
		if n.Orphan {
			continue
		}
		switch {
		case n.Worker != "" && n.Namespace != "":
			pi.worker[n.ID] = defKey(kindWorker, workerNameFromDef(n.Worker)) + "/" + n.Namespace
		}
		if n.Namespace != "" {
			pi.namespace[n.ID] = n.Namespace
		}
	}

	return pi
}

// workerNameFromDef strips the `worker:` prefix from a definition
// key. The result is the bare worker name suitable for re-assembling
// a worker deployment ID via workerID().
func workerNameFromDef(def string) string {
	const prefix = "worker:"
	if len(def) > len(prefix) && def[:len(prefix)] == prefix {
		return def[len(prefix):]
	}
	return def
}
