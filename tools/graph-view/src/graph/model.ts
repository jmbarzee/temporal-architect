// Graph data model for the force-directed graph view.

import type { AxisValues, Relation } from './axis'

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
  dimensions: AxisValues
  name: string
  /**
   * Metadata the host owns and the library does not interpret.
   *
   * Deliberately opaque: it is per-domain display detail — the things a tooltip
   * shows — and the moment the library reads a key out of it by name, that key
   * is part of the library's vocabulary again.
   */
  payload?: Readonly<Record<string, unknown>>
  /**
   * The container this node sits in, when it has one. One string: containment
   * is a tree, and an entity that sits in two containers is modelled as two
   * nodes sharing a `copyKey`. The view derives the containment edge from
   * this node to its container (`withContainmentEdges`) when the host does
   * not list one, so a host writes the fact once; a host may still list
   * containment edges of its own, between any two nodes.
   */
  parentId?: string
  /**
   * A mark the host puts on a node that is set apart: a dashed ring drawn
   * around it. What "set apart" means is the host's — say, a node that
   * has no container. Absent, no ring.
   */
  ring?: 'dashed'

  /**
   * The key every copy of one underlying entity shares. One entity placed in
   * three containers produces three nodes with three `id`s and one `copyKey`;
   * the view draws the copies with a halo, lights them together, and counts
   * them in the hover box ("copy 2 of 3"). Absent, the node is its own key.
   * Like `id`, opaque: the host decides how to derive it.
   */
  copyKey?: string

  /**
   * Short texts drawn as chips above the node, as given — a cardinality, a
   * tag, a count. Display only, never identity. Absent or empty, no chips.
   */
  badges?: readonly string[]
}

/** The key a node's copies share: its `copyKey`, or its own id. */
export const copyKeyOf = (node: Pick<GraphNode, 'id' | 'copyKey'>): string => node.copyKey ?? node.id

/**
 * Every node id by the key it shares with its copies, over a whole graph —
 * the index the view and a host's group overlay read. Derived here from the
 * nodes, once per graph, rather than supplied beside them.
 */
export function copyGroups(graph: Pick<Graph, 'nodes'>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const node of graph.nodes.values()) {
    const key = copyKeyOf(node)
    const group = out.get(key)
    if (group) group.add(node.id)
    else out.set(key, new Set([node.id]))
  }
  return out
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

/** Read one number out of a node's host-owned payload; undefined for a missing key or a non-number, never a coercion. */
export function payloadNumber(
  node: { payload?: Readonly<Record<string, unknown>> },
  key: string,
): number | undefined {
  const value = node.payload?.[key]
  return typeof value === 'number' ? value : undefined
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  /**
   * What the edge means to the engine: a `containment` edge runs from a node
   * to its container and is drawn dashed and undirected; a `dependency` edge
   * is directed, walked by the highlight and re-pointed when an end is
   * hidden. Absent, `dependency`. The containment edge from a node to its
   * `parentId` is derived; a host may list containment edges of its own,
   * which are drawn and sprung but never walked as the parent.
   */
  relation?: Relation
  /** Where this edge sits on the host's own axes (a call kind, say). Absent, none. */
  dimensions?: AxisValues
  /**
   * Metadata the host owns and the library does not interpret — the same
   * contract as `GraphNode.payload`. Per-call-site detail that is not identity
   * and not an axis lives here.
   */
  payload?: Readonly<Record<string, unknown>>
}

/** The edge's relation: as declared, or `dependency`. A misspelt relation is `validateGraph`'s to name. */
export function relationOf(edge: Pick<GraphEdge, 'relation'>): Relation {
  return edge.relation === 'containment' ? 'containment' : 'dependency'
}

/** Does this edge express containment (as opposed to a dependency)? */
export function isContainment(edge: Pick<GraphEdge, 'relation'>): boolean {
  return edge.relation === 'containment'
}

/**
 * The graph with a containment edge from every node to its `parentId`, for
 * each node whose host listed none: `in:<node id>`, from the child to its
 * container. A node whose parent is not in the graph gets none (validation
 * names that), and a host's own edge to the parent stands. The host's
 * objects are not mutated; a graph needing nothing is returned as is.
 */
export function withContainmentEdges(graph: Graph): Graph {
  const listed = new Set<string>()
  const ids = new Set<string>()
  for (const e of graph.edges) {
    ids.add(e.id)
    if (e.relation === 'containment' && e.targetId === graph.nodes.get(e.sourceId)?.parentId) listed.add(e.sourceId)
  }
  const added: GraphEdge[] = []
  for (const node of graph.nodes.values()) {
    if (node.parentId === undefined || !graph.nodes.has(node.parentId) || listed.has(node.id)) continue
    // `in:<node>`, or the first free numbered variant when a host edge took it.
    let id = `in:${node.id}`
    for (let n = 2; ids.has(id); n++) id = `in:${node.id}#${n}`
    ids.add(id)
    added.push({ id, sourceId: node.id, targetId: node.parentId, relation: 'containment' })
  }
  return added.length === 0 ? graph : { nodes: graph.nodes, edges: [...graph.edges, ...added] }
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

/** The host's graph: its nodes by id, and its edges. Read, never written, by the view. */
export interface Graph {
  nodes: ReadonlyMap<string, GraphNode>
  edges: readonly GraphEdge[]
}

/**
 * Whether two graphs have the same nodes under the same parents and the same
 * edges between the same ends — the shape a layout depends on. A new graph
 * object of the same shape is the sign of a host rebuilding what it could
 * have kept; the view says so once.
 */
export function graphShapeEquals(a: Graph, b: Graph): boolean {
  if (a === b) return true
  if (a.nodes.size !== b.nodes.size || a.edges.length !== b.edges.length) return false
  for (const [id, node] of a.nodes) {
    const other = b.nodes.get(id)
    if (!other || other.parentId !== node.parentId) return false
  }
  for (let i = 0; i < a.edges.length; i++) {
    const x = a.edges[i], y = b.edges[i]
    if (x.id !== y.id || x.sourceId !== y.sourceId || x.targetId !== y.targetId) return false
  }
  return true
}
