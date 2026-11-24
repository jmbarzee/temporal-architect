// What one execution did to the graph: the deployments and edges it visited, how
// often each edge was crossed, the instances of one deployment, and the messages
// that landed on nothing. Read off the events as far as the scrubber has played.
// The rules are spec/GRAPH_VIEW.md § Execution in the graph.

import type { Graph } from '@jmbarzee/force-graph'
import type { Execution, ExecutionEdge } from '@temporal-architect/wire-types'
import { dispatchOf } from '../adapter/edge-types'
import { edgeKey } from '../adapter/sdk'

export interface Visits {
  /** The deployments reached, by node id, each with the instances of it that ran: the `@n` of their lanes. */
  nodes: Map<string, string[]>
  /** The edges dispatched along, by key, with the events that crossed each. */
  edges: Map<string, { edge: ExecutionEdge; count: number }>
  /** Signals sent to a deployment whose every lane had ended, by edge key: how many landed on nothing. */
  unreceived: Map<string, number>
}

const key = ({ from, to, kind }: ExecutionEdge) => edgeKey(from, to, kind)
const instanceOf = (lane: string, n: number) => lane.match(/ @\d+$/)?.[0].trim() ?? `@${n}`

/** The visits of the first `upTo` events, in the order the contract lists them (happens-before). */
export function visitsOf({ lanes, events }: Execution, upTo = events.length): Visits {
  const played = events.slice(0, upTo)
  const at = new Map(events.map((e, i) => [e.id, i]))
  const node = new Map(lanes.map(l => [l.id, l.node]))
  const out: Visits = { nodes: new Map(), edges: new Map(), unreceived: new Map() }
  const reach = (id: string) => out.nodes.get(id) ?? out.nodes.set(id, []).get(id)!

  const instances = new Map<string, Set<string>>()
  for (const l of lanes) if (l.node) instances.set(l.node, (instances.get(l.node) ?? new Set()).add(l.id))
  for (const e of played) {
    const n = node.get(e.lane)
    if (!n) continue
    const list = reach(n)
    const ids = [...instances.get(n)!]
    const name = instanceOf(e.lane, ids.indexOf(e.lane) + 1)
    if (!list.includes(name)) list.push(name)
  }

  played.forEach((e, i) => {
    if (!e.edge) return
    reach(e.edge.to)
    const k = key(e.edge)
    out.edges.set(k, { edge: e.edge, count: (out.edges.get(k)?.count ?? 0) + 1 })
    // A send lands on nothing when the deployment it targets has lanes and each ended before it.
    const targets = lanes.filter(l => l.node === e.edge!.to)
    const closed = (end?: string) => end !== undefined && at.get(end)! < i
    if (e.edge.kind === 'signalSend' && targets.length > 0 && targets.every(l => closed(l.endedBy))) {
      out.unreceived.set(k, (out.unreceived.get(k) ?? 0) + 1)
    }
  })
  return out
}

/** The ids of the view edges the execution crossed, folded from the keys as `crossingEdgeIds` is. */
export function crossedEdgeIds(graph: Graph, { edges }: Visits): Set<string> {
  const out = new Set<string>()
  for (const e of graph.edges) {
    const kind = dispatchOf(e)
    if (kind !== undefined && edges.has(edgeKey(e.sourceId, e.targetId, kind))) out.add(e.id)
  }
  return out
}

/**
 * The graph with each visited deployment carrying what the execution did to it, as chips:
 * an instance (`@1`) when it ran as several, each crossing into it (`×3 from Agent`) and the signals
 * that found it ended (`unreceived ×2`). The graph itself when there is nothing to carry.
 */
export function withVisits(graph: Graph, visits: Visits): Graph {
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.name ?? id
  const chips = new Map<string, string[]>()
  const add = (id: string, chip: string) => chips.set(id, [...(chips.get(id) ?? []), chip])
  for (const [id, instances] of visits.nodes) if (instances.length > 1) instances.forEach(i => add(id, i))
  for (const [k, { edge, count }] of visits.edges) {
    add(edge.to, `×${count} from ${name(edge.from)}`)
    const lost = visits.unreceived.get(k)
    if (lost) add(edge.to, `unreceived ×${lost}`)
  }
  if (chips.size === 0) return graph
  return { ...graph, nodes: graph.nodes.map(n => (chips.has(n.id) ? { ...n, badges: [...(n.badges ?? []), ...chips.get(n.id)!] } : n)) }
}

/** The time of the last event played, when the execution recorded one: what a time series attaches to the scrubber by. */
export const timeAt = ({ events }: Execution, upTo: number): string | undefined => events[upTo - 1]?.time
