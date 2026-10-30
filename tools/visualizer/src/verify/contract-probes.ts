// The component contract's small promises, pinned: what a host may hand the
// view and get back, that no fixture reaches.
//
//   - `positions`: a layout the host kept is where a node starts, and a node
//     it kept nothing for is seeded as ever;
//   - `groupColour`: a group that names its glow keeps it, the rest take the
//     palette's slot for their place in the list;
//   - `highlightDirection`: the highlight hook is told which way the walk went;
//   - `graphShape`: what makes two graphs the same to the view (`graphEquals`)
//     — every node and edge field, values compared and payloads by identity,
//     not the objects.
//
// Each is the function the view calls, not a re-derivation (F25).

import { Simulation } from '@temporal-architect/graph-view/graph/simulation'
import { activeGroupsOf } from '@temporal-architect/graph-view/graph/groups'
import { highlightOf } from '@temporal-architect/graph-view/graph/highlight'
import { createTaxonomy } from '@temporal-architect/graph-view/graph/taxonomy'
import type { HighlightDirection } from '@temporal-architect/graph-view/graph/taxonomy'
import { graphEquals, nodesById } from '@temporal-architect/graph-view/graph/model'
import { filterFromJSON, filterStatesEqual, filterToJSON, locksFromJSON, locksToJSON } from '@temporal-architect/graph-view/filter/types'
import { sameFocusRequest } from '@temporal-architect/graph-view/components/graph-view/focus'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import { DEFAULT_TAXONOMY, DEFAULT_TAXONOMY_SPEC } from '../adapter/node-types'
import { mulberry32 } from './rng'
import { syntheticNode } from './tuning-probes'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const SEED = 0xc0de

const graphOf = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({ nodes, edges })
const dependency = (id: string, sourceId: string, targetId: string): GraphEdge =>
  ({ id, sourceId, targetId, relation: 'dependency' })

/**
 * Two of three nodes given a position, the second one a child of the first: the
 * given ones stay exactly where they were put — a child is not stacked under
 * its parent when the host said where it goes — and the third is seeded.
 */
function positions(): Json {
  const graph = graphOf([
    syntheticNode('a', 'workflow', undefined),
    { ...syntheticNode('b', 'activity', undefined), parentId: 'a' },
    syntheticNode('c', 'worker', undefined),
  ], [])
  const given = new Map([['a', { x: 11, y: 22 }], ['b', { x: -5, y: 7 }]])
  const sim = new Simulation(graph, undefined, mulberry32(SEED), DEFAULT_TAXONOMY, given)
  const at = (id: string) => {
    const node = sim.getNode(id)
    if (!node) throw new Error(`contract-probes: the simulation has no node ${id}`)
    return node
  }
  const third = at('c')
  return {
    kept: { a: [at('a').x, at('a').y], b: [at('b').x, at('b').y] },
    seededIsFinite: Number.isFinite(third.x) && Number.isFinite(third.y),
    seededDiffers: ![...given.values()].some(p => p.x === third.x && p.y === third.y),
  }
}

/** A group that names its colour keeps it; one that does not takes the palette's slot for its place. */
function groupColour(): Json {
  const active = activeGroupsOf(
    [{ id: 'g', nodeIds: new Set(['a']), color: '#123456' }, { id: 'h', nodeIds: new Set(['a']) }],
    new Set(['a']),
    'light',
  )
  return sortedRecord(active.map(g => [g.id, g.color] as const))
}

/** The hook hears `upstream` and `downstream` as the walk is asked for them, and what it returns is what lights. */
function highlightDirection(): Json {
  const seen: HighlightDirection[] = []
  const taxonomy = createTaxonomy({
    ...DEFAULT_TAXONOMY_SPEC,
    highlight: (_active, base, _graph, direction) => { seen.push(direction); return base },
  })
  const nodes = [syntheticNode('a', 'workflow', undefined), syntheticNode('b', 'activity', undefined)]
  const graph = graphOf(nodes, [dependency('e', 'a', 'b')])
  const byId = nodesById(graph.nodes)
  const visible = { visibleNodes: nodes, visibleEdges: graph.edges, visibleIds: new Set(graph.nodes.map(n => n.id)), getNode: (id: string) => byId.get(id) }
  const upstream = highlightOf(taxonomy, nodes[0], 'upstream', visible)
  const downstream = highlightOf(taxonomy, nodes[0], 'downstream', visible)
  return { seen, lit: { upstream: sorted(upstream.nodes), downstream: sorted(downstream.nodes) } }
}

/** The same graph, a structural copy, and each kind of change that is not the same shape. */
function graphShape(): Json {
  const nodes = [syntheticNode('a', 'workflow', undefined), { ...syntheticNode('b', 'activity', undefined), parentId: 'a' }, syntheticNode('c', 'worker', undefined)]
  const edges = [dependency('e1', 'a', 'b'), dependency('e2', 'b', 'c')]
  const graph = graphOf(nodes, edges)
  const cloneNode = (n: GraphNode): GraphNode => ({ ...n })
  const cloneEdge = (e: GraphEdge): GraphEdge => ({ ...e })
  return {
    same: graphEquals(graph, graph),
    structuralCopy: graphEquals(graph, graphOf(nodes.map(cloneNode), edges.map(cloneEdge))),
    parentChanged: graphEquals(graph, graphOf(nodes.map(n => ({ ...n, parentId: n.id === 'b' ? 'c' : n.parentId })), edges.map(cloneEdge))),
    targetChanged: graphEquals(graph, graphOf(nodes.map(cloneNode), edges.map(e => ({ ...e, targetId: e.id === 'e2' ? 'a' : e.targetId })))),
    edgeRemoved: graphEquals(graph, graphOf(nodes.map(cloneNode), edges.slice(0, 1).map(cloneEdge))),
  }
}

/**
 * What makes two graphs the same to the view: every field of every node and
 * edge — values by content, payloads by identity — in the same order. The
 * same content in new objects is equal; a renamed node, a moved value, a new
 * payload object, a reordered list or an edge's changed value is not.
 */
function graphEquality(): Json {
  const payload = { k: 1 }
  const a = graphOf([
    { ...syntheticNode('a', 'workflow', undefined), payload },
    { ...syntheticNode('b', 'activity', undefined), parentId: 'a' },
  ], [dependency('e', 'a', 'b')])
  const again = graphOf(a.nodes.map(n => ({ ...n, values: { ...n.values } })), a.edges.map(e => ({ ...e })))
  const renamed = graphOf(a.nodes.map(n => (n.id === 'b' ? { ...n, name: 'other' } : n)), [...a.edges])
  const moved = graphOf(a.nodes.map(n => (n.id === 'b' ? { ...n, values: { ...n.values, file: 'x' } } : n)), [...a.edges])
  const newPayload = graphOf(a.nodes.map(n => (n.id === 'a' ? { ...n, payload: { k: 1 } } : n)), [...a.edges])
  const reordered = graphOf([a.nodes[1], a.nodes[0]], [...a.edges])
  const edgeValue = graphOf([...a.nodes], [{ ...a.edges[0], values: { kind: 'signal' } }])
  return {
    sameContent: graphEquals(a, again),
    renamed: graphEquals(a, renamed),
    movedValue: graphEquals(a, moved),
    newPayloadObject: graphEquals(a, newPayload),
    reordered: graphEquals(a, reordered),
    edgeValue: graphEquals(a, edgeValue),
  }
}

/** A filter and its locks survive the trip to plain data and back; data of another shape is refused, not guessed at. */
function filterJson(): Json {
  const filter = new Map([['kind', new Set(['workflow', 'activity'])], ['file', new Set<string>()]])
  const json = filterToJSON(filter)
  const back = filterFromJSON(JSON.parse(JSON.stringify(json)))
  const locks = new Map([['kind', true], ['file', false]])
  const locksBack = locksFromJSON(JSON.parse(JSON.stringify(locksToJSON(locks))))
  return {
    json: sortedRecord(Object.entries(json).map(([k, v]) => [k, v] as const)),
    roundTrip: back !== undefined && filterStatesEqual(filter, back),
    refused: [filterFromJSON(null), filterFromJSON([]), filterFromJSON({ kind: 'workflow' }), filterFromJSON({ kind: [1] })].map(v => v === undefined),
    locks: sortedRecord(Object.entries(locksToJSON(locks))),
    locksRoundTrip: locksBack !== undefined && locksBack.size === 2 && locksBack.get('kind') === true && locksBack.get('file') === false,
    locksRefused: [locksFromJSON(null), locksFromJSON({ kind: 'yes' })].map(v => v === undefined),
    // Only a plain record is the shape the writers produce; a Map, a Set or a Date is refused, not read as empty.
    instancesRefused: [filterFromJSON(new Map()), filterFromJSON(new Set()), locksFromJSON(new Date())].map(v => v === undefined),
    // An axis named like a prototype key survives the trip out.
    protoKey: Object.keys(filterToJSON(new Map([['__proto__', new Set(['x'])], ['kind', new Set(['a'])]]))).sort(),
  }
}

/** Two focus requests are one ask when their id and key agree; null is a withdrawal, equal only to itself. */
function focusRequest(): Json {
  return {
    sameIdNoKey: sameFocusRequest({ id: 'a' }, { id: 'a' }),
    sameIdSameKey: sameFocusRequest({ id: 'a', key: 2 }, { id: 'a', key: 2 }),
    sameIdNewKey: sameFocusRequest({ id: 'a', key: 2 }, { id: 'a', key: 3 }),
    otherId: sameFocusRequest({ id: 'a' }, { id: 'b' }),
    nullAndRequest: sameFocusRequest(null, { id: 'a' }),
    bothNull: sameFocusRequest(null, null),
  }
}

export function contractProbes(): Json {
  return {
    positions: positions(), groupColour: groupColour(), highlightDirection: highlightDirection(), graphShape: graphShape(),
    graphEquality: graphEquality(), filterJson: filterJson(), focusRequest: focusRequest(),
  }
}
