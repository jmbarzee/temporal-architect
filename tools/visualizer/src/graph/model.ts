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
  id: string            // e.g. "namespace:MyNS", "worker:MyWorker", "workflow:ProcessOrder@WorkerA", "nexusOperation:Svc.Op@WorkerB"
  level: NodeLevel
  nodeType: NodeType
  name: string
  sourceFile?: string
  parentId?: string     // containment parent (worker for L3, namespace for L2, nexusService for nexusOperation)
  orphan: boolean       // true if no parent in the hierarchy
  // Stable identifier shared across every copy of the same underlying
  // definition. An activity registered on three workers produces three
  // nodes with three distinct `id`s but a single `definitionKey`. Used
  // to look up sister copies for the duplicate-highlight interaction
  // and as the grouping key for `Graph.duplicateGroups`.
  //
  // Form: `${nodeType}:${disambiguator}` — for nexus operations the
  // disambiguator is `${serviceName}.${opName}` so two services can
  // each declare an op named "Run" without collapsing them.
  definitionKey: string
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
  // Definition key → every node id that represents a copy of that
  // definition. Populated by `buildGraph` once all nodes exist. For
  // singletons (one worker registration, or an orphan definition) the
  // set has one entry. For an activity registered on three workers the
  // set has three. Consumers read this to keep sister copies undimmed
  // during hover/select interactions in GraphView.
  duplicateGroups: Map<string, Set<string>>
}

// Helpers

// Base node id used by L1 (namespace) and L2 (worker) nodes — types
// that are never duplicated. L3 / L2-service nodes use the
// worker-scoped variant below so that the same definition registered
// on multiple workers yields distinct node ids.
export function nodeId(nodeType: NodeType, name: string): string {
  return `${nodeType}:${name}`
}

// Worker-scoped node id for L3 / NexusService nodes when they belong
// to a specific worker. When `workerName` is omitted the node is an
// orphan (no worker registration) and the unscoped id is returned;
// the unscoped form is also the duplicate-group key for that
// definition. Operations belong to their service and inherit the
// service's worker scope — pass the service's `workerName` through.
export function workerScopedNodeId(nodeType: NodeType, name: string, workerName?: string): string {
  return workerName ? `${nodeType}:${name}@${workerName}` : `${nodeType}:${name}`
}

// Stable key used to group every copy of a definition. Operations
// disambiguate their name with the parent service to avoid colliding
// across services that each declare an op with the same name.
export function definitionKey(nodeType: NodeType, name: string): string {
  return `${nodeType}:${name}`
}

export function nexusOperationName(serviceName: string, opName: string): string {
  return `${serviceName}.${opName}`
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
