// Computed scalars — a layout axis backed by a number per node rather than a
// bucket per value. A scalar reads node metadata and the graph's
// structure, nothing else, and answers a number per node; the frame maps the
// answers onto [0, 1] as the scalar's `normalize` says, and the axis maps
// that interval onto a span. Three are built in and read only structure; a
// host may declare more through its taxonomy, with access to its own payload.

import type { ReadableGraph } from './model'
import { isContainment } from './model'

/** A computed scalar a layout axis may key on: a number per node, read off the graph and mapped onto [0, 1]. */
export interface ScalarAxis {
  /** Stable id — the tuning names the scalar by it. */
  readonly id: string
  /** The control's label. Default: the id. */
  readonly label?: string
  /** The control's hover text. Default: the label. */
  readonly tooltip?: string
  /**
   * One value per node — a finite number, which the frame maps onto [0, 1]
   * as `normalize` says: non-negative under `max`, any under `range`,
   * already in [0, 1] under `none`. A node absent from the map has no value
   * on this axis and rests at the axis's centre, the same answer as a node
   * in no bucket on a mapped axis. A true 0 is a value, and the built-ins
   * answer it as one.
   */
  compute(graph: ReadableGraph): Map<string, number>
  /**
   * How the frame maps the answers onto [0, 1]: `max` (the default) divides
   * by the largest, so 0 stays 0 and a negative answer is refused, loudly;
   * `range` puts the smallest at 0 and the largest at 1, whatever their
   * sign; `none` says the answers already lie in [0, 1], and the frame
   * refuses one outside it.
   */
  readonly normalize?: 'max' | 'range' | 'none'
}

/** A scalar with its words filled in — what `Taxonomy.scalars` carries. */
export interface ResolvedScalarAxis extends ScalarAxis {
  readonly label: string
  readonly tooltip: string
}

/** A declared scalar with its defaults filled in: the id as label, the label as tooltip. */
export function resolveScalarAxis(scalar: ScalarAxis): ResolvedScalarAxis {
  const label = scalar.label ?? scalar.id
  return { id: scalar.id, label, tooltip: scalar.tooltip ?? label, normalize: scalar.normalize, compute: graph => scalar.compute(graph) }
}

/**
 * Where a scalar's unit interval lands on an axis: the world coordinate a
 * score of 0 rests at, and the one a score of 1 rests at. Either may be the
 * lower — a span reads like a chart's axis and flips by dragging its ends
 * past each other.
 */
export interface ScalarSpan {
  readonly zero: number
  readonly one: number
}

/**
 * A layout axis backed by a computed scalar: which scalar, and — only
 * once the user has dragged an end — its span. Absent, the span is the
 * taxonomy's (`defaultSpan`), so it follows the taxonomy as a band axis's
 * declared bands do; the tuning stores what the user decided, nothing else.
 */
export interface ScalarTuning {
  readonly scalar: string
  readonly span?: ScalarSpan
}

/** The guard on a layout tuning: scalar, or a mapping with its overrides. */
export function isScalarTuning<T extends object>(t: ScalarTuning | T): t is ScalarTuning {
  return 'scalar' in t
}

/**
 * Downstream reach: how many dependency levels deep a node's subtree runs,
 * propagated up the containment hierarchy (one rank per tier, so a container
 * strictly out-ranks everything it hosts), normalized by the top container.
 * Leaves score 0; a graph with no dependency edges scores 0 everywhere.
 * Topological gravity reads this over the visible subgraph; as an axis it is
 * read over the whole graph. Either way the answer covers exactly the graph's
 * nodes: propagation stops at an ancestor the graph does not hold.
 */
export function computeDownstreamReach(graph: ReadableGraph): Map<string, number> {
  const adj = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (isContainment(e)) continue
    const list = adj.get(e.sourceId)
    if (list) list.push(e.targetId)
    else adj.set(e.sourceId, [e.targetId])
  }

  const depths = new Map<string, number>()
  for (const node of graph.nodes) {
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
  }

  // Propagate each node's depth up its containment chain, adding one rank per
  // tier so a container *strictly* out-ranks everything it hosts. Early-out
  // when an ancestor is already ranked higher (a deeper branch already
  // propagated past it, so its own ancestors are too).
  const effective = new Map(depths)
  for (const node of graph.nodes) {
    const d = depths.get(node.id) ?? 0
    if (d <= 0) continue
    let parent = node.parentId === undefined ? undefined : graph.getNode(node.parentId)
    let bump = d
    const guard = new Set<string>()
    while (parent && !guard.has(parent.id)) {
      guard.add(parent.id)
      bump += 1
      if ((effective.get(parent.id) ?? 0) >= bump) break
      effective.set(parent.id, bump)
      parent = parent.parentId === undefined ? undefined : graph.getNode(parent.parentId)
    }
  }

  return normalized(effective)
}

/** Dependency edges in and out, as a fraction of the busiest node's. */
export function computeDegree(graph: ReadableGraph): Map<string, number> {
  const count = new Map<string, number>()
  for (const n of graph.nodes) count.set(n.id, 0)
  for (const e of graph.edges) {
    if (isContainment(e)) continue
    if (graph.getNode(e.sourceId)) count.set(e.sourceId, (count.get(e.sourceId) ?? 0) + 1)
    if (graph.getNode(e.targetId)) count.set(e.targetId, (count.get(e.targetId) ?? 0) + 1)
  }
  return normalized(count)
}

/** Containment depth: 0 at the top of the hierarchy, 1 at the deepest node. */
export function computeContainmentDepth(graph: ReadableGraph): Map<string, number> {
  const depth = new Map<string, number>()
  for (const n of graph.nodes) {
    let d = 0
    let parent = n.parentId === undefined ? undefined : graph.getNode(n.parentId)
    const guard = new Set<string>()
    while (parent && !guard.has(parent.id)) {
      guard.add(parent.id)
      d++
      parent = parent.parentId === undefined ? undefined : graph.getNode(parent.parentId)
    }
    depth.set(n.id, d)
  }
  return normalized(depth)
}

/**
 * Divide by the maximum so the answer spans [0, 1]; a maximum of 0 is a true
 * 0 for every node, not an absence — the span's zero end, not the centre.
 */
export function normalized(values: Map<string, number>): Map<string, number> {
  let max = 0
  for (const v of values.values()) if (v > max) max = v
  const scores = new Map<string, number>()
  for (const [id, v] of values) scores.set(id, max === 0 ? 0 : v / max)
  return scores
}

/**
 * Map the smallest answer to 0 and the largest to 1; answers all alike are a
 * true 0 for every node — the span's zero end, not the centre.
 */
export function rangeNormalized(values: Map<string, number>): Map<string, number> {
  let min = Infinity, max = -Infinity
  for (const v of values.values()) { if (v < min) min = v; if (v > max) max = v }
  const scores = new Map<string, number>()
  for (const [id, v] of values) scores.set(id, max > min ? (v - min) / (max - min) : 0)
  return scores
}

/** The built-in reach scalar. */
export const downstreamReach: ScalarAxis = {
  id: 'reach',
  label: 'Reach',
  tooltip: 'Downstream reach: how many dependency levels deep a node’s subtree runs, propagated up containment; leaves at 0',
  compute: computeDownstreamReach,
  normalize: 'none',
}

/** The built-in degree scalar. */
export const degree: ScalarAxis = {
  id: 'degree',
  label: 'Degree',
  tooltip: 'Dependency edges in and out, as a fraction of the busiest node’s',
  compute: computeDegree,
  normalize: 'none',
}

/** The built-in depth scalar. */
export const containmentDepth: ScalarAxis = {
  id: 'depth',
  label: 'Depth',
  tooltip: 'Containment depth: 0 at the top of the hierarchy, 1 at the deepest node',
  compute: computeContainmentDepth,
  normalize: 'none',
}

/** The scalars every host gets: structural, so they need no domain knowledge. */
export const BUILT_IN_SCALARS: readonly ScalarAxis[] = [downstreamReach, degree, containmentDepth]
