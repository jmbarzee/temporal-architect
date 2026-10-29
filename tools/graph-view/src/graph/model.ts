// Graph data model for the force-directed graph view.

import type { DimensionMap } from './dimension'
import { RELATION_DIMENSION } from './dimension'
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
  /**
   * The container this node sits in, when it has one. The same fact as the
   * containment edge from this node to its container — the host writes both
   * from one lookup, and the view reads this one where it needs a parent at
   * O(1) (the ancestor walk, reach, seeding) and the edges where it needs the
   * children (summaries, graduation, drawing). Two readings of one fact, kept
   * in step by the host that writes them.
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

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  /**
   * Where this edge sits on every axis it has a value for. The library declares
   * one, `RELATION_DIMENSION`, whose value must be `containment` or `dependency`
   * (`relationOf` throws on anything else, at the first read); a host adds its
   * own (a call kind, say). A containment edge runs
   * from the child (`sourceId`) to its container (`targetId`), and the child's
   * `parentId` names that container.
   */
  dimensions: DimensionMap
  /**
   * Metadata the host owns and the library does not interpret — the same
   * contract as `GraphNode.payload`. Per-call-site detail that is not identity
   * and not an axis lives here.
   */
  payload?: Readonly<Record<string, unknown>>
}

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

/** Does this edge express containment (as opposed to a dependency)? */
export function isContainment(edge: Pick<GraphEdge, 'dimensions'>): boolean {
  return relationOf(edge) === 'containment'
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
}
