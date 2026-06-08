// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

// Node types in the graph.
//
//   namespace      — L1 container. Holds workers and nexus endpoints.
//   nexusEndpoint  — L1.5 top-level routing alias parented to a namespace.
//                    No outgoing edges; the nexus call's edge metadata names
//                    the endpoint that routed it.
//   worker         — L2 hosting tier. Runs workflows and activities.
//   nexusService   — L2 nexus hosting tier. Exposes a callable API surface.
//   workflow       — L3 orchestrator. Runs inside a worker.
//   nexusOperation — L3 nexus orchestrator. Callable unit of a service;
//                    sits on the call path between caller and backing workflow.
//   activity       — L4 leaf. Where work actually happens.
//
// Sizing, physics, and summary behaviour for each type live in the
// central NODE_TYPE_REGISTRY in graph/node-types.ts.
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
  //
  //     These fields are populated ONLY for nexus-tier nodes
  //     (nexusService, nexusOperation, nexusEndpoint) where the
  //     visualizer derives endpoint↔operation edges from them locally.
  //     Worker/activity/workflow nodes carry no Worker or Namespace
  //     here — use the parentId chain instead (normalized model).
  /** e.g. `worker:paymentWorker`. Nexus-tier nodes only. */
  worker?: string
  /** e.g. `namespace:ecommerce`. Nexus-tier nodes only. */
  namespace?: string
  /** Task queue name. Worker and nexus-tier nodes only. */
  queue?: string
}

export type EdgeType = 'containment' | 'dependency'

export interface GraphEdge {
  id: string
  edgeType: EdgeType
  sourceId: string
  targetId: string
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
