// useVisibleGraph — derives the visible subgraph from the live simulation.
//
// Filters the sim's nodes by the type/file filter, graduates edges across hidden
// types (containment walks up to the nearest visible ancestor; dependency edges
// project/splice and dedupe), and computes per-node summaries + downstream-depth
// scores. Recomputes only on filter or sim-rebuild changes (keyed on simVersion,
// the explicit data link to useSimulation), never per frame.

import React from 'react'
import type { Simulation, SimNode } from '../../graph/simulation'
import type { GraphEdge } from '../../graph/model'
import { definitionFor } from '../../graph/node-types'
import { nodeTypeToDefType } from './nodeDefType'

export interface VisibleGraph {
  visibleNodes: SimNode[]
  visibleEdges: GraphEdge[]
  visibleIds: Set<string>
  nodeSummaries: Map<string, string>
  downstreamScores: Map<string, number>
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
  sim: { edges: { edgeType: string; sourceId: string; targetId: string }[] },
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
): string[] {
  if (visible) return [nodeId]
  const node = getNode(nodeId)
  if (node?.nodeType === 'nexusOperation') {
    const out: string[] = []
    for (const e of sim.edges) {
      if (e.edgeType !== 'dependency') continue
      const adjId = side === 'tgt'
        ? (e.sourceId === nodeId ? e.targetId : null)  // outgoing — operation is source
        : (e.targetId === nodeId ? e.sourceId : null)  // incoming — operation is target
      if (!adjId) continue
      for (const r of resolveDepEndpoint(adjId, visibleIds.has(adjId), side, sim, visibleIds, getNode)) {
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
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[],
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
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[],
  nodeMap: Map<string, SimNode>,
): string {
  const { summaryKind } = definitionFor(node.nodeType)

  if (summaryKind === 'containerCount') {
    let workers = 0, endpoints = 0
    for (const e of visibleEdges) {
      if (e.edgeType !== 'containment' || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      if (child.nodeType === 'worker') workers++
      else if (child.nodeType === 'nexusEndpoint') endpoints++
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
      if (child.nodeType === 'workflow') wf++
      else if (child.nodeType === 'activity') act++
      else if (child.nodeType === 'nexusService') nxs++
      else if (child.nodeType === 'nexusOperation') ops++
    }
    if (node.nodeType === 'nexusService') {
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

const EMPTY: VisibleGraph = {
  visibleNodes: [],
  visibleEdges: [],
  visibleIds: new Set<string>(),
  nodeSummaries: new Map<string, string>(),
  downstreamScores: new Map<string, number>(),
}

export function useVisibleGraph(
  simRef: React.MutableRefObject<Simulation | null>,
  simVersion: number,
  visibleTypes: Set<string>,
  selectedFiles: Set<string>,
): VisibleGraph {
  return React.useMemo<VisibleGraph>(() => {
    const sim = simRef.current
    if (!sim) return EMPTY

    const hasFileFilter = selectedFiles.size > 0
    const ids = new Set<string>()
    const vNodes: SimNode[] = []

    for (const node of sim.nodes) {
      if (!visibleTypes.has(nodeTypeToDefType(node.nodeType))) continue
      if (hasFileFilter && node.sourceFile && !selectedFiles.has(node.sourceFile)) continue
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
            const ancestorNode = getNode(ancestor)
            graduatedEdges.push({
              ...edge,
              targetId: ancestor,
              targetNodeType: ancestorNode?.nodeType ?? edge.targetNodeType,
              id: `grad:${edge.id}`,
            })
          }
        }
      } else {
        const resolvedSources = resolveDepEndpoint(edge.sourceId, srcVisible, 'src', sim, ids, getNode)
        const resolvedTargets = resolveDepEndpoint(edge.targetId, tgtVisible, 'tgt', sim, ids, getNode)
        for (const rs of resolvedSources) {
          for (const rt of resolvedTargets) {
            if (rs === rt) continue
            const key = `${rs}→${rt}`
            const existing = depEdgeKeys.get(key)
            if (existing && existing.nexusEndpoint && !edge.nexusEndpoint) continue
            const srcNode = getNode(rs)
            const tgtNode = getNode(rt)
            depEdgeKeys.set(key, {
              ...edge,
              sourceId: rs,
              targetId: rt,
              sourceNodeType: srcNode?.nodeType ?? edge.sourceNodeType,
              targetNodeType: tgtNode?.nodeType ?? edge.targetNodeType,
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
      const s = computeGraphNodeSummary(node, vEdges, vNodeMap)
      if (s) nodeSummaries.set(node.id, s)
    }

    const downstreamScores = computeDownstreamScores(vNodes, vEdges)

    return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids, nodeSummaries, downstreamScores }
    // simVersion is the data link to useSimulation — it bumps on (re)creation so
    // this memo recomputes when the sim instance changes.
  }, [visibleTypes, selectedFiles, simVersion]) // eslint-disable-line react-hooks/exhaustive-deps
}
