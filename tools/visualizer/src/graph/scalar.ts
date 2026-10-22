// Computed scalars — a layout axis backed by a number per node rather than a
// bucket per value (R8, R9). A scalar reads node metadata and the graph's
// structure, nothing else, and answers in [0, 1]; the axis maps that interval
// onto a world span. Three are built in and read only structure; a host may
// declare more through its ontology, with access to its own payload.

import type { ReadableGraph } from './model'
import { isContainment } from './model'

export interface ScalarAxis {
  /** Stable id — the tuning names the scalar by it. */
  readonly id: string
  readonly label: string
  readonly tooltip: string
  /**
   * One value per node in [0, 1]. A node absent from the map has no value on
   * this axis and rests at the axis's centre — the same answer as a node in no
   * bucket on a mapped axis.
   */
  compute(graph: ReadableGraph): Map<string, number>
}

/**
 * Downstream reach: how many dependency levels deep a node's subtree runs,
 * propagated up the containment hierarchy (one rank per tier, so a container
 * strictly out-ranks everything it hosts), normalized by the top container.
 * Leaves score 0. Topological gravity reads this over the visible subgraph;
 * as an axis it is read over the whole graph.
 */
export function computeDownstreamReach(graph: ReadableGraph): Map<string, number> {
  const nodes = graph.nodes
  const adj = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (isContainment(e)) continue
    const list = adj.get(e.sourceId)
    if (list) list.push(e.targetId)
    else adj.set(e.sourceId, [e.targetId])
  }

  const depths = new Map<string, number>()
  let maxDepth = 0
  for (const node of nodes) {
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
  // tier so a container *strictly* out-ranks everything it hosts. Early-out
  // when an ancestor is already ranked higher (a deeper branch already
  // propagated past it, so its own ancestors are too).
  const byId = new Map(nodes.map(n => [n.id, n]))
  const effective = new Map<string, number>()
  for (const node of nodes) effective.set(node.id, depths.get(node.id) ?? 0)
  for (const node of nodes) {
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

/** Dependency edges in and out, as a fraction of the busiest node's. */
export function computeDegree(graph: ReadableGraph): Map<string, number> {
  const count = new Map<string, number>()
  for (const n of graph.nodes) count.set(n.id, 0)
  for (const e of graph.edges) {
    if (isContainment(e)) continue
    count.set(e.sourceId, (count.get(e.sourceId) ?? 0) + 1)
    count.set(e.targetId, (count.get(e.targetId) ?? 0) + 1)
  }
  let max = 0
  for (const v of count.values()) if (v > max) max = v
  const scores = new Map<string, number>()
  if (max === 0) return scores
  for (const [id, v] of count) scores.set(id, v / max)
  return scores
}

/** Containment depth: 0 at the top of the hierarchy, 1 at the deepest node. */
export function computeContainmentDepth(graph: ReadableGraph): Map<string, number> {
  const depth = new Map<string, number>()
  let max = 0
  for (const n of graph.nodes) {
    let d = 0
    let pid = n.parentId
    const guard = new Set<string>()
    while (pid && !guard.has(pid)) {
      guard.add(pid)
      d++
      pid = graph.getNode(pid)?.parentId
    }
    depth.set(n.id, d)
    if (d > max) max = d
  }
  const scores = new Map<string, number>()
  if (max === 0) return scores
  for (const [id, d] of depth) scores.set(id, d / max)
  return scores
}

export const downstreamReach: ScalarAxis = {
  id: 'reach',
  label: 'Reach',
  tooltip: 'Downstream reach: how many dependency levels deep a node’s subtree runs, propagated up containment; leaves at 0',
  compute: computeDownstreamReach,
}

export const degree: ScalarAxis = {
  id: 'degree',
  label: 'Degree',
  tooltip: 'Dependency edges in and out, as a fraction of the busiest node’s',
  compute: computeDegree,
}

export const containmentDepth: ScalarAxis = {
  id: 'depth',
  label: 'Depth',
  tooltip: 'Containment depth: 0 at the top of the hierarchy, 1 at the deepest node',
  compute: computeContainmentDepth,
}

/** The scalars every host gets: structural, so they need no domain knowledge. */
export const BUILT_IN_SCALARS: readonly ScalarAxis[] = [downstreamReach, degree, containmentDepth]
