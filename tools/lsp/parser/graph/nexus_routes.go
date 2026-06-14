package graph

// emitNexusRoutes emits the structural composition edge between each
// nexus operation deployment and every endpoint deployment that fronts
// it. An endpoint is a top-level routing alias forwarding to a specific
// (namespace, queue); an operation is deployed at a specific
// (namespace, queue). When those tuples match, the endpoint is one of
// the routes by which a caller can reach the operation.
//
// This relationship is topology (deployment placement), not an observed
// dispatch — so the edge carries no Routing and is excluded from
// coarsening (see emitCoarsenedEdges). Direction is operation → endpoint,
// mirroring the call path's tail (caller → operation, operation fronted
// by endpoint).
//
// Emitting it here makes the parser the single source of truth for the
// endpoint↔operation relationship: downstream consumers read the edge
// rather than re-deriving it by matching node (namespace, queue) fields.
func (g *Graph) emitNexusRoutes(idx *astIndex) {
	for _, svc := range idx.nexusServices {
		serviceDeployments := idx.deploymentsHosting(KindNexusService, svc.Name)
		if len(serviceDeployments) == 0 {
			continue
		}
		for _, op := range svc.Operations {
			opName := nexusOpQualifiedName(svc.Name, op.Name)
			for _, opDep := range serviceDeployments {
				fromID := HostedID(KindNexusOperation, opName, opDep.WorkerName, opDep.NamespaceName, false)
				for _, ep := range idx.endpointsByName {
					if ep.Namespace != opDep.NamespaceName || ep.Queue != opDep.Queue {
						continue
					}
					g.Edges = append(g.Edges, Edge{
						From: fromID,
						To:   EndpointID(ep.Name, ep.Namespace),
						Kind: EdgeNexusRoute,
						Line: ep.Line,
					})
				}
			}
		}
	}
}
