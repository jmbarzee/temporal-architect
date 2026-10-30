// computeVisibleGraph — the pure derivation behind useVisibleGraph.
//
// Filters the graph's nodes on the axes the view shows, graduates edges across
// hidden nodes (containment walks up to the nearest visible ancestor;
// dependency edges project or splice, and the graduated ones collapse per
// pair), classifies every edge once on its original endpoints, and computes
// per-node summaries and downstream-reach scores.
//
// Lifted out of the hook so it is callable without React: the golden harness
// snapshots it directly, and the taxonomy arrives as a parameter, so both the
// visibility predicate and the summary dispatch resolve through the container.
//
// Nothing here names a value: the hidden-node policy is the taxonomy's
// (`whenHidden`), the summaries read its abbreviations, and which
// of two graduated edges on one pair survives is the taxonomy's `collapse`.
// An edge with both ends visible is never collapsed and keeps its id:
// two edges between the same two visible nodes are two facts, and the
// payload is not read here or anywhere else in the library.

import { computeDownstreamReach } from '../../graph/scalar'
import { isContainment } from '../../graph/model'
import type { SimNode } from '../../graph/simulation'
import type { GraphEdge, ReadableGraph } from '../../graph/model'
import type { Taxonomy } from '../../graph/taxonomy'
import type { ResolvedAxisDescriptor } from '../../graph/axis'
import type { EdgeTypeId } from '../../graph/shapes'
import type { PhysicsSubject } from '../../graph/forces'
import type { FilterState } from '../../filter/types'
import { passesDescriptors } from '../../filter/types'

export interface VisibleGraph {
  visibleNodes: SimNode[]
  visibleEdges: GraphEdge[]
  visibleIds: Set<string>
  /**
   * Each visible edge's type, by its id, resolved once from the ORIGINAL
   * edge's endpoints: a graduated edge carries the type of the edge it stands
   * for, so the host's rule never meets an endpoint pair its model does not
   * produce. Undefined for an edge whose type the taxonomy does not
   * declare — `validateGraph` names those; here they draw neutral.
   */
  edgeTypes: Map<string, EdgeTypeId | undefined>
  nodeSummaries: Map<string, string>
  downstreamScores: Map<string, number>
}

/**
 * The read-only slice of a Simulation this derivation needs. A `Simulation`
 * satisfies it structurally, so callers pass one directly.
 */
export interface VisibleGraphSource extends ReadableGraph {
  nodes: SimNode[]
  edges: readonly GraphEdge[]
  getNode: (id: string) => SimNode | undefined
}

export const EMPTY_VISIBLE_GRAPH: VisibleGraph = {
  visibleNodes: [],
  visibleEdges: [],
  visibleIds: new Set<string>(),
  edgeTypes: new Map<string, EdgeTypeId | undefined>(),
  nodeSummaries: new Map<string, string>(),
  downstreamScores: new Map<string, number>(),
}

// Walk parentId chain to find nearest ancestor that is in visibleIds.
function findNearestVisibleAncestor(
  nodeId: string,
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
): string | null {
  const node = getNode(nodeId)
  if (!node) return null
  let id: string | undefined = node.parentId
  while (id) {
    if (visibleIds.has(id)) return id
    const parent = getNode(id)
    id = parent?.parentId
  }
  return null
}

// Resolve a dependency-edge endpoint to one or more visible node ids. Default:
// "if visible keep, else walk to nearest visible ancestor". A value whose
// declared policy is `splice` follows the hidden node's own
// dependency edges through to the far side instead, so caller → hidden →
// callee draws as caller → callee. A hidden node is passed through at most
// once per resolution (`visited`): hidden spliced nodes may call each other,
// and a cycle among them used to recurse without end.
function resolveDepEndpoint(
  nodeId: string,
  visible: boolean,
  side: 'src' | 'tgt',
  sim: { edges: readonly GraphEdge[] },
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
  taxonomy: Taxonomy,
  visited: Set<string> = new Set(),
): string[] {
  if (visible) return [nodeId]
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  const node = getNode(nodeId)
  if (node && taxonomy.nodeStyleOf(node).whenHidden === 'splice') {
    const out: string[] = []
    for (const e of sim.edges) {
      if (isContainment(e)) continue
      const adjId = side === 'tgt'
        ? (e.sourceId === nodeId ? e.targetId : null)  // outgoing — the hidden node is the source
        : (e.targetId === nodeId ? e.sourceId : null)  // incoming — the hidden node is the target
      if (!adjId) continue
      for (const r of resolveDepEndpoint(adjId, visibleIds.has(adjId), side, sim, visibleIds, getNode, taxonomy, visited)) {
        out.push(r)
      }
    }
    if (out.length > 0) return out
  }
  const ancestor = findNearestVisibleAncestor(nodeId, visibleIds, getNode)
  return ancestor ? [ancestor] : []
}

// Glanceable per-node summary string, dispatched on the taxonomy's summaryKind.
function computeGraphNodeSummary(
  node: SimNode,
  visibleEdges: GraphEdge[],
  nodeMap: Map<string, SimNode>,
  taxonomy: Taxonomy,
): string {
  const { summaryKind } = taxonomy.nodeStyleOf(node)

  if (summaryKind === 'none') return ''

  if (summaryKind === 'children') {
    // The contained children, counted per style value in the taxonomy's own
    // order and named by its abbreviation — nothing here knows a value.
    const counts = new Map<string, number>()
    for (const e of visibleEdges) {
      if (!isContainment(e) || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      const value = taxonomy.styleValueOf(child)
      if (value === undefined) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return taxonomy.styleValues
      .filter(k => counts.has(k))
      .map(k => `${counts.get(k)} ${taxonomy.abbreviationFor(k)}`)
      .join(' · ')
  }

  // summaryKind === 'degree'
  let out = 0, inc = 0
  for (const e of visibleEdges) {
    if (isContainment(e)) continue
    if (e.sourceId === node.id) out++
    if (e.targetId === node.id) inc++
  }
  const parts: string[] = []
  if (out > 0) parts.push(`→${out}`)
  if (inc > 0) parts.push(`←${inc}`)
  return parts.join(' ')
}

/**
 * `passesDescriptors` for a graph node, projected through the taxonomy, on the
 * axes given — the view's chain. Every declared axis is the default for a
 * caller that shows them all.
 */
export function passesFilter(
  node: PhysicsSubject,
  filter: FilterState,
  taxonomy: Taxonomy,
  axes: readonly ResolvedAxisDescriptor[] = taxonomy.filterAxes,
): boolean {
  return passesDescriptors(filter, axes, dim => taxonomy.valueOn(node, dim))
}

/**
 * Every edge's type from its own endpoints, once. The host's rule may throw
 * or answer with an id the table does not declare; both are host bugs that
 * `validateGraph` reports, and this derivation stays total: such an edge has
 * no type here and draws neutral.
 */
function classifyEdges(sim: VisibleGraphSource, taxonomy: Taxonomy): Map<string, EdgeTypeId | undefined> {
  const declared = new Set(taxonomy.edgeTypes.map(e => e.id))
  const out = new Map<string, EdgeTypeId | undefined>()
  for (const edge of sim.edges) {
    const src = sim.getNode(edge.sourceId)
    const tgt = sim.getNode(edge.targetId)
    let id: EdgeTypeId | undefined
    try {
      id = taxonomy.classifyEdge(edge, src && taxonomy.styleValueOf(src), tgt && taxonomy.styleValueOf(tgt))
    } catch {
      id = undefined
    }
    out.set(edge.id, id !== undefined && declared.has(id) ? id : undefined)
  }
  return out
}

export function computeVisibleGraph(
  sim: VisibleGraphSource,
  filter: FilterState,
  taxonomy: Taxonomy,
  axes: readonly ResolvedAxisDescriptor[] = taxonomy.filterAxes,
): VisibleGraph {
  const ids = new Set<string>()
  const vNodes: SimNode[] = []

  for (const node of sim.nodes) {
    if (passesFilter(node, filter, taxonomy, axes)) {
      ids.add(node.id)
      vNodes.push(node)
    }
  }

  const originalTypes = classifyEdges(sim, taxonomy)
  const edgeTypes = new Map<string, EdgeTypeId | undefined>()

  // Graduate edges across hidden nodes. Two passes over the host's edges: the
  // ones drawn as given first, then the projections, because a projection
  // that lands on a pair an original edge already connects is dropped —
  // the original stands for that reach, whichever order the host listed them.
  const getNode = (id: string) => sim.getNode(id)
  const kept: GraphEdge[] = []
  const originalPairs = new Set<string>()
  const projected: GraphEdge[] = []

  for (const edge of sim.edges) {
    const srcVisible = ids.has(edge.sourceId)
    const tgtVisible = ids.has(edge.targetId)

    if (isContainment(edge)) {
      if (!srcVisible) continue  // hidden child — drop
      if (tgtVisible) {
        kept.push(edge)
        edgeTypes.set(edge.id, originalTypes.get(edge.id))
      } else {
        const ancestor = findNearestVisibleAncestor(edge.targetId, ids, getNode)
        if (ancestor) {
          const id = `grad:${edge.id}`
          kept.push({ ...edge, targetId: ancestor, id })
          edgeTypes.set(id, originalTypes.get(edge.id))
        }
      }
    } else if (srcVisible && tgtVisible) {
      // Both ends visible: the host's edge, as given. Never collapsed with a
      // parallel one — two edges between two visible nodes are two facts.
      kept.push(edge)
      edgeTypes.set(edge.id, originalTypes.get(edge.id))
      originalPairs.add(`${edge.sourceId}→${edge.targetId}`)
    } else {
      projected.push(edge)
    }
  }

  // Graduated dependency edges, one per visible pair: the original each stands
  // for, and the edge as drawn.
  const graduated = new Map<string, { origin: GraphEdge; edge: GraphEdge }>()
  for (const edge of projected) {
    const sources = resolveDepEndpoint(edge.sourceId, ids.has(edge.sourceId), 'src', sim, ids, getNode, taxonomy)
    const targets = resolveDepEndpoint(edge.targetId, ids.has(edge.targetId), 'tgt', sim, ids, getNode, taxonomy)
    for (const rs of sources) {
      for (const rt of targets) {
        if (rs === rt) continue
        const key = `${rs}→${rt}`
        if (originalPairs.has(key)) continue
        // Two graduated edges on one pair stand for two paths through hidden
        // nodes that now read as one reach; the taxonomy says which survives,
        // and the one met first does when it does not say.
        const existing = graduated.get(key)
        if (existing && taxonomy.collapse(existing.origin, edge) === existing.origin) continue
        graduated.set(key, { origin: edge, edge: { ...edge, sourceId: rs, targetId: rt, id: `grad:${key}` } })
      }
    }
  }

  const vEdges = [...kept]
  for (const { origin, edge } of graduated.values()) {
    vEdges.push(edge)
    edgeTypes.set(edge.id, originalTypes.get(origin.id))
  }

  const vNodeMap = new Map<string, SimNode>()
  for (const n of vNodes) vNodeMap.set(n.id, n)
  const nodeSummaries = new Map<string, string>()
  for (const node of vNodes) {
    const s = computeGraphNodeSummary(node, vEdges, vNodeMap, taxonomy)
    if (s) nodeSummaries.set(node.id, s)
  }

  // Reach over the VISIBLE subgraph, for topological gravity; the same scalar
  // over the whole graph is a layout axis (graph/scalar.ts).
  const downstreamScores = computeDownstreamReach({ nodes: vNodes, edges: vEdges, getNode: id => vNodeMap.get(id) })

  return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids, edgeTypes, nodeSummaries, downstreamScores }
}
