// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

import type { DimensionMap, DimensionValue } from './dimension'
import { DISPATCH_DIMENSION, RELATION_DIMENSION } from './dimension'
import type { EdgeCategoryKind } from './taxonomy'

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
  node: { payload?: Readonly<Record<string, unknown>> },
  key: string,
): string | undefined {
  const value = node.payload?.[key]
  return typeof value === 'string' ? value : undefined
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  /**
   * Where this edge sits on every axis it has a value for. The library declares
   * two (`RELATION_DIMENSION`, `DISPATCH_DIMENSION`); a host may add more.
   */
  dimensions: DimensionMap
  /**
   * Metadata the host owns and the library does not interpret — the same
   * contract as `GraphNode.payload`. Per-call-site detail that is not identity
   * and not an axis lives here.
   */
  payload?: Readonly<Record<string, unknown>>
}

/** Does this edge express containment (as opposed to a dependency)? */
/**
 * The edge's relation, as one of the two values the engine knows. Closed and
 * loud: an edge with no relation, or a misspelt one, is a host bug, and letting
 * it classify as a dependency would give it a real spring with no error.
 */
export function relationOf(edge: Pick<GraphEdge, 'dimensions'>): EdgeCategoryKind {
  const r = edge.dimensions[RELATION_DIMENSION]
  if (r === 'containment' || r === 'dependency') return r
  throw new Error(`edge relation ${JSON.stringify(r)} is not one the engine knows; expected "containment" or "dependency"`)
}

export function isContainment(edge: Pick<GraphEdge, 'dimensions'>): boolean {
  return relationOf(edge) === 'containment'
}

/** The producer's dispatch kind for a dependency edge, or undefined. */
export function dispatchOf(edge: Pick<GraphEdge, 'dimensions'>): DimensionValue | undefined {
  return edge.dimensions[DISPATCH_DIMENSION]
}

/**
 * A graph as a reader sees it — its nodes, its edges, and a lookup by id —
 * the shape a computed scalar, the layout frame and the view's visible-graph
 * derivation all read. Nodes are an array, never a one-shot iterator: a
 * reader walks them more than once. A `Simulation` satisfies it structurally.
 */
export interface ReadableGraph {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  getNode(id: string): GraphNode | undefined
}

export function readableGraph(graph: Graph): ReadableGraph {
  return { nodes: [...graph.nodes.values()], edges: graph.edges, getNode: id => graph.nodes.get(id) }
}

export interface Graph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  // Definition key → every node id that represents a copy of that
  // definition. Populated by `buildGraph` once all nodes exist. A singleton
  // (one registration, or an orphan definition) has one entry; a definition
  // registered on three hosts has three. Consumers read this to keep sister
  // copies undimmed during hover/select interactions in GraphView.
  duplicateGroups: Map<string, Set<string>>
}
