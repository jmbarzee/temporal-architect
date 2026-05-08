// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

export type NodeLevel = 1 | 2 | 3 | 4

// Node types in the graph.
//   L1 namespace
//   L2 worker / nexusService — hosting tier (workers run code, services
//      expose a callable API surface). Both attach to a namespace as their
//      parent and can sit beside each other in the L2 band.
//   L3 workflow / nexusOperation — orchestrators and call surfaces (the
//      "what does work get organised through" tier). Operations are the
//      callable units of a service; workflows are the orchestrating units
//      run by a worker.
//   L4 activity — leaves of the call tree (the "where work actually
//      happens" tier). Pulled out of L3 so workflows and activities don't
//      both crowd the same band on the canvas.
//
// nexusOperation parents to its nexusService (an L3-under-L2 containment),
// so a nexus call shows up as caller → operation → backing (each leg is
// its own dependency edge). The operation node carries the "this is a
// nexus call" semantics that used to live on a special edge type.
export type NodeType = 'namespace' | 'worker' | 'workflow' | 'activity' | 'nexusService' | 'nexusOperation'

export interface GraphNode {
  id: string            // e.g. "namespace:MyNS", "worker:MyWorker", "workflow:ProcessOrder", "nexusOperation:Svc.Op"
  level: NodeLevel
  nodeType: NodeType
  name: string
  sourceFile?: string
  parentId?: string     // containment parent (worker for L3, namespace for L2, nexusService for nexusOperation)
  orphan: boolean       // true if no parent in the hierarchy
}

export type EdgeType = 'containment' | 'dependency'

export interface GraphEdge {
  id: string
  edgeType: EdgeType
  sourceId: string
  targetId: string
  sourceLevel: NodeLevel
  targetLevel: NodeLevel
  sourceNodeType: NodeType
  targetNodeType: NodeType
  // Endpoint metadata for dependency edges that originate from a nexus call.
  // The operation and service identities are encoded in the target node, but
  // the endpoint is per-call-site (the same operation can be reached via two
  // endpoints in different namespaces) so it stays on the edge.
  nexusEndpoint?: string
}

export interface Graph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
}

// Helpers

export function nodeId(nodeType: NodeType, name: string): string {
  return `${nodeType}:${name}`
}

export function nodeLevel(nodeType: NodeType): NodeLevel {
  switch (nodeType) {
    case 'namespace': return 1
    case 'worker':
    case 'nexusService': return 2
    case 'workflow':
    case 'nexusOperation': return 3
    case 'activity': return 4
  }
}
