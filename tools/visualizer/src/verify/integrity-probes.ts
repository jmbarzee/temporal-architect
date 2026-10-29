// The defects Unit 10 fixed, each pinned on a taxonomy of its own so none of
// them depends on the first host's vocabulary (D66):
//
//   - two dependency edges between the same two visible nodes are two edges,
//     with their own ids and their own types; only graduated edges collapse,
//     and which survives is the taxonomy's `collapse`;
//   - a graduated edge carries the type of the edge it stands for, resolved on
//     that edge's original endpoints;
//   - only the axes a view shows filter;
//   - `validateGraph` names every defect a host's graph can carry, and
//     `dropInvalid` leaves out exactly the edges an error names;
//   - a group keeps its colour when a filter hides the groups before it.

import { createOntology } from '@temporal-architect/graph-view/graph/ontology'
import type { OntologySpec } from '@temporal-architect/graph-view/graph/ontology'
import type { NodeStyle, EdgeType } from '@temporal-architect/graph-view/graph/taxonomy'
import type { DimensionDescriptor } from '@temporal-architect/graph-view/graph/dimension'
import { RELATION_DIMENSION } from '@temporal-architect/graph-view/graph/dimension'
import type { Graph, GraphEdge } from '@temporal-architect/graph-view/graph/model'
import type { SimNode } from '@temporal-architect/graph-view/graph/simulation'
import { computeVisibleGraph } from '@temporal-architect/graph-view/components/graph-view/visibleGraph'
import { validateGraph, dropInvalid } from '@temporal-architect/graph-view/graph/validate'
import { activeGroupsOf } from '@temporal-architect/graph-view/graph/groups'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const KIND = 'kind'
const ZONE = 'zone'
const EDGE_KIND = 'edgeKind'

const body = (label: string, abbreviation: string, tier: number): Omit<NodeStyle, 'id'> => ({
  label, abbreviation, icon: label[0], whenHidden: 'ascend', summaryKind: tier === 0 ? 'children' : 'degree',
  color: { light: { fill: '#336699', border: '#224466' }, dark: { fill: '#336699', border: '#224466' } },
  size: { r: 10, iconSize: 10 },
  physics: { charge: -300, coreRadius: 30, band: { x: { min: -100, max: 100 }, y: { min: tier * 100, max: tier * 100 + 50 } } },
})
const style = (id: string, ...rest: Parameters<typeof body>): NodeStyle => ({ id, ...body(...rest) })
const edgeType = (id: string, relation: 'containment' | 'dependency', dash: number[]): EdgeType => ({
  id, label: id, sourceType: 'leaf', targetType: relation === 'containment' ? 'box' : 'leaf', relation,
  physics: { strength: 0.5, distance: 80 }, style: { color: { light: '#888888', dark: '#aaaaaa' }, alpha: 0.8, dash, width: 1 }, tooltip: id,
})
const axis = (id: string, empty: 'all' | 'none'): DimensionDescriptor => ({ id, label: id, emptyMeans: empty })

/** A containment edge is `contains`; a dependency is `signals` or `calls` by its own axis; two spellings are deliberately wrong. */
const SPEC: OntologySpec = {
  styleDimension: KIND, styleLabel: 'Kind',
  values: [style('box', 'Box', 'Bx', 0), style('leaf', 'Leaf', 'Lf', 1)],
  filterDimensions: [axis(KIND, 'none'), axis(ZONE, 'all')],
  edgeTypes: [edgeType('contains', 'containment', [4, 4]), edgeType('calls', 'dependency', []), edgeType('signals', 'dependency', [2, 2])],
  resolveEdgeType: edge => {
    const kind = edge.dimensions[EDGE_KIND]
    if (kind === 'mismatch') return 'calls'            // a containment edge answered as a dependency type
    if (kind === 'bogus') return 'nonesuch'            // an id the table does not declare
    if (edge.dimensions[RELATION_DIMENSION] === 'containment') return 'contains'
    return kind === 'signals' ? 'signals' : 'calls'
  },
  scalars: [],
  fallbackStyle: body('Unknown', 'Un', 1),
}
const ONTOLOGY = createOntology(SPEC)
/** The same taxonomy, preferring a signal over a call when two graduated edges collide. */
const PREFER_SIGNALS = createOntology({ ...SPEC, collapse: (kept, candidate) => candidate.dimensions[EDGE_KIND] === 'signals' ? candidate : kept })

function node(id: string, kind: string, zone: string, parentId?: string): SimNode {
  return {
    id, name: id, dimensions: { [KIND]: kind, [ZONE]: zone }, ring: parentId === undefined && kind !== 'box' ? 'dashed' : undefined, copyKey: id,
    ...(parentId !== undefined ? { parentId } : {}),
    x: 0, y: 0, vx: 0, vy: 0, pinned: false,
  }
}
function dep(id: string, sourceId: string, targetId: string, kind: 'calls' | 'signals' | 'bogus' | 'mismatch'): GraphEdge {
  return { id, sourceId, targetId, dimensions: { [RELATION_DIMENSION]: 'dependency', [EDGE_KIND]: kind } }
}
function contains(id: string, child: string, box: string, kind?: 'mismatch'): GraphEdge {
  return { id, sourceId: child, targetId: box, dimensions: { [RELATION_DIMENSION]: 'containment', ...(kind ? { [EDGE_KIND]: kind } : {}) } }
}
const source = (nodes: SimNode[], edges: GraphEdge[]) => {
  const byId = new Map(nodes.map(n => [n.id, n]))
  return { nodes, edges, getNode: (id: string) => byId.get(id) }
}
const all = (nodes: SimNode[]) => new Map([[KIND, new Set(nodes.map(n => n.dimensions[KIND]))], [ZONE, new Set<string>()]])
const line = (e: GraphEdge) => `${e.id}: ${e.sourceId} -> ${e.targetId}`

// Two boxes; two leaves in the first, one in the second; the first box's
// leaves each reach the second box's leaf, one by a call and one by a signal,
// and the two leaves reach each other both ways.
const NODES = [node('b1', 'box', 'east'), node('b2', 'box', 'west'), node('x', 'leaf', 'east', 'b1'), node('y', 'leaf', 'east', 'b1'), node('z', 'leaf', 'west', 'b2')]
const EDGES = [
  contains('c1', 'x', 'b1'), contains('c2', 'y', 'b1'), contains('c3', 'z', 'b2'),
  dep('xz', 'x', 'z', 'calls'), dep('yz', 'y', 'z', 'signals'),
  dep('xy-call', 'x', 'y', 'calls'), dep('xy-signal', 'x', 'y', 'signals'), dep('yx', 'y', 'x', 'calls'),
]

/** Every node visible: eight edges in, eight edges drawn, each with its own id and type. */
function parallelEdges(): Json {
  const vg = computeVisibleGraph(source(NODES, EDGES), all(NODES), ONTOLOGY)
  return {
    edges: sorted(vg.visibleEdges.map(line)),
    types: sortedRecord([...vg.edgeTypes].map(([id, t]) => [id, t ?? null] as const)),
  }
}

/** Leaves hidden: the two reaches from b1 to b2 collapse to one graduated edge — the call met first, or the signal when the taxonomy prefers it. */
function graduatedCollapse(): Json {
  const boxesOnly = new Map([[KIND, new Set(['box'])], [ZONE, new Set<string>()]])
  const drawn = (ontology: typeof ONTOLOGY) => {
    const vg = computeVisibleGraph(source(NODES, EDGES), boxesOnly, ontology)
    return { edges: sorted(vg.visibleEdges.map(line)), types: sortedRecord([...vg.edgeTypes].map(([id, t]) => [id, t ?? null] as const)) }
  }
  return { firstWins: drawn(ONTOLOGY), preferSignals: drawn(PREFER_SIGNALS) }
}

/** A zone selection that excludes the west filters only when the zone axis is in the chain. */
function chainScope(): Json {
  const eastOnly = new Map([[KIND, new Set(['box', 'leaf'])], [ZONE, new Set(['east'])]])
  const kindAxis = ONTOLOGY.filterDimensions.filter(d => d.id === KIND)
  const chained = computeVisibleGraph(source(NODES, EDGES), eastOnly, ONTOLOGY, ONTOLOGY.filterDimensions)
  const unchained = computeVisibleGraph(source(NODES, EDGES), eastOnly, ONTOLOGY, kindAxis)
  return { zoneChained: sorted(chained.visibleIds), zoneUnchained: sorted(unchained.visibleIds) }
}

/** Every defect the validator names, on one graph that carries all of them, and what is left to draw. */
function validation(): Json {
  const nodes = [node('b1', 'box', 'east'), node('x', 'leaf', 'east', 'b1'), node('y', 'leaf', 'east', 'ghost'), node('w', 'leaf', 'east', 'b1'), node('q', 'unknownKind', 'east', 'b1')]
  const edges: GraphEdge[] = [
    contains('c1', 'x', 'b1'),
    contains('cw', 'w', 'b1', 'mismatch'),
    dep('ok', 'x', 'w', 'calls'),
    dep('missing', 'x', 'nobody', 'calls'),
    { id: 'friend', sourceId: 'x', targetId: 'w', dimensions: { [RELATION_DIMENSION]: 'friendship' } },
    dep('bogus', 'w', 'x', 'bogus'),
    dep('ok', 'w', 'x', 'calls'),
  ]
  const graph: Graph = { nodes: new Map(nodes.map(n => [n.id, n])), edges }
  const diagnostics = validateGraph(graph, ONTOLOGY)
  const drawn = dropInvalid(graph, diagnostics)
  return {
    diagnostics: sorted(diagnostics.map(d => `${d.severity} ${d.code} ${d.edgeId ?? d.nodeId ?? ''}`)),
    drawnEdges: sorted(drawn.edges.map(line)),
    parentsCleared: sorted([...drawn.nodes.values()].filter(n => graph.nodes.get(n.id)?.parentId !== n.parentId).map(n => n.id)),
    cleanGraphIsSame: dropInvalid(graph, []) === graph,
  }
}

/** The middle group has no visible node; the third keeps its third colour, in both themes. */
function groupColours(): Json {
  const groups = [
    { id: 'g1', nodeIds: new Set(['x']) },
    { id: 'g2', nodeIds: new Set(['hidden']) },
    { id: 'g3', nodeIds: new Set(['y']) },
  ]
  const visible = new Set(['x', 'y'])
  const colours = (theme: 'light' | 'dark') => sortedRecord(activeGroupsOf(groups, visible, theme).map(g => [g.id, g.color] as const))
  return { dark: colours('dark'), light: colours('light') }
}

export function integrityProbes(): Json {
  return {
    parallelEdges: parallelEdges(),
    graduatedCollapse: graduatedCollapse(),
    chainScope: chainScope(),
    validation: validation(),
    groupColours: groupColours(),
  }
}
