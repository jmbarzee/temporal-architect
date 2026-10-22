// computeVisibleGraph — the pure derivation behind useVisibleGraph.
//
// Filters the graph's nodes by the type/file filter, graduates edges across
// hidden types (containment walks up to the nearest visible ancestor; dependency
// edges project/splice and dedupe), and computes per-node summaries +
// downstream-depth scores.
//
// Lifted out of the hook so it is callable without React: the golden harness
// snapshots it directly, and the taxonomy arrives as a parameter, so both the
// visibility predicate and the summary dispatch resolve through the container.
//
// Nothing here names a value: the hidden-node policy is the taxonomy's
// (`whenHidden`, D59), the summaries read its abbreviations (D58), and the
// precedence between graduated edges that land on one pair reads only
// whether an edge carries metadata (D60).

import { computeDownstreamReach } from '../../graph/scalar'
import { isContainment } from '../../graph/model'
import type { SimNode } from '../../graph/simulation'
import type { GraphEdge, ReadableGraph } from '../../graph/model'
import type { Ontology } from '../../graph/ontology'
import type { PhysicsSubject } from '../../graph/forces'
import type { FilterState } from '../../filter/types'
import { passesSelection } from '../../filter/types'

export interface VisibleGraph {
  visibleNodes: SimNode[]
  visibleEdges: GraphEdge[]
  visibleIds: Set<string>
  nodeSummaries: Map<string, string>
  downstreamScores: Map<string, number>
}

/**
 * The read-only slice of a Simulation this derivation needs. A `Simulation`
 * satisfies it structurally, so callers pass one directly.
 */
export interface VisibleGraphSource extends ReadableGraph {
  nodes: SimNode[]
  edges: GraphEdge[]
  getNode: (id: string) => SimNode | undefined
}

export const EMPTY_VISIBLE_GRAPH: VisibleGraph = {
  visibleNodes: [],
  visibleEdges: [],
  visibleIds: new Set<string>(),
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
// declared policy is `splice` (D59, B16) follows the hidden node's own
// dependency edges through to the far side instead, so caller → hidden →
// callee draws as caller → callee. A hidden node is passed through at most
// once per resolution (`visited`): hidden spliced nodes may call each other,
// and a cycle among them used to recurse without end (REVIEW_7 C3).
function resolveDepEndpoint(
  nodeId: string,
  visible: boolean,
  side: 'src' | 'tgt',
  sim: { edges: GraphEdge[] },
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
  ontology: Ontology,
  visited: Set<string> = new Set(),
): string[] {
  if (visible) return [nodeId]
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  const node = getNode(nodeId)
  if (node && ontology.resolveNodeStyle(node).whenHidden === 'splice') {
    const out: string[] = []
    for (const e of sim.edges) {
      if (isContainment(e)) continue
      const adjId = side === 'tgt'
        ? (e.sourceId === nodeId ? e.targetId : null)  // outgoing — the hidden node is the source
        : (e.targetId === nodeId ? e.sourceId : null)  // incoming — the hidden node is the target
      if (!adjId) continue
      for (const r of resolveDepEndpoint(adjId, visibleIds.has(adjId), side, sim, visibleIds, getNode, ontology, visited)) {
        out.push(r)
      }
    }
    if (out.length > 0) return out
  }
  const ancestor = findNearestVisibleAncestor(nodeId, visibleIds, getNode)
  return ancestor ? [ancestor] : []
}

/** Whether an edge carries any host metadata — what a graduated edge keeps of the hop it passed through. */
const carriesMetadata = (e: GraphEdge): boolean => e.payload !== undefined && Object.keys(e.payload).length > 0

// Glanceable per-node summary string, dispatched on the taxonomy's summaryKind.
function computeGraphNodeSummary(
  node: SimNode,
  visibleEdges: GraphEdge[],
  nodeMap: Map<string, SimNode>,
  ontology: Ontology,
): string {
  const { summaryKind } = ontology.resolveNodeStyle(node)

  if (summaryKind === 'none') return ''

  if (summaryKind === 'children') {
    // The contained children, counted per style value in the taxonomy's own
    // order and named by its abbreviation — nothing here knows a value (R16).
    const counts = new Map<string, number>()
    for (const e of visibleEdges) {
      if (!isContainment(e) || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      const value = ontology.valueFor(child)
      if (value === undefined) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return ontology.nodeTypeKeys
      .filter(k => counts.has(k))
      .map(k => `${counts.get(k)} ${ontology.abbreviationFor(k)}`)
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



/** `passesSelection` for a graph node, projected through the taxonomy. */
export function passesFilter(
  node: PhysicsSubject,
  filter: FilterState,
  ontology: Ontology,
): boolean {
  return passesSelection(filter, ontology.filterDimensions, dim => ontology.valueOn(node, dim))
}

export function computeVisibleGraph(
  sim: VisibleGraphSource,
  filter: FilterState,
  ontology: Ontology,
): VisibleGraph {
  const ids = new Set<string>()
  const vNodes: SimNode[] = []

  for (const node of sim.nodes) {
    if (passesFilter(node, filter, ontology)) {
      ids.add(node.id)
      vNodes.push(node)
    }
  }

  // Graduate edges across hidden types.
  const getNode = (id: string) => sim.getNode(id)
  const graduatedEdges: GraphEdge[] = []
  const depEdgeKeys = new Map<string, GraphEdge>()

  for (const edge of sim.edges) {
    const srcVisible = ids.has(edge.sourceId)
    const tgtVisible = ids.has(edge.targetId)

    if (isContainment(edge)) {
      if (!srcVisible) continue  // hidden child — drop
      if (tgtVisible) {
        graduatedEdges.push(edge)
      } else {
        const ancestor = findNearestVisibleAncestor(edge.targetId, ids, getNode)
        if (ancestor) {
          graduatedEdges.push({
            ...edge,
            targetId: ancestor,
            id: `grad:${edge.id}`,
          })
        }
      }
    } else {
      const sources = resolveDepEndpoint(edge.sourceId, srcVisible, 'src', sim, ids, getNode, ontology)
      const targets = resolveDepEndpoint(edge.targetId, tgtVisible, 'tgt', sim, ids, getNode, ontology)
      for (const rs of sources) {
        for (const rt of targets) {
          if (rs === rt) continue
          const key = `${rs}→${rt}`
          // Two graduated edges on one pair: the one carrying metadata keeps
          // precedence over one carrying none (it still says what the hidden
          // hop was); otherwise the later one replaces the earlier (D60).
          const existing = depEdgeKeys.get(key)
          if (existing && carriesMetadata(existing) && !carriesMetadata(edge)) continue
          depEdgeKeys.set(key, {
            ...edge,
            sourceId: rs,
            targetId: rt,
            id: `grad:${key}`,
          })
        }
      }
    }
  }

  const vEdges = [...graduatedEdges, ...depEdgeKeys.values()]

  const vNodeMap = new Map<string, SimNode>()
  for (const n of vNodes) vNodeMap.set(n.id, n)
  const nodeSummaries = new Map<string, string>()
  for (const node of vNodes) {
    const s = computeGraphNodeSummary(node, vEdges, vNodeMap, ontology)
    if (s) nodeSummaries.set(node.id, s)
  }

  // Reach over the VISIBLE subgraph, for topological gravity; the same scalar
  // over the whole graph is a layout axis (graph/scalar.ts).
  const downstreamScores = computeDownstreamReach({ nodes: vNodes, edges: vEdges, getNode: id => vNodeMap.get(id) })

  return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids, nodeSummaries, downstreamScores }
}
