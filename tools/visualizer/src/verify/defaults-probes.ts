// What a host gets for declaring less: the library's defaults, pinned.
//
// A taxonomy declares a value by its id, label and colour; an edge type by its
// endpoints, relation and stroke; a filter axis by its id, label and what an
// empty selection means. Everything else is derived — from the value's place in
// the declaration order, from the declared springs, from `emptyMeans` — and
// this host declares none of it, so nothing else here reads the derivations.
// The rows are on a spec of that minimum, on its own vocabulary (none of the
// first host's names), so a changed default turns a golden red rather than
// every host that leans on it.
//
//   - `minimal`: every field a default fills in, per value, edge type and axis;
//   - `typicalSpring`: an edge type with no spring starts from the mean of the
//     declared ones;
//   - `defaultFilter`: what a view opens with, per kind of axis;
//   - `containment`: the edge the view derives from `parentId`, and what
//     validation says of a host that also lists its own;
//   - `stackBand`: how the declaration order places the rest bands.

import { defaultFilter } from '@temporal-architect/graph-view'
import { createOntology } from '@temporal-architect/graph-view/graph/ontology'
import type { OntologySpec } from '@temporal-architect/graph-view/graph/ontology'
import { RELATION_DIMENSION } from '@temporal-architect/graph-view/graph/dimension'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import { withContainmentEdges } from '@temporal-architect/graph-view/graph/model'
import type { EdgeStroke, ThemedColor } from '@temporal-architect/graph-view/graph/scheme'
import { stackBand } from '@temporal-architect/graph-view/graph/taxonomy'
import type { EdgeType, ResolvedNodeStyle } from '@temporal-architect/graph-view/graph/taxonomy'
import { validateGraph } from '@temporal-architect/graph-view/graph/validate'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const KIND = 'kind'
const ZONE = 'zone'
const SWATCH: ThemedColor = { light: { fill: '#336699', border: '#224466' }, dark: { fill: '#336699', border: '#224466' } }
const STROKE: EdgeStroke = { color: { light: '#888888', dark: '#aaaaaa' }, alpha: 0.8, dash: [], width: 1 }

/** Three values with only the three required fields, and whichever edge types a row is about. */
function specOf(edgeTypes: readonly EdgeType[]): OntologySpec {
  return {
    styleDimension: KIND,
    values: [
      { id: 'a', label: 'Alpha', color: SWATCH },
      { id: 'b', label: 'Beta', color: SWATCH },
      { id: 'c', label: 'Gamma', color: SWATCH },
    ],
    edgeTypes,
    resolveEdgeType: edge => (edge.dimensions[RELATION_DIMENSION] === 'containment' ? 'in' : 'calls'),
    filterDimensions: [
      { id: KIND, label: 'Kind', emptyMeans: 'none' },
      { id: ZONE, label: 'Zone', emptyMeans: 'all' },
    ],
  }
}

/** An edge type that declares no spring and no tooltip. */
const bare = (id: string, relation: EdgeType['relation'], sourceType: string, targetType: string): EdgeType =>
  ({ id, label: id, sourceType, targetType, relation, style: STROKE })

const MINIMAL = createOntology(specOf([bare('in', 'containment', 'b', 'a'), bare('calls', 'dependency', 'c', 'c')]))

const styleRow = (s: ResolvedNodeStyle): Json => ({
  abbreviation: s.abbreviation,
  icon: s.icon,
  size: { r: s.size.r, iconSize: s.size.iconSize },
  physics: {
    charge: s.physics.charge,
    coreRadius: s.physics.coreRadius,
    band: { x: { min: s.physics.band.x.min, max: s.physics.band.x.max }, y: { min: s.physics.band.y.min, max: s.physics.band.y.max } },
  },
  whenHidden: s.whenHidden,
  summaryKind: s.summaryKind,
})

function minimal(): Json {
  return {
    styleLabel: MINIMAL.styleLabel(),
    values: sortedRecord(MINIMAL.styleValues.map(v => [v, styleRow(MINIMAL.styleOf(v))] as const)),
    fallback: styleRow(MINIMAL.styleOf('nope')),
    edgeTypes: sortedRecord(MINIMAL.edgeTypes.map(e => [e.id, { physics: { strength: e.physics.strength, distance: e.physics.distance }, tooltip: e.tooltip }] as const)),
    descriptors: sortedRecord(MINIMAL.filterDimensions.map(d => [d.id, {
      absentMeans: d.absentMeans,
      focus: d.focus,
      reheat: { alpha: d.reheat.alpha, seedRevealed: d.reheat.seedRevealed, refit: d.reheat.refit, resume: d.reheat.resume },
      presentation: d.presentation,
      chips: d.chipsFor(['a', 'b']).map(c => ({ id: c.id, label: c.label, icon: c.icon ?? null, tint: c.tint ?? null, values: [...c.values] })),
      labelFor: d.labelFor('a'),
      abbreviationFor: d.abbreviationFor('a'),
      initialSelection: [...d.initialSelection(['a', 'b'])],
    }] as const)),
  }
}

/** Two of three edge types declare a spring; the third starts from their mean. */
function typicalSpring(): Json {
  const ontology = createOntology(specOf([
    { ...bare('first', 'dependency', 'a', 'a'), physics: { strength: 0.4, distance: 100 } },
    { ...bare('second', 'dependency', 'b', 'b'), physics: { strength: 0.8, distance: 300 } },
    bare('third', 'dependency', 'c', 'c'),
  ]))
  const third = ontology.edgeTypes.find(e => e.id === 'third')!
  return { strength: third.physics.strength, distance: third.physics.distance }
}

const node = (id: string, kind: string, zone?: string, parentId?: string): GraphNode =>
  ({ id, name: id, dimensions: zone === undefined ? { [KIND]: kind } : { [KIND]: kind, [ZONE]: zone }, ...(parentId !== undefined ? { parentId } : {}) })
const contains = (id: string, child: string, parent: string): GraphEdge =>
  ({ id, sourceId: child, targetId: parent, dimensions: { [RELATION_DIMENSION]: 'containment' } })
const graphOf = (nodes: GraphNode[], edges: GraphEdge[] = []): Graph => ({ nodes: new Map(nodes.map(n => [n.id, n])), edges })

/** An allow-list opens with every value the graph presents; a narrowing axis, with none. */
function defaultFilterRow(): Json {
  const graph = graphOf([node('n1', 'a', 'east'), node('n2', 'b', 'east'), node('n3', 'c', 'west'), node('n4', 'c')])
  return sortedRecord([...defaultFilter(MINIMAL, graph)].map(([axis, selection]) => [axis, sorted(selection)] as const))
}

/** The containment edge `parentId` implies, and what validation makes of a host's own. */
function containment(): Json {
  const graph = graphOf(
    [node('p', 'a'), node('x', 'b', undefined, 'p'), node('y', 'b', undefined, 'p'), node('z', 'b', undefined, 'missing')],
    [contains('own:y', 'y', 'p')],
  )
  const derived = withContainmentEdges(graph)
  const codes = (g: Graph, ontology = MINIMAL) => validateGraph(g, ontology).map(d => d.code).sort()
  return {
    // `x` gets `in:x`; `y` listed its own, so gets none; `z`'s parent is not in the graph.
    edgeIds: sorted(derived.edges.map(e => e.id)),
    addedOnce: derived.edges.filter(e => e.sourceId === 'y').length,
    validation: {
      // Edges of its own, none to its parent.
      listsNonParent: codes(graphOf([node('p', 'a'), node('q', 'a'), node('n', 'b', undefined, 'p')], [contains('e', 'n', 'q')])),
      // The edge is derived, so none is needed.
      parentWithoutEdges: codes(graphOf([node('p', 'a'), node('n', 'b', undefined, 'p')])),
      // A containment edge the rule answers with a dependency type.
      containmentAsDependency: codes(
        graphOf([node('p', 'a'), node('n', 'b', undefined, 'p')], [contains('e', 'n', 'p')]),
        createOntology({ ...specOf([bare('in', 'containment', 'b', 'a'), bare('calls', 'dependency', 'c', 'c')]), resolveEdgeType: () => 'calls' }),
      ),
    },
  }
}

/** The rest band on the hierarchy axis of the value at position `i` of `n`. */
function stackBands(): Json {
  const rows: Json[] = []
  for (const n of [1, 2, 4, 7]) {
    for (let i = 0; i < n; i++) {
      const band = stackBand(i, n)
      rows.push({ n, i, min: band.min, max: band.max })
    }
  }
  return rows
}

export function defaultsProbes(): Json {
  return {
    minimal: minimal(),
    typicalSpring: typicalSpring(),
    defaultFilter: defaultFilterRow(),
    containment: containment(),
    stackBand: stackBands(),
  }
}
