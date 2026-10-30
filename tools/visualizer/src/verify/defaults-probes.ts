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
//   - `stackBand`: how the declaration order places the rest bands;
//   - `pass2`: what a host no longer has to say — an edge classified by its
//     declared pair, a stroke left to the neutral one, a filter axis left to
//     the style axis, a camera policy stated outright, a scalar answering raw
//     numbers — and the refusals and warnings that stand in for what it
//     might get wrong.

import { defaultFilter } from '@temporal-architect/graph-view'
import { createOntology } from '@temporal-architect/graph-view/graph/ontology'
import type { Ontology, OntologySpec } from '@temporal-architect/graph-view/graph/ontology'
import type { DimensionDescriptor, Relation } from '@temporal-architect/graph-view/graph/dimension'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import { readableGraph, withContainmentEdges } from '@temporal-architect/graph-view/graph/model'
import type { EdgeStroke, ThemedColor } from '@temporal-architect/graph-view/graph/scheme'
import { NEUTRAL_STROKE, stackBand } from '@temporal-architect/graph-view/graph/taxonomy'
import type { EdgeType, NodeStyle, ResolvedNodeStyle } from '@temporal-architect/graph-view/graph/taxonomy'
import { BUILT_IN_SCALARS, normalized } from '@temporal-architect/graph-view/graph/scalar'
import type { ScalarAxis } from '@temporal-architect/graph-view/graph/scalar'
import { defaultParamsFor } from '@temporal-architect/graph-view/graph/simulation'
import { layoutFrame, resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import { validateGraph } from '@temporal-architect/graph-view/graph/validate'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const KIND = 'kind'
const ZONE = 'zone'
const SWATCH: ThemedColor = { light: { fill: '#336699', border: '#224466' }, dark: { fill: '#336699', border: '#224466' } }
const STROKE: EdgeStroke = { color: { light: '#888888', dark: '#aaaaaa' }, alpha: 0.8, dash: [], width: 1 }

const VALUES: readonly NodeStyle[] = [
  { id: 'a', label: 'Alpha', color: SWATCH },
  { id: 'b', label: 'Beta', color: SWATCH },
  { id: 'c', label: 'Gamma', color: SWATCH },
]

/**
 * Three values with only the three required fields, and whichever edge types a
 * row is about — no rule to classify an edge, no filter axes: the minimum.
 */
function bareSpec(edgeTypes: readonly EdgeType[]): OntologySpec {
  return { styleDimension: KIND, values: VALUES, edgeTypes }
}

/** The same, with the two filter axes the earlier rows read: an allow-list on the style axis, a narrowing zone. */
function specOf(edgeTypes: readonly EdgeType[]): OntologySpec {
  return {
    ...bareSpec(edgeTypes),
    filterDimensions: [
      { id: KIND, label: 'Kind', emptyMeans: 'none' },
      { id: ZONE, label: 'Zone', emptyMeans: 'all' },
    ],
  }
}

/** An edge type that declares no spring and no tooltip. */
const bare = (id: string, relation: EdgeType['relation'], sourceType: string, targetType: string): EdgeType =>
  ({ id, label: id, sourceType, targetType, relation, style: STROKE })

/** An edge type that declares nothing but what it runs between: no spring, no tooltip, no stroke. */
const unstyled = (id: string, relation: EdgeType['relation'], sourceType: string, targetType: string): EdgeType =>
  ({ id, label: id, sourceType, targetType, relation })

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
  ({ id, sourceId: child, targetId: parent, relation: 'containment' })
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
        createOntology({ ...specOf([bare('in', 'containment', 'b', 'a'), bare('calls', 'dependency', 'c', 'c')]), classifyEdge: () => 'calls' }),
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

// ── Pass 2: what a host no longer has to say ────────────────────────────────

const dependency = (id: string, sourceId: string, targetId: string): GraphEdge => ({ id, sourceId, targetId })
const edgeLine = (e: GraphEdge) => `${e.id}: ${e.sourceId} -> ${e.targetId} (${e.relation ?? 'dependency'})`
const strokeRow = (s: EdgeStroke): Json => ({ color: { light: s.color.light, dark: s.color.dark }, alpha: s.alpha, dash: [...s.dash], width: s.width })

/** What a call threw, as the row records it; 'returned' when it did not. */
function refusalOf(run: () => unknown): string {
  try { run(); return 'returned' } catch (e) { return e instanceof Error ? e.message : String(e) }
}

const diagnosticRows = (graph: Graph, ontology: Ontology): Json =>
  validateGraph(graph, ontology).map(d => ({ severity: d.severity, code: d.code, subject: d.edgeId ?? d.nodeId ?? null, message: d.message }))

const reheatRow = (d: { reheat: { alpha: number; seedRevealed: boolean; refit: boolean; resume: boolean } }): Json =>
  ({ alpha: d.reheat.alpha, seedRevealed: d.reheat.seedRevealed, refit: d.reheat.refit, resume: d.reheat.resume })

/**
 * No `classifyEdge` at all: an edge is the one declared type whose relation and
 * endpoint values match its own, in either orientation. An edge between values
 * no type covers has no type — a warning, not an error, and it draws neutral.
 */
function classification(): Json {
  const ontology = createOntology(bareSpec([
    unstyled('in', 'containment', 'b', 'a'),
    unstyled('links', 'dependency', 'a', 'b'),
    unstyled('calls', 'dependency', 'c', 'c'),
  ]))
  const classify = (relation: Relation | undefined, src: string | undefined, tgt: string | undefined) =>
    ontology.classifyEdge({ id: 'e', sourceId: 's', targetId: 't', ...(relation ? { relation } : {}) }, src, tgt) ?? null
  const graph = graphOf(
    [node('na', 'a'), node('nb', 'b'), node('nc', 'c')],
    [dependency('ok', 'na', 'nb'), dependency('uncovered', 'na', 'nc')],
  )
  return {
    containmentAsDeclared: classify('containment', 'b', 'a'),
    containmentReversed: classify('containment', 'a', 'b'),
    // The relation is part of the pair: the same two values, two relations, two types.
    dependencyOnTheSamePair: classify(undefined, 'a', 'b'),
    dependencyReversed: classify('dependency', 'b', 'a'),
    uncovered: classify(undefined, 'a', 'c'),
    containmentWithNoType: classify('containment', 'c', 'c'),
    endpointWithNoValue: classify(undefined, undefined, 'a'),
    validation: diagnosticRows(graph, ontology),
  }
}

/**
 * Two declared types on one relation and one pair cannot be told apart by the
 * pair, so construction refuses them unless the host gives `classifyEdge`; and
 * the host's answer is consulted first, the declared pair deciding when it says nothing.
 */
function sharedPair(): Json {
  const calls = unstyled('calls', 'dependency', 'c', 'c')
  const signals = unstyled('signals', 'dependency', 'c', 'c')
  const tieBreaker = createOntology({
    ...bareSpec([calls, signals]),
    classifyEdge: edge => (edge.dimensions?.[KIND] === 'signal' ? 'signals' : undefined),
  })
  const edge = (dimensions?: Record<string, string>): GraphEdge => ({ id: 'e', sourceId: 's', targetId: 't', ...(dimensions ? { dimensions } : {}) })
  return {
    sameOrientation: refusalOf(() => createOntology(bareSpec([calls, signals]))),
    oppositeOrientation: refusalOf(() => createOntology(bareSpec([unstyled('x', 'dependency', 'a', 'b'), unstyled('y', 'dependency', 'b', 'a')]))),
    // A containment type and a dependency type on one pair are two pairs.
    otherRelation: refusalOf(() => createOntology(bareSpec([unstyled('in', 'containment', 'c', 'c'), calls]))),
    withTieBreaker: refusalOf(() => createOntology({ ...bareSpec([calls, signals]), classifyEdge: () => 'signals' })),
    tieBreakerFirst: tieBreaker.classifyEdge(edge({ [KIND]: 'signal' }), 'c', 'c') ?? null,
    pairWhenItSaysNothing: tieBreaker.classifyEdge(edge(), 'c', 'c') ?? null,
  }
}

/** A stroke left out is the neutral stroke, field by field; a partial one is merged over it. */
function strokes(): Json {
  const ontology = createOntology(bareSpec([
    unstyled('plain', 'dependency', 'a', 'a'),
    { ...unstyled('wide', 'dependency', 'b', 'b'), style: { width: 3 } },
  ]))
  const styleOf = (id: string): EdgeStroke => ontology.edgeTypes.find(e => e.id === id)!.style
  return {
    neutral: strokeRow(NEUTRAL_STROKE),
    omitted: strokeRow(styleOf('plain')),
    omittedEqualsNeutral: JSON.stringify(strokeRow(styleOf('plain'))) === JSON.stringify(strokeRow(NEUTRAL_STROKE)),
    partial: strokeRow(styleOf('wide')),
    partialIsNeutralWithWidth: JSON.stringify(strokeRow(styleOf('wide'))) === JSON.stringify(strokeRow({ ...NEUTRAL_STROKE, width: 3 })),
  }
}

/** An id the taxonomy does not declare strokes neutral, says so once on the console, and never throws. */
function unknownStroke(): Json {
  const ontology = createOntology(bareSpec([unstyled('plain', 'dependency', 'a', 'a')]))
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
  let outcome: Json = {}
  try {
    const first = ontology.edgeStrokeFor('nope')
    ontology.edgeStrokeFor('nope')
    outcome = { threw: false, equalsNeutral: JSON.stringify(strokeRow(first)) === JSON.stringify(strokeRow(NEUTRAL_STROKE)) }
  } catch (e) {
    outcome = { threw: true, message: e instanceof Error ? e.message : String(e) }
  } finally {
    console.warn = warn
  }
  return { ...(outcome as { [k: string]: Json }), warnings }
}

/** No `filterDimensions`: the style axis alone, as an allow-list, labelled by `styleLabel` or else its id. */
function filterAxes(): Json {
  const axes = (ontology: Ontology): Json => ontology.filterDimensions.map(d => ({
    id: d.id,
    label: d.label,
    emptyMeans: d.emptyMeans,
    absentMeans: d.absentMeans,
    focus: d.focus,
    reheat: reheatRow(d),
    initialSelection: [...d.initialSelection(['a', 'b'])],
    chips: d.chipsFor(['a', 'b']).map(c => ({ id: c.id, label: c.label, icon: c.icon ?? null, tint: c.tint ?? null })),
  }))
  return {
    labelled: axes(createOntology({ ...bareSpec([]), styleLabel: 'Kind' })),
    unlabelled: axes(createOntology(bareSpec([]))),
  }
}

/** `keepCamera` states the camera policy outright; left out, an allow-list refits and a narrowing axis keeps the view. */
function cameraPolicy(): Json {
  const axes: DimensionDescriptor[] = [
    { id: 'allowDefault', label: 'A', emptyMeans: 'none' },
    { id: 'allowKeeps', label: 'B', emptyMeans: 'none', keepCamera: true },
    { id: 'narrowDefault', label: 'C', emptyMeans: 'all' },
    { id: 'narrowRefits', label: 'D', emptyMeans: 'all', keepCamera: false },
  ]
  const ontology = createOntology({ ...bareSpec([]), filterDimensions: axes })
  return sortedRecord(axes.map(a => [a.id, reheatRow(ontology.descriptorFor(a.id)!)] as const))
}

/** `tooltipFor` shows in a default chip; an abbreviation left out is the first two characters of the label. */
function names(): Json {
  const ontology = createOntology({
    ...bareSpec([]),
    filterDimensions: [
      { id: 'campus', label: 'Campus', emptyMeans: 'all', labelFor: () => 'North campus' },
      { id: 'file', label: 'File', emptyMeans: 'all', tooltipFor: v => `src/${v}.ts` },
    ],
  })
  const campus = ontology.descriptorFor('campus')!
  const file = ontology.descriptorFor('file')!
  return {
    abbreviationFromLabel: campus.abbreviationFor('anything'),
    abbreviationFromValue: file.abbreviationFor('util'),
    chipWithTooltip: file.chipsFor(['util']).map(c => ({ id: c.id, label: c.label, tooltip: c.tooltip ?? null })),
    chipWithout: campus.chipsFor(['x']).map(c => ({ id: c.id, label: c.label, tooltip: c.tooltip ?? null })),
    tooltipFor: file.tooltipFor?.('util') ?? null,
    noTooltipFor: campus.tooltipFor?.('x') ?? null,
  }
}

/**
 * A scalar answers any finite numbers and the frame divides by the largest; one
 * that declares `normalize: 'none'` is left as it answered, and refused when it
 * strays outside [0, 1]. Rests are on a span of 0 to 100, so a score reads as itself.
 */
function rawScalar(): Json {
  const scalar = (id: string, answer: Record<string, number>, normalize?: ScalarAxis['normalize']): ScalarAxis =>
    ({ id, label: id, tooltip: 'probe', compute: () => new Map(Object.entries(answer)), ...(normalize ? { normalize } : {}) })
  const ontology = createOntology({
    ...bareSpec([]),
    scalars: [
      scalar('raw', { a: 2, b: 4 }),
      scalar('rawNone', { a: 2, b: 4 }, 'none'),
      scalar('unitNone', { a: 0.25, b: 0.5 }, 'none'),
      scalar('zeros', { a: 0, b: 0 }),
    ],
  })
  const graph = graphOf([node('a', 'a'), node('b', 'b')])
  const rests = (id: string) => {
    const params = { ...defaultParamsFor(ontology), bandY: { scalar: id, span: { zero: 0, one: 100 } } }
    const frame = layoutFrame(readableGraph(graph), resolvePhysics(params, ontology))
    return sortedRecord([...graph.nodes.values()].map(n => [n.id, frame.rest('y', n).lo] as const))
  }
  return {
    builtIns: sortedRecord(BUILT_IN_SCALARS.map(s => [s.id, s.normalize ?? 'max'] as const)),
    normalized: sortedRecord([...normalized(new Map([['a', 2], ['b', 4]]))].map(([id, v]) => [id, v] as const)),
    restsOfRaw: rests('raw'),
    restsOfNoneInUnit: rests('unitNone'),
    noneRefusesRaw: refusalOf(() => rests('rawNone')),
    allZero: rests('zeros'),
  }
}

/** A Map keyed by something other than the node's own id is a warning: the view reads the node by its id. */
function keyMismatch(): Json {
  const graph: Graph = { nodes: new Map([['x', node('y', 'a')]]), edges: [] }
  return diagnosticRows(graph, createOntology(bareSpec([])))
}

/** A derived containment edge takes the first free numbered variant of `in:<id>` when a host edge has the plain one. */
function derivedIds(): Json {
  const nodes = [node('p', 'a'), node('x', 'b', undefined, 'p'), node('q', 'b')]
  const own = dependency('in:x', 'x', 'q')
  const second = dependency('in:x#2', 'q', 'x')
  return {
    oneTaken: withContainmentEdges(graphOf(nodes, [own])).edges.map(edgeLine),
    twoTaken: withContainmentEdges(graphOf(nodes, [own, second])).edges.map(edgeLine),
  }
}

function pass2(): Json {
  return {
    classification: classification(),
    sharedPair: sharedPair(),
    strokes: strokes(),
    unknownStroke: unknownStroke(),
    filterAxes: filterAxes(),
    cameraPolicy: cameraPolicy(),
    names: names(),
    rawScalar: rawScalar(),
    keyMismatch: keyMismatch(),
    derivedIds: derivedIds(),
  }
}

export function defaultsProbes(): Json {
  return {
    minimal: minimal(),
    typicalSpring: typicalSpring(),
    defaultFilter: defaultFilterRow(),
    containment: containment(),
    stackBand: stackBands(),
    pass2: pass2(),
  }
}
