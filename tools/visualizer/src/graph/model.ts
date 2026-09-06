// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

import type { DimensionMap } from './dimension'

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
  /**
   * Where this node sits on every axis the taxonomy declares.
   *
   * This replaces the single type string a node used to carry. Features elect
   * one axis each and read it from here; nothing composes across axes.
   */
  dimensions: DimensionMap
  name: string
  /**
   * Metadata the host owns and the library does not interpret.
   *
   * Deliberately opaque: it is per-domain display detail — the things a tooltip
   * shows — and the moment the library reads a key out of it by name, that key
   * is part of the library's vocabulary again.
   */
  payload?: Readonly<Record<string, unknown>>
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

  /**
   * Template holes of a parameterized `namespace`/`nexusEndpoint` family,
   * in first-appearance order (e.g. `fabric-shard-{org}` → `['org']`).
   * The parser collapses the family to one representative node; this drives
   * the cardinality badge. Display-only metadata — like `worker/namespace/queue`,
   * never identity. Absent/`[]` means a static node (renders unchanged).
   */
  templateParams?: string[]
}

/**
 * Read one string out of a node's host-owned payload.
 *
 * The library offers the accessor, never the key: a caller that knows the key
 * is by definition domain-aware, and this keeps that knowledge at the call site
 * instead of smuggling it into the model. Returns undefined for a missing key
 * or a non-string value rather than coercing, so a payload shape change surfaces
 * as an absent field instead of "[object Object]" in a tooltip.
 */
export function payloadString(
  node: Pick<GraphNode, 'payload'>,
  key: string,
): string | undefined {
  const value = node.payload?.[key]
  return typeof value === 'string' ? value : undefined
}

export type EdgeType = 'containment' | 'dependency'

export interface GraphEdge {
  id: string
  edgeType: EdgeType
  sourceId: string
  targetId: string
  // Endpoint metadata for dependency edges that originate from a nexus call.
  // The operation and service identities are encoded in the target node, but
  // the endpoint is per-call-site (the same operation can be reached via two
  // endpoints in different namespaces) so it stays on the edge.
  nexusEndpoint?: string
  // The parser's dispatch kind, carried only where it disambiguates two edge
  // types that share the same endpoint node types. `workflowCall` and
  // `signalSend` are both workflow → workflow; nothing but the kind separates
  // a binding call from a fire-and-forget send, so `edgeTypeFor` reads this.
  dispatchKind?: 'signalSend'
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
