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
//     might get wrong;
//   - `pass2b`: the filter functions a host's second view shares with the pane —
//     where a search's matches land under a filter, what a switch or a focus
//     does to a filter, who answers to a focus, what the nodes say per axis.

import { countsOn, initialFilter, hiddenMatchesOf, matchesFocus, passesSelection, reconcileFilter } from '@temporal-architect/graph-view'
import type { AxisId, FilterState, FocusTarget, AxisLocks, ViewTransition } from '@temporal-architect/graph-view'
import { createTaxonomy } from '@temporal-architect/graph-view/graph/taxonomy'
import type { Taxonomy, TaxonomySpec } from '@temporal-architect/graph-view/graph/taxonomy'
import { reheatOf } from '@temporal-architect/graph-view/graph/axis'
import type { AxisDescriptor, Relation, ResolvedAxisDescriptor } from '@temporal-architect/graph-view/graph/axis'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import { readableGraph, withContainmentEdges } from '@temporal-architect/graph-view/graph/model'
import type { EdgeStroke, ThemedColor } from '@temporal-architect/graph-view/graph/scheme'
import { NEUTRAL_STROKE, stackBand } from '@temporal-architect/graph-view/graph/shapes'
import type { EdgeType, NodeStyle, ResolvedNodeStyle } from '@temporal-architect/graph-view/graph/shapes'
import { BUILT_IN_SCALARS, normalized } from '@temporal-architect/graph-view/graph/scalar'
import type { ScalarAxis } from '@temporal-architect/graph-view/graph/scalar'
import { defaultParamsFor } from '@temporal-architect/graph-view/graph/simulation'
import { layoutFrame, resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import { validateGraph } from '@temporal-architect/graph-view/graph/validate'
import { linkedSwitch } from '@temporal-architect/graph-view/filter/linked'
import type { LinkedViewState } from '@temporal-architect/graph-view/filter/linked'
import { selectionFor } from '@temporal-architect/graph-view/filter/types'
import { activeGroupsOf } from '@temporal-architect/graph-view/graph/groups'
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
function bareSpec(edgeTypes: readonly EdgeType[]): TaxonomySpec {
  return { styleAxis: KIND, styles: VALUES, edgeTypes }
}

/** The same, with the two filter axes the earlier rows read: an allow-list on the style axis, a narrowing zone. */
function specOf(edgeTypes: readonly EdgeType[]): TaxonomySpec {
  return {
    ...bareSpec(edgeTypes),
    filterAxes: [
      { id: KIND, label: 'Kind', emptyMeans: 'none' },
      { id: ZONE, label: 'Zone', emptyMeans: 'all' },
    ],
  }
}

/** An edge type that declares no spring and no tooltip. */
const bare = (id: string, relation: EdgeType['relation'], sourceValue: string, targetValue: string): EdgeType =>
  ({ id, label: id, sourceValue, targetValue, relation, style: STROKE })

/** An edge type that declares nothing but what it runs between: no spring, no tooltip, no stroke. */
const unstyled = (id: string, relation: EdgeType['relation'], sourceValue: string, targetValue: string): EdgeType =>
  ({ id, label: id, sourceValue, targetValue, relation })

const MINIMAL = createTaxonomy(specOf([bare('in', 'containment', 'b', 'a'), bare('calls', 'dependency', 'c', 'c')]))

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
    descriptors: sortedRecord(MINIMAL.filterAxes.map(d => [d.id, {
      absentMeans: d.absentMeans,
      focus: d.focus,
      reheat: reheatRow(d),
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
  const taxonomy = createTaxonomy(specOf([
    { ...bare('first', 'dependency', 'a', 'a'), physics: { strength: 0.4, distance: 100 } },
    { ...bare('second', 'dependency', 'b', 'b'), physics: { strength: 0.8, distance: 300 } },
    bare('third', 'dependency', 'c', 'c'),
  ]))
  const third = taxonomy.edgeTypes.find(e => e.id === 'third')!
  return { strength: third.physics.strength, distance: third.physics.distance }
}

const node = (id: string, kind: string, zone?: string, parentId?: string): GraphNode =>
  ({ id, name: id, values: zone === undefined ? { [KIND]: kind } : { [KIND]: kind, [ZONE]: zone }, ...(parentId !== undefined ? { parentId } : {}) })
const contains = (id: string, child: string, parent: string): GraphEdge =>
  ({ id, sourceId: child, targetId: parent, relation: 'containment' })
const graphOf = (nodes: GraphNode[], edges: GraphEdge[] = []): Graph => ({ nodes, edges })

/** An allow-list opens with every value the graph presents; a narrowing axis, with none. */
function initialFilterRow(): Json {
  const graph = graphOf([node('n1', 'a', 'east'), node('n2', 'b', 'east'), node('n3', 'c', 'west'), node('n4', 'c')])
  return sortedRecord([...initialFilter(MINIMAL, graph)].map(([axis, selection]) => [axis, sorted(selection)] as const))
}

/** The containment edge `parentId` implies, and what validation makes of a host's own. */
function containment(): Json {
  const graph = graphOf(
    [node('p', 'a'), node('x', 'b', undefined, 'p'), node('y', 'b', undefined, 'p'), node('z', 'b', undefined, 'missing')],
    [contains('own:y', 'y', 'p')],
  )
  const derived = withContainmentEdges(graph)
  const codes = (g: Graph, taxonomy = MINIMAL) => validateGraph(g, taxonomy).map(d => d.code).sort()
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
        createTaxonomy({ ...specOf([bare('in', 'containment', 'b', 'a'), bare('calls', 'dependency', 'c', 'c')]), classifyEdge: () => 'calls' }),
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

const diagnosticRows = (graph: Graph, taxonomy: Taxonomy): Json =>
  validateGraph(graph, taxonomy).map(d => ({ severity: d.severity, code: d.code, subject: d.edgeId ?? d.nodeId ?? null, message: d.message }))

const reheatRow = (d: ResolvedAxisDescriptor): Json => {
  const policy = reheatOf(d)
  return { alpha: policy.alpha, seedRevealed: policy.seedRevealed, refit: policy.refit, resume: policy.resume }
}

/**
 * No `classifyEdge` at all: an edge is the declared type whose relation and
 * endpoint values match its own, in either orientation. An edge between values
 * no type covers has no type — a warning, not an error, and it draws neutral.
 */
function classification(): Json {
  const taxonomy = createTaxonomy(bareSpec([
    unstyled('in', 'containment', 'b', 'a'),
    unstyled('links', 'dependency', 'a', 'b'),
    unstyled('calls', 'dependency', 'c', 'c'),
  ]))
  const classify = (relation: Relation | undefined, src: string | undefined, tgt: string | undefined) =>
    taxonomy.classifyEdge({ id: 'e', sourceId: 's', targetId: 't', ...(relation ? { relation } : {}) }, src, tgt) ?? null
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
    validation: diagnosticRows(graph, taxonomy),
  }
}

/**
 * Two declared types on one relation and one pair cannot be told apart by the
 * pair, so construction refuses them unless the pair's two types differ in
 * orientation or in `match`, or the host gives `classifyEdge`; and the host's
 * answer is consulted first, the declared pair deciding when it says nothing.
 */
function sharedPair(): Json {
  const calls = unstyled('calls', 'dependency', 'c', 'c')
  const signals = unstyled('signals', 'dependency', 'c', 'c')
  const tieBreaker = createTaxonomy({
    ...bareSpec([calls, signals]),
    classifyEdge: edge => (edge.values?.[KIND] === 'signal' ? 'signals' : undefined),
  })
  const edge = (values?: Record<string, string>): GraphEdge => ({ id: 'e', sourceId: 's', targetId: 't', ...(values ? { values } : {}) })
  return {
    sameOrientation: refusalOf(() => createTaxonomy(bareSpec([calls, signals]))),
    oppositeOrientation: refusalOf(() => createTaxonomy(bareSpec([unstyled('x', 'dependency', 'a', 'b'), unstyled('y', 'dependency', 'b', 'a')]))),
    // A containment type and a dependency type on one pair are two pairs.
    otherRelation: refusalOf(() => createTaxonomy(bareSpec([unstyled('in', 'containment', 'c', 'c'), calls]))),
    withTieBreaker: refusalOf(() => createTaxonomy({ ...bareSpec([calls, signals]), classifyEdge: () => 'signals' })),
    tieBreakerFirst: tieBreaker.classifyEdge(edge({ [KIND]: 'signal' }), 'c', 'c') ?? null,
    pairWhenItSaysNothing: tieBreaker.classifyEdge(edge(), 'c', 'c') ?? null,
  }
}

/** A stroke left out is the neutral stroke, field by field; a partial one is merged over it. */
function strokes(): Json {
  const taxonomy = createTaxonomy(bareSpec([
    unstyled('plain', 'dependency', 'a', 'a'),
    { ...unstyled('wide', 'dependency', 'b', 'b'), style: { width: 3 } },
  ]))
  const styleOf = (id: string): EdgeStroke => taxonomy.edgeTypes.find(e => e.id === id)!.style
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
  const taxonomy = createTaxonomy(bareSpec([unstyled('plain', 'dependency', 'a', 'a')]))
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
  let outcome: Json = {}
  try {
    const first = taxonomy.edgeStrokeFor('nope')
    taxonomy.edgeStrokeFor('nope')
    outcome = { threw: false, equalsNeutral: JSON.stringify(strokeRow(first)) === JSON.stringify(strokeRow(NEUTRAL_STROKE)) }
  } catch (e) {
    outcome = { threw: true, message: e instanceof Error ? e.message : String(e) }
  } finally {
    console.warn = warn
  }
  return { ...(outcome as { [k: string]: Json }), warnings }
}

/** No `filterAxes`: the style axis alone, as an allow-list, labelled by `styleLabel` or else its id. */
function filterAxes(): Json {
  const axes = (taxonomy: Taxonomy): Json => taxonomy.filterAxes.map(d => ({
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
    labelled: axes(createTaxonomy({ ...bareSpec([]), styleLabel: 'Kind' })),
    unlabelled: axes(createTaxonomy(bareSpec([]))),
  }
}

/** `keepCamera` states the camera policy outright; left out, an allow-list refits and a narrowing axis keeps the view. */
function cameraPolicy(): Json {
  const axes: AxisDescriptor[] = [
    { id: 'allowDefault', label: 'A', emptyMeans: 'none' },
    { id: 'allowKeeps', label: 'B', emptyMeans: 'none', keepCamera: true },
    { id: 'narrowDefault', label: 'C', emptyMeans: 'all' },
    { id: 'narrowRefits', label: 'D', emptyMeans: 'all', keepCamera: false },
  ]
  const taxonomy = createTaxonomy({ ...bareSpec([]), filterAxes: axes })
  return sortedRecord(axes.map(a => [a.id, reheatRow(taxonomy.axisFor(a.id)!)] as const))
}

/** `tooltipFor` shows in a default chip; an abbreviation left out is the first two characters of the label. */
function names(): Json {
  const taxonomy = createTaxonomy({
    ...bareSpec([]),
    filterAxes: [
      { id: 'campus', label: 'Campus', emptyMeans: 'all', labelFor: () => 'North campus' },
      { id: 'file', label: 'File', emptyMeans: 'all', tooltipFor: v => `src/${v}.ts` },
    ],
  })
  const campus = taxonomy.axisFor('campus')!
  const file = taxonomy.axisFor('file')!
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
  const taxonomy = createTaxonomy({
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
    const params = { ...defaultParamsFor(taxonomy), bandY: { scalar: id, span: { zero: 0, one: 100 } } }
    const frame = layoutFrame(readableGraph(graph), resolvePhysics(params, taxonomy))
    return sortedRecord(graph.nodes.map(n => [n.id, frame.rest('y', n).lo] as const))
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

/** Two nodes with one id are an error: the view draws the first and names the second. */
function duplicateNodeId(): Json {
  return diagnosticRows(graphOf([node('x', 'a'), node('x', 'b')]), createTaxonomy(bareSpec([])))
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
    duplicateNodeId: duplicateNodeId(),
    derivedIds: derivedIds(),
  }
}

// ── Pass 2b: the filter functions a host's second view shares ──────────────

const selection = (kind: string[], zone: string[]): FilterState => new Map([[KIND, new Set(kind)], [ZONE, new Set(zone)]])
const pinned = (kind: boolean, zone: boolean): AxisLocks => new Map([[KIND, kind], [ZONE, zone]])
const nested = (m: ReadonlyMap<string, ReadonlyMap<string, number>>): Json =>
  sortedRecord([...m].map(([axis, tally]) => [axis, sortedRecord([...tally])] as const))
const filterRow = (f: FilterState): Json => ({ kind: sorted(f.get(KIND) ?? []), zone: sorted(f.get(ZONE) ?? []) })

/** The graph the rows below read: three kinds, two zones, a node with no zone, and names to search. */
const POOL: readonly GraphNode[] = [
  node('api-1', 'a', 'east'), node('api-2', 'b', 'west'), node('api-3', 'c', 'west'),
  node('db-1', 'a', 'east'), node('db-2', 'c'),
]

/**
 * A search's matches split by the filter: the ones it shows, the ones it hides
 * counted on the first axis of the chain each fails, under its value there.
 * Which node is visible is the caller's (the view's visible set), so a match
 * the filter passes but the caller hides is counted and tallies on no axis.
 */
function hiddenMatches(): Json {
  const axes = MINIMAL.filterAxes.map(d => d.id)
  const kindThenZone = axes
  const zoneThenKind = [...axes].reverse()
  const filter = selection(['a', 'b'], ['east'])
  const shown = (f: FilterState, chain: readonly AxisId[]) => new Set(POOL.filter(n => passesSelection(f, MINIMAL, chain, dim => n.values[dim])).map(n => n.id))
  const split = (f: FilterState, chain: readonly AxisId[], visible: ReadonlySet<string>) => {
    const r = hiddenMatchesOf({ nodes: POOL, filter: f, taxonomy: MINIMAL, axes: chain, visibleIds: visible, matches: n => n.name.includes('api') })
    return { visible: sorted(r.visible), hiddenCount: r.hiddenCount, hiddenByAxis: nested(r.hiddenByAxis) }
  }
  return {
    // api-1 shows; api-2 fails on zone (west); api-3 fails on kind (c) first.
    kindFirst: split(filter, kindThenZone, shown(filter, kindThenZone)),
    // The chain's order decides the chip: api-3 fails on zone (west) first now.
    zoneFirst: split(filter, zoneThenKind, shown(filter, zoneThenKind)),
    // Every axis passes, the caller's visible set is empty: all counted, none tallied.
    hiddenByCaller: split(selection(['a', 'b', 'c'], []), kindThenZone, new Set()),
    noMatch: (() => {
      const r = hiddenMatchesOf({ nodes: POOL, filter, taxonomy: MINIMAL, axes: kindThenZone, visibleIds: shown(filter, kindThenZone), matches: () => false })
      return { visible: sorted(r.visible), hiddenCount: r.hiddenCount, hiddenByAxis: nested(r.hiddenByAxis) }
    })(),
  }
}

/**
 * The one options object. A manual switch keeps a pinned axis and adopts the
 * source's on the others, only over the axes it is handed; a focus widens the
 * destination just enough on each axis the target names, and reports the pinned
 * axes it had to override.
 */
function reconciling(): Json {
  const axes = MINIMAL.filterAxes.map(d => d.id)
  const row = (destination: FilterState, source: FilterState, locks: AxisLocks, transition: ViewTransition, over = axes): Json => {
    const r = reconcileFilter({ destination, source, locks, transition, taxonomy: MINIMAL, axes: over })
    return {
      ...(filterRow(r.filter) as { [k: string]: Json }),
      overriddenLocks: sorted(r.overriddenLocks),
      returnedDestination: r.filter === destination,
      keptKindSet: r.filter.get(KIND) === destination.get(KIND),
      keptZoneSet: r.filter.get(ZONE) === destination.get(ZONE),
    }
  }
  const dest = selection(['a'], ['east'])
  const source = selection(['b', 'c'], ['west'])
  const focus = (values: FocusTarget['values']) => ({ kind: 'focus', target: { values } }) as const
  return {
    manual: {
      // Kind pinned: kept as it was; zone not: adopted.
      pinnedKept_unpinnedAdopted: row(dest, source, pinned(true, false), { kind: 'manual' }),
      nonePinned: row(dest, source, pinned(false, false), { kind: 'manual' }),
      allPinned: row(dest, source, pinned(true, true), { kind: 'manual' }),
      // An axis the destination does not show is not adopted, pinned or not.
      overOneAxis: row(dest, source, pinned(false, false), { kind: 'manual' }, axes.filter(a => a === KIND)),
    },
    focus: {
      // Kind widens always; zone widens only when a selection is already active (here, it is not).
      widensAllowList_zoneEmptyUntouched: row(selection(['a'], []), source, pinned(false, false), focus({ [KIND]: 'b', [ZONE]: 'west' })),
      widensActiveZone: row(selection(['a'], ['east']), source, pinned(false, false), focus({ [KIND]: 'a', [ZONE]: 'west' })),
      // A pinned axis is overridden, and reported.
      overridesPinnedKind: row(selection(['a'], []), source, pinned(true, false), focus({ [KIND]: 'b' })),
      overridesPinnedZone: row(selection(['a'], ['east']), source, pinned(false, true), focus({ [ZONE]: 'west' })),
      overridesBoth: row(selection(['a'], ['east']), source, pinned(true, true), focus({ [KIND]: 'b', [ZONE]: 'west' })),
      // Already shown: the destination itself comes back.
      alreadyShown: row(selection(['a'], ['east']), source, pinned(true, true), focus({ [KIND]: 'a', [ZONE]: 'east' })),
      // An axis the target says nothing about, or says undefined about, is left alone.
      silentAxisUntouched: row(selection(['a'], ['east']), source, pinned(false, false), focus({ [KIND]: 'b', [ZONE]: undefined })),
      // An axis the destination does not show is not widened.
      overOneAxis: row(selection(['a'], ['east']), source, pinned(false, false), focus({ [KIND]: 'b', [ZONE]: 'west' }), axes.filter(a => a === KIND)),
    },
  }
}

/** Who answers to a focus: every value it names, on the node's own axes; a name it may carry is not read. */
function focusMatching(): Json {
  const node = { values: { [KIND]: 'a', [ZONE]: 'east' } }
  const withName: FocusTarget & { name: string } = { name: 'something else', values: { [KIND]: 'a' } }
  return {
    empty: matchesFocus(node, { values: {} }),
    oneValue: matchesFocus(node, { values: { [KIND]: 'a' } }),
    everyValue: matchesFocus(node, { values: { [KIND]: 'a', [ZONE]: 'east' } }),
    oneOfTwoWrong: matchesFocus(node, { values: { [KIND]: 'a', [ZONE]: 'west' } }),
    undefinedIgnored: matchesFocus(node, { values: { [KIND]: 'a', [ZONE]: undefined } }),
    axisTheNodeLacks: matchesFocus(node, { values: { other: 'x' } }),
    nameNotRead: matchesFocus(node, withName),
  }
}

/** What the nodes say per axis: each axis asked for, a node counted on the value it carries, one with none on no value. */
function counting(): Json {
  return {
    twoAxes: nested(countsOn(POOL, [KIND, ZONE])),
    oneAxis: nested(countsOn(POOL, [ZONE])),
    // An axis no node carries is asked for and comes back empty.
    noNodeCarries: nested(countsOn(POOL, [KIND, 'campus'])),
    noNodes: nested(countsOn([], [KIND, ZONE])),
  }
}

function pass2b(): Json {
  return { hiddenMatches: hiddenMatches(), reconciling: reconciling(), focusMatching: focusMatching(), counting: counting() }
}

/** Copies of one entity count once on a chip; a node without a key is its own entity. */
function countsByCopy(): Json {
  const counts = countsOn([
    { id: 'x1', copyKey: 'x', values: { kind: 'course', dept: 'a' } },
    { id: 'x2', copyKey: 'x', values: { kind: 'course', dept: 'b' } },
    { id: 'y', values: { kind: 'course', dept: 'a' } },
  ], ['kind', 'dept'])
  return { kind: sortedRecord([...counts.get('kind')!]), dept: sortedRecord([...counts.get('dept')!]) }
}

const PROBE_COLOUR = { light: { fill: '#111111', border: '#222222' }, dark: { fill: '#333333', border: '#444444' } }

/**
 * The linked-views reducer: a manual switch adopts the source's selections on
 * the destination's shown axes except where locked; a focus widens the
 * destination and records the locks it overrode; a switch that changes
 * nothing returns the same state object; an axis the destination does not
 * show is left alone.
 */
function linkedViews(): Json {
  const taxonomy = createTaxonomy({
    styleAxis: 'kind',
    styles: [{ id: 'a', label: 'A', color: PROBE_COLOUR }, { id: 'b', label: 'B', color: PROBE_COLOUR }],
    edgeTypes: [],
    filterAxes: [{ id: 'kind', label: 'Kind', emptyMeans: 'none' }, { id: 'file', label: 'File', emptyMeans: 'all' }],
  })
  type Views = 'list' | 'graph'
  const state: Readonly<Record<Views, LinkedViewState>> = {
    list: { filter: new Map([['kind', new Set(['a'])], ['file', new Set(['f1'])]]), locks: new Map([['file', true]]), axes: ['kind', 'file'], overriddenLocks: new Set<string>() },
    graph: { filter: new Map([['kind', new Set(['a', 'b'])], ['file', new Set(['f2'])]]), locks: new Map<string, boolean>(), axes: ['kind'], overriddenLocks: new Set<string>() },
  }
  const sel = (s: Readonly<Record<Views, LinkedViewState>>, view: Views, axis: string) => sorted(selectionFor(s[view].filter, axis))
  const manual = linkedSwitch(state, taxonomy, 'list', 'graph', { kind: 'manual' })
  const focus = linkedSwitch(state, taxonomy, 'list', 'graph', { kind: 'focus', target: { values: { kind: 'b', file: 'f2' } } })
  const again = linkedSwitch(manual.state, taxonomy, 'list', 'graph', { kind: 'manual' })
  const intoGraph = linkedSwitch(state, taxonomy, 'graph', 'list', { kind: 'manual' })
  // Two empty overridden sets of different identity are no change.
  const fresh: Readonly<Record<Views, LinkedViewState>> = { ...manual.state, list: { ...manual.state.list, overriddenLocks: new Set<string>() } }
  const freshAgain = linkedSwitch(fresh, taxonomy, 'list', 'graph', { kind: 'manual' })
  return {
    emptySetsAreUnchanged: freshAgain.state === fresh,
    manual: { kind: sel(manual.state, 'list', 'kind'), fileKeptByLock: sel(manual.state, 'list', 'file'), sourceUntouched: manual.state.graph === state.graph },
    focus: { kind: sel(focus.state, 'list', 'kind'), file: sel(focus.state, 'list', 'file'), overrode: sorted(focus.state.list.overriddenLocks), reported: sorted(focus.result.overriddenLocks) },
    unshownAxisLeftAlone: sel(intoGraph.state, 'graph', 'file'),
    unchangedIsSameObject: again.state === manual.state,
  }
}

/** A chip half-selected at seeding is snapped whole, with one warning; a selection along chip lines is kept as given. */
function splitChipSnap(): Json {
  const chips = (values: readonly string[]) => [
    { id: 'org', label: 'Org', values: ['faculty', 'department'] },
    { id: 'course', label: 'Course', values: ['course'] },
  ].filter(c => c.values.some(v => values.includes(v)))
  const build = (initial: readonly string[]) => createTaxonomy({
    styleAxis: 'entity',
    styles: ['faculty', 'department', 'course'].map(id => ({ id, label: id, color: PROBE_COLOUR })),
    edgeTypes: [],
    filterAxes: [{ id: 'entity', label: 'Show', emptyMeans: 'none', chipsFor: chips, initialSelection: () => initial }],
  })
  const nodes = ['faculty', 'department', 'course'].map(v => ({ id: v, name: v, values: { entity: v } }))
  const warned: string[] = []
  const original = console.warn
  console.warn = (msg: unknown) => { warned.push(String(msg)) }
  try {
    const split = build(['department', 'course'])
    const first = sorted(selectionFor(initialFilter(split, { nodes }), 'entity'))
    initialFilter(split, { nodes })
    // Once per taxonomy and chip: the second seeding of the same taxonomy says nothing more.
    const warnedOnce = warned.filter(w => w.includes('splits the chip')).length
    const partial = nodes.filter(n => n.id !== 'faculty')
    return {
      split: first,
      warnedOnce,
      // A chip chosen through a value the graph lacks reads as on to the bar, so its present values are added too.
      absentValue: sorted(selectionFor(initialFilter(build(['faculty']), { nodes: partial }), 'entity')),
      whole: sorted(selectionFor(initialFilter(build(['faculty', 'department']), { nodes }), 'entity')),
    }
  } finally { console.warn = original }
}

/** The group the view's control emphasises glows stronger; one the host marks `emphasized` still does. */
function groupEmphasis(): Json {
  const groups = [{ id: 'g', nodeIds: new Set(['a']) }, { id: 'h', nodeIds: new Set(['a']), emphasized: true }]
  const plain = activeGroupsOf(groups, new Set(['a']), 'light')
  const emphasised = activeGroupsOf(groups, new Set(['a']), 'light', 'g')
  return { plain: plain.map(g => [g.id, g.strength]), emphasised: emphasised.map(g => [g.id, g.strength]) }
}

export function defaultsProbes(): Json {
  return {
    minimal: minimal(),
    countsByCopy: countsByCopy(),
    linkedViews: linkedViews(),
    splitChipSnap: splitChipSnap(),
    groupEmphasis: groupEmphasis(),
    typicalSpring: typicalSpring(),
    defaultFilter: initialFilterRow(),
    containment: containment(),
    stackBand: stackBands(),
    pass2: pass2(),
    pass2b: pass2b(),
  }
}
