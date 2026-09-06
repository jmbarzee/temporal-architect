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
// What is NOT yet injected, so nobody reads more into this than it says: the
// operation-splice branch in `resolveDepEndpoint` and the per-child counting
// inside the summary strategies still test hardcoded node-type values. Those are
// separate blast-radius rows owned by later units.

import type { SimNode } from '../../graph/simulation'
import type { GraphEdge } from '../../graph/model'
import { SOURCE_FILE_DIMENSION } from '../../graph/build'
import type { Ontology } from '../../graph/ontology'

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
export interface VisibleGraphSource {
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
// "if visible keep, else walk to nearest visible ancestor". Exception: hidden
// nexus operations splice *through* (following the call relationship) instead of
// ascending, so caller → operation → backing becomes caller → backing.
function resolveDepEndpoint(
  nodeId: string,
  visible: boolean,
  side: 'src' | 'tgt',
  sim: { edges: GraphEdge[] },
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
  ontology: Ontology,
): string[] {
  if (visible) return [nodeId]
  const node = getNode(nodeId)
  // Still a domain literal: WHICH value splices is a host policy, and injecting
  // it is a later unit's job (B16). What changed is where the value comes from.
  if (node && ontology.valueFor(node) === 'nexusOperation') {
    const out: string[] = []
    for (const e of sim.edges) {
      if (e.edgeType !== 'dependency') continue
      const adjId = side === 'tgt'
        ? (e.sourceId === nodeId ? e.targetId : null)  // outgoing — operation is source
        : (e.targetId === nodeId ? e.sourceId : null)  // incoming — operation is target
      if (!adjId) continue
      for (const r of resolveDepEndpoint(adjId, visibleIds.has(adjId), side, sim, visibleIds, getNode, ontology)) {
        out.push(r)
      }
    }
    if (out.length > 0) return out
  }
  const ancestor = findNearestVisibleAncestor(nodeId, visibleIds, getNode)
  return ancestor ? [ancestor] : []
}

// Per-node downstream-depth scores over the visible dependency subgraph,
// propagated up the containment hierarchy (one rank per tier) so a container is
// scored strictly higher than anything it hosts, then linearly normalized to
// [0,1] by the top container. Keeps tiers ordered under topological gravity.
function computeDownstreamScores(
  visibleNodes: SimNode[],
  visibleEdges: GraphEdge[],
): Map<string, number> {
  const adj = new Map<string, string[]>()
  for (const e of visibleEdges) {
    if (e.edgeType !== 'dependency') continue
    const list = adj.get(e.sourceId)
    if (list) list.push(e.targetId)
    else adj.set(e.sourceId, [e.targetId])
  }

  const depths = new Map<string, number>()
  let maxDepth = 0
  for (const node of visibleNodes) {
    const seen = new Set<string>([node.id])
    let depth = 0
    let frontier: string[] = [node.id]
    while (frontier.length > 0) {
      const next: string[] = []
      for (const cur of frontier) {
        const out = adj.get(cur)
        if (!out) continue
        for (const t of out) {
          if (seen.has(t)) continue
          seen.add(t)
          next.push(t)
        }
      }
      if (next.length > 0) depth++
      frontier = next
    }
    depths.set(node.id, depth)
    if (depth > maxDepth) maxDepth = depth
  }

  const scores = new Map<string, number>()
  if (maxDepth === 0) return scores

  // Propagate each node's depth up its containment chain, adding one rank per
  // tier so a container *strictly* out-ranks everything it hosts (a namespace
  // pulls harder than its deepest workflow, not merely equal). This keeps the
  // tier order under topological gravity without leaning on band gravity to
  // break ties. Early-out when an ancestor is already ranked higher (a deeper
  // branch already propagated past it, so its own ancestors are too).
  const byId = new Map(visibleNodes.map(n => [n.id, n]))
  const effective = new Map<string, number>()
  for (const node of visibleNodes) effective.set(node.id, depths.get(node.id) ?? 0)
  for (const node of visibleNodes) {
    const d = depths.get(node.id) ?? 0
    if (d <= 0) continue
    let pid = node.parentId
    let bump = d
    const guard = new Set<string>()
    while (pid && !guard.has(pid)) {
      guard.add(pid)
      bump += 1
      if ((effective.get(pid) ?? 0) >= bump) break
      effective.set(pid, bump)
      pid = byId.get(pid)?.parentId
    }
  }

  // Normalize by the post-propagation max (the top container) so scores ∈ [0,1].
  let maxEff = 0
  for (const v of effective.values()) if (v > maxEff) maxEff = v
  if (maxEff === 0) return scores
  for (const [id, d] of effective) {
    scores.set(id, d / maxEff)
  }
  return scores
}

// Glanceable per-node summary string, dispatched on the registry's summaryKind.
function computeGraphNodeSummary(
  node: SimNode,
  visibleEdges: GraphEdge[],
  nodeMap: Map<string, SimNode>,
  ontology: Ontology,
): string {
  const { summaryKind } = ontology.resolveNodeStyle(node)

  if (summaryKind === 'containerCount') {
    let workers = 0, endpoints = 0
    for (const e of visibleEdges) {
      if (e.edgeType !== 'containment' || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      if (ontology.valueFor(child) === 'worker') workers++
      else if (ontology.valueFor(child) === 'nexusEndpoint') endpoints++
    }
    const parts: string[] = []
    if (workers > 0) parts.push(`${workers} worker${workers !== 1 ? 's' : ''}`)
    if (endpoints > 0) parts.push(`${endpoints} endpoint${endpoints !== 1 ? 's' : ''}`)
    return parts.join(' · ')
  }

  if (summaryKind === 'none') return ''

  if (summaryKind === 'hostRegistrations') {
    let wf = 0, act = 0, nxs = 0, ops = 0
    for (const e of visibleEdges) {
      if (e.edgeType !== 'containment' || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      if (ontology.valueFor(child) === 'workflow') wf++
      else if (ontology.valueFor(child) === 'activity') act++
      else if (ontology.valueFor(child) === 'nexusService') nxs++
      else if (ontology.valueFor(child) === 'nexusOperation') ops++
    }
    if (ontology.valueFor(node) === 'nexusService') {
      return ops > 0 ? `${ops} op${ops !== 1 ? 's' : ''}` : ''
    }
    const parts: string[] = []
    if (wf > 0) parts.push(`${wf}wf`)
    if (act > 0) parts.push(`${act}act`)
    if (nxs > 0) parts.push(`${nxs}nxs`)
    return parts.join(' · ')
  }

  // summaryKind === 'degree'
  let out = 0, inc = 0
  for (const e of visibleEdges) {
    if (e.edgeType === 'containment') continue
    if (e.sourceId === node.id) out++
    if (e.targetId === node.id) inc++
  }
  const parts: string[] = []
  if (out > 0) parts.push(`→${out}`)
  if (inc > 0) parts.push(`←${inc}`)
  return parts.join(' ')
}

export function computeVisibleGraph(
  sim: VisibleGraphSource,
  visibleTypes: Set<string>,
  selectedFiles: Set<string>,
  ontology: Ontology,
): VisibleGraph {
  const hasFileFilter = selectedFiles.size > 0
  const ids = new Set<string>()
  const vNodes: SimNode[] = []

  for (const node of sim.nodes) {
    if (!visibleTypes.has(ontology.resolveNodeStyle(node).defType)) continue
    const file = node.dimensions[SOURCE_FILE_DIMENSION]
    if (hasFileFilter && file && !selectedFiles.has(file)) continue
    ids.add(node.id)
    vNodes.push(node)
  }

  // Graduate edges across hidden types.
  const getNode = (id: string) => sim.getNode(id)
  const graduatedEdges: GraphEdge[] = []
  const depEdgeKeys = new Map<string, GraphEdge>()

  for (const edge of sim.edges) {
    const srcVisible = ids.has(edge.sourceId)
    const tgtVisible = ids.has(edge.targetId)

    if (edge.edgeType === 'containment') {
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
      const resolvedSources = resolveDepEndpoint(edge.sourceId, srcVisible, 'src', sim, ids, getNode, ontology)
      const resolvedTargets = resolveDepEndpoint(edge.targetId, tgtVisible, 'tgt', sim, ids, getNode, ontology)
      for (const rs of resolvedSources) {
        for (const rt of resolvedTargets) {
          if (rs === rt) continue
          const key = `${rs}→${rt}`
          const existing = depEdgeKeys.get(key)
          if (existing && existing.nexusEndpoint && !edge.nexusEndpoint) continue
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

  const downstreamScores = computeDownstreamScores(vNodes, vEdges)

  return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids, nodeSummaries, downstreamScores }
}
