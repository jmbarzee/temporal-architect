// The component contract's small promises, pinned: what a host may hand the
// view and get back, that no fixture reaches.
//
//   - `positions`: a layout the host kept is where a node starts, and a node
//     it kept nothing for is seeded as ever;
//   - `groupColour`: a group that names its glow keeps it, the rest take the
//     palette's slot for their place in the list;
//   - `highlightDirection`: the highlight hook is told which way the walk went;
//   - `graphShape`: what makes two graphs the same shape to the view — the
//     nodes, their parents and the edges between their ends, not the objects.
//
// Each is the function the view calls, not a re-derivation (F25).

import { Simulation } from '@temporal-architect/graph-view/graph/simulation'
import { activeGroupsOf } from '@temporal-architect/graph-view/graph/groups'
import { highlightOf } from '@temporal-architect/graph-view/graph/highlight'
import { createOntology } from '@temporal-architect/graph-view/graph/ontology'
import type { HighlightDirection } from '@temporal-architect/graph-view/graph/ontology'
import { RELATION_DIMENSION } from '@temporal-architect/graph-view/graph/dimension'
import { graphShapeEquals } from '@temporal-architect/graph-view/graph/model'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import { DEFAULT_ONTOLOGY, DEFAULT_ONTOLOGY_SPEC } from '../adapter/node-types'
import { mulberry32 } from './rng'
import { syntheticNode } from './tuning-probes'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const SEED = 0xc0de

const graphOf = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({ nodes: new Map(nodes.map(n => [n.id, n])), edges })
const dependency = (id: string, sourceId: string, targetId: string): GraphEdge =>
  ({ id, sourceId, targetId, dimensions: { [RELATION_DIMENSION]: 'dependency' } })

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
  const sim = new Simulation(graph, undefined, mulberry32(SEED), DEFAULT_ONTOLOGY, given)
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
  const ontology = createOntology({
    ...DEFAULT_ONTOLOGY_SPEC,
    highlight: (_active, base, _graph, direction) => { seen.push(direction); return base },
  })
  const nodes = [syntheticNode('a', 'workflow', undefined), syntheticNode('b', 'activity', undefined)]
  const graph = graphOf(nodes, [dependency('e', 'a', 'b')])
  const visible = { visibleNodes: nodes, visibleEdges: graph.edges, visibleIds: new Set(graph.nodes.keys()), getNode: (id: string) => graph.nodes.get(id) }
  const upstream = highlightOf(ontology, nodes[0], 'upstream', visible)
  const downstream = highlightOf(ontology, nodes[0], 'downstream', visible)
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
    same: graphShapeEquals(graph, graph),
    structuralCopy: graphShapeEquals(graph, graphOf(nodes.map(cloneNode), edges.map(cloneEdge))),
    parentChanged: graphShapeEquals(graph, graphOf(nodes.map(n => ({ ...n, parentId: n.id === 'b' ? 'c' : n.parentId })), edges.map(cloneEdge))),
    targetChanged: graphShapeEquals(graph, graphOf(nodes.map(cloneNode), edges.map(e => ({ ...e, targetId: e.id === 'e2' ? 'a' : e.targetId })))),
    edgeRemoved: graphShapeEquals(graph, graphOf(nodes.map(cloneNode), edges.slice(0, 1).map(cloneEdge))),
  }
}

export function contractProbes(): Json {
  return { positions: positions(), groupColour: groupColour(), highlightDirection: highlightDirection(), graphShape: graphShape() }
}
