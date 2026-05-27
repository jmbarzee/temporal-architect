// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

// Node levels. `1.5` is a sub-tier between L1 (namespace) and L2 (worker /
// service) reserved for `nexusEndpoint` nodes — endpoints are top-level
// like namespaces (they have no children) but they aren't containers, so
// they sit in their own band just below the namespace band.
export type NodeLevel = 1 | 1.5 | 2 | 3 | 4

// Node types in the graph.
//   L1   namespace
//   L1.5 nexusEndpoint — top-level routing alias, parented to namespace.
//        No outgoing edges (endpoints are pure addressing; they don't
//        themselves call anything). The nexus call's edge metadata
//        names the endpoint that routed it.
//   L2   worker / nexusService — hosting tier (workers run code, services
//        expose a callable API surface). Both attach to a namespace as their
//        parent and can sit beside each other in the L2 band.
//   L3   workflow / nexusOperation — orchestrators and call surfaces (the
//        "what does work get organised through" tier). Operations are the
//        callable units of a service; workflows are the orchestrating units
//        run by a worker.
//   L4   activity — leaves of the call tree (the "where work actually
//        happens" tier). Pulled out of L3 so workflows and activities don't
//        both crowd the same band on the canvas.
//
// nexusOperation parents to its nexusService (an L3-under-L2 containment),
// so a nexus call shows up as caller → operation → backing (each leg is
// its own dependency edge). The operation node carries the "this is a
// nexus call" semantics that used to live on a special edge type.
export type NodeType =
  | 'namespace'
  | 'nexusEndpoint'
  | 'worker'
  | 'nexusService'
  | 'workflow'
  | 'nexusOperation'
  | 'activity'

export interface GraphNode {
  /**
   * Composite deployment id from the parser graph. Form examples:
   *   - `namespace:MyNS`
   *   - `nexusEndpoint:PaymentEndpoint/namespace:MyNS`
   *   - `worker:MyWorker/namespace:MyNS`
   *   - `workflow:ProcessOrder/worker:WorkerA/namespace:MyNS`
   *   - `nexusOperation:Svc.Op/worker:WorkerB/namespace:MyNS`
   *   - `activity:Charge/orphan`  (uninstantiated definition)
   *
   * Identity is owned by the parser — the visualizer treats `id` as an
   * opaque string and never parses it for routing decisions.
   */
  id: string
  level: NodeLevel
  nodeType: NodeType
  name: string
  /** AST source file, joined in by buildGraph via the `definitionKey` lookup. */
  sourceFile?: string
  /** Containment parent (worker for L3, namespace for L2 and L1.5, nexusService for nexusOperation). */
  parentId?: string
  /** True when no parent in the hierarchy (uninstantiated definition). */
  orphan: boolean

  /**
   * Stable identifier shared across every copy of the same underlying
   * definition. An activity registered on three workers produces three
   * nodes with three distinct `id`s but a single `definitionKey`. Used
   * to look up sister copies for the duplicate-highlight interaction
   * and as the grouping key for `Graph.duplicateGroups`.
   *
   * Equals the parser's `node.definition` field — `${nodeType}:${name}`
   * (with the parent service name folded in for operations).
   */
  definitionKey: string

  // --- View-only deployment metadata, copied from the parser node for
  //     hover/tooltip rendering. They are diagnostic, not used for
  //     graph identity or routing decisions.
  /** e.g. `worker:paymentWorker`. Empty on namespace / endpoint / orphan nodes. */
  worker?: string
  /** e.g. `namespace:ecommerce`. Empty on namespace itself and on orphans. */
  namespace?: string
  /** Task queue name. Empty for nodes that don't have one. */
  queue?: string
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

/**
 * Tier number for a node type. Used for sizing, edge styling, and the
 * hierarchical Y-band layout. The numbering matches `NodeLevel`.
 */
export function nodeLevel(nodeType: NodeType): NodeLevel {
  switch (nodeType) {
    case 'namespace':       return 1
    case 'nexusEndpoint':   return 1.5
    case 'worker':
    case 'nexusService':    return 2
    case 'workflow':
    case 'nexusOperation':  return 3
    case 'activity':        return 4
  }
}
