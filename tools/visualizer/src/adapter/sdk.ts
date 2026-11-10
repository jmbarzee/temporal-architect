// The SDK scheme of the group overlay (GRAPH_VIEW.md § Group Overlay): nodes
// grouped by the SDK set of the worker they deploy on, and the edges that cross
// SDKs. Both read the wire nodes' `sdks`; the crossing rule is the TS copy of
// `graph.SDKCrossings`, held equal to it by the fixture `sdk.test.ts` shares
// with the Go test.

import type { Graph, NodeGroup } from '@temporal-architect/graph-view'
import type { ParserGraph, ParserNode } from '../types/parser-graph'
import { dispatchOf } from './edge-types'

// The edge kinds that carry a payload from one worker's SDK to another's.
const CALL_KINDS: ReadonlySet<string> = new Set(['activityCall', 'workflowCall', 'nexusCall', 'signalSend'])

function sdkNames(n: ParserNode): string[] {
  return (n.sdks ?? []).map(s => s.sdk)
}

function edgeKey(from: string, to: string, kind: string): string {
  return `${from}\u0000${to}\u0000${kind}`
}

/**
 * The (from, to, kind) keys of the edges that cross SDKs: an activity,
 * workflow or Nexus call, or a signal send, whose two nodes both carry `sdks`
 * and share none.
 */
export function sdkCrossings(pg: ParserGraph): Set<string> {
  const nodes = new Map(pg.nodes.map(n => [n.id, n]))
  const out = new Set<string>()
  for (const e of pg.edges) {
    if (!CALL_KINDS.has(e.kind)) continue
    const from = nodes.get(e.from)
    const to = nodes.get(e.to)
    if (!from || !to) continue
    const fromSDKs = sdkNames(from)
    const toSDKs = sdkNames(to)
    if (fromSDKs.length === 0 || toSDKs.length === 0 || fromSDKs.some(s => toSDKs.includes(s))) continue
    out.add(edgeKey(e.from, e.to, e.kind))
  }
  return out
}

/** The ids of the view edges `buildGraph` folded from the crossing keys. */
export function crossingEdgeIds(graph: Graph, crossings: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const e of graph.edges) {
    const kind = dispatchOf(e)
    if (kind !== undefined && crossings.has(edgeKey(e.sourceId, e.targetId, kind))) out.add(e.id)
  }
  return out
}

/**
 * One group per distinct SDK set, labelled by its SDKs (`go + python`) and
 * ordered single-SDK sets first, then by label, so each keeps its palette slot
 * across reloads. A node with no `sdks` is in none.
 */
export function sdkGroupsOf(pg: ParserGraph): NodeGroup[] {
  const bySet = new Map<string, Set<string>>()
  for (const n of pg.nodes) {
    const names = sdkNames(n)
    if (names.length === 0) continue
    const label = [...new Set(names)].sort().join(' + ')
    let ids = bySet.get(label)
    if (!ids) bySet.set(label, ids = new Set())
    ids.add(n.id)
  }
  const multi = (label: string) => label.includes(' + ')
  return [...bySet.keys()]
    .sort()
    .sort((a, b) => Number(multi(a)) - Number(multi(b)))
    .map(label => ({ id: label, nodeIds: bySet.get(label)! }))
}
