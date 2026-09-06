// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

import type { DimensionMap } from './dimension'

export interface GraphNode {
  /**
   * Stable identity, owned by whoever produced the graph.
   *
   * **Opaque.** The engine compares ids and looks them up; it never parses one
   * or reads structure out of it. A host is free to make them hierarchical, or
   * not — the two behave identically here, and that is the property worth
   * keeping: the moment anything splits an id on a separator, the id's format
   * becomes part of this model's contract.
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
  /** Containment parent, when this node has one. */
  parentId?: string
  /** True when no parent in the hierarchy (uninstantiated definition). */
  orphan: boolean

  /**
   * Stable identifier shared across every copy of the same underlying
   * definition. One definition instantiated in three places produces three
   * nodes with three distinct `id`s but a single `definitionKey`. Used to look
   * up sister copies for the duplicate-highlight interaction, and as the
   * grouping key for `Graph.duplicateGroups`.
   *
   * Like `id`, opaque: the host decides how to derive it.
   */
  definitionKey: string

  /**
   * Template holes of a parameterized family of nodes, in first-appearance
   * order (e.g. `fabric-shard-{org}` → `['org']`). The producer collapses the
   * family to one representative node; this drives the cardinality badge.
   * Display-only metadata, never identity. Absent/`[]` means a static node
   * (renders unchanged).
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
