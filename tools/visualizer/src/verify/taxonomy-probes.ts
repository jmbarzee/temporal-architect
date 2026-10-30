// Probes for the taxonomy seam itself.
//
// Two things here, and neither had a check before:
//
//   1. **Fallback resolution.** The whole justification for making a taxonomy's
//      fallback style *required* is that a lookup miss must not throw inside the
//      draw loop. Nothing verified what a miss actually returns, so the fallback
//      could have been corrupted — or quietly stopped being reached — with every
//      gate green.
//   2. **That the seam is a seam.** A container that everything resolves through
//      is only worth having if supplying a different one actually changes the
//      answer. So this drives `computeVisibleGraph` with a deliberately
//      different taxonomy and goldens the result. If a consumer starts reaching
//      past the container again, the two rows below stop disagreeing and this
//      probe goes red.

import { DEF_TYPE_DIMENSION } from '../adapter/dimensions'
import { filterOfSets } from './filter-states'
import { computeVisibleGraph } from '@temporal-architect/graph-view/components/graph-view/visibleGraph'
import type { GraphEdge } from '@temporal-architect/graph-view/graph/model'
import { payloadString, relationOf } from '@temporal-architect/graph-view/graph/model'
import type { NodeType, TemporalNodeStyle } from '../adapter/node-types'
import type { NodeStyle } from '@temporal-architect/graph-view/graph/shapes'
import { ALL_NODE_TYPES, DEFAULT_TAXONOMY, NODE_TYPE_REGISTRY, DEFAULT_TAXONOMY_SPEC } from '../adapter/node-types'
import { createTaxonomy } from '@temporal-architect/graph-view/graph/taxonomy'
import { rgbOf } from '@temporal-architect/graph-view/graph/scheme'
import {
  createAxisMapping,
  identityMapping,
  internValue,
} from '@temporal-architect/graph-view/graph/axis'
import type { AxisNamer } from '@temporal-architect/graph-view/graph/axis'
import type { SimNode } from '@temporal-architect/graph-view/graph/simulation'
import { defaultParamsFor } from '@temporal-architect/graph-view/graph/simulation'
import { foldReheatPolicy, reheatOf } from '@temporal-architect/graph-view/graph/axis'
import { bandFor, chargeFor, coreRadiusFor, mappedAxis, resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import { dimensionsFor } from '../adapter/build'
import { TEMPORAL_TYPE_DIMENSION } from '../adapter/node-types'
import type { Json } from './snapshot'
import { sorted } from './snapshot'

const UNDECLARED = 'notADeclaredKey' as NodeType

/** The alternate taxonomy's kind projection — its adapter would write these. */
const ALT_DEF_TYPE: Record<string, string> = { worker: 'tier-2', workflow: 'tier-3', activity: 'tier-4' }

function node(id: string, nodeType: NodeType, parentId?: string, defType?: string): SimNode {
  return {
    id,
    // The adapter's projection, with the kind overridable for the alternate
    // taxonomy's nodes (its adapter would project differently).
    values: defType === undefined ? dimensionsFor(nodeType, undefined) : { ...dimensionsFor(nodeType, undefined), [DEF_TYPE_DIMENSION]: defType },
    name: id, ring: parentId === undefined ? 'dashed' : undefined,
    copyKey: `${nodeType}:${id}`,
    ...(parentId !== undefined ? { parentId } : {}),
    x: 0, y: 0, vx: 0, vy: 0, pinned: false,
  }
}

const NODES: SimNode[] = [
  node('wk', 'worker'),
  node('wf', 'workflow', 'wk'),
  node('act', 'activity', 'wk'),
]
// The same three nodes as the alternate taxonomy's adapter would build them:
// the kind axis is materialized by whoever builds the node (D50), so a
// different projection is a different graph, not a different read.
const ALT_NODES: SimNode[] = NODES.map(n => {
  const t = n.values[TEMPORAL_TYPE_DIMENSION] as NodeType
  return node(n.id, t, n.parentId, ALT_DEF_TYPE[t])
})
const EDGES: GraphEdge[] = [
  { id: 'c0', sourceId: 'wf', targetId: 'wk', relation: 'containment' },
  { id: 'd0', sourceId: 'wf', targetId: 'act', relation: 'dependency' },
]
const sourceOf = (nodes: SimNode[]) => {
  const byId = new Map(nodes.map(n => [n.id, n]))
  return { nodes, edges: EDGES, getNode: (id: string) => byId.get(id) }
}
const SOURCE = sourceOf(NODES)
const ALT_SOURCE = sourceOf(ALT_NODES)

/**
 * A taxonomy that answers differently from the shipped one: the same keys,
 * restyled, with a different summary rule on the worker. Nothing about it is
 * domain-specific — that is the point. If the graph engine is genuinely driven
 * by its container, the worker's summary comes out as a degree under this one
 * and a container count under the shipped one, on the same nodes.
 */
const ALT_VALUES: string[] = ['worker', 'workflow', 'activity']
const alternate = (id: NodeType, overrides: Partial<TemporalNodeStyle>): NodeStyle => ({ id, ...NODE_TYPE_REGISTRY[id], ...overrides })
const ALTERNATE = createTaxonomy({
  styleAxis: TEMPORAL_TYPE_DIMENSION,
  styleLabel: 'Tier',
  styles: [
    alternate('worker', { abbreviation: 'T2', defType: ALT_DEF_TYPE.worker, summaryKind: 'degree' }),
    alternate('workflow', { abbreviation: 'T3', defType: ALT_DEF_TYPE.workflow }),
    alternate('activity', { abbreviation: 'T4', defType: ALT_DEF_TYPE.activity }),
  ],
  filterAxes: DEFAULT_TAXONOMY.filterAxes,
  // Only the shipped edge types that run between values this taxonomy declares:
  // an edge type to a value nobody declared is refused at construction.
  edgeTypes: DEFAULT_TAXONOMY.edgeTypes.filter(e => ALT_VALUES.includes(e.sourceValue) && ALT_VALUES.includes(e.targetValue)),
  classifyEdge: DEFAULT_TAXONOMY.classifyEdge,
  scalars: [],
  fallbackStyle: NODE_TYPE_REGISTRY.activity,
})

function visible(taxonomy: typeof DEFAULT_TAXONOMY, source: typeof SOURCE, types: string[]): Json {
  const vg = computeVisibleGraph(source, filterOfSets(new Set(types), new Set<string>()), taxonomy)
  return {
    visibleNodeIds: sorted(vg.visibleIds),
    summaries: sorted([...vg.nodeSummaries].map(([id, s]) => `${id}=${s}`)),
    graduatedEdges: sorted(vg.visibleEdges.map(e => `${e.sourceId} -> ${e.targetId}|${relationOf(e)}`)),
    // The hover box's context line per visible node — the taxonomy's hook, or
    // its default, the parent's name (D59).
    contextLines: sorted(vg.visibleNodes.map(n => `${n.id}=${taxonomy.contextLine(n, n.parentId ? source.getNode(n.parentId) : undefined) ?? ''}`)),
  }
}

// A chain for the hidden-node policy (D59, B16): act2 → wf → act, with wf
// hidden and both activities visible. `ascend` re-points wf's two edges to its
// worker (act2 → wk, wk → act); `splice` follows wf's own dependency edges
// through, so the chain survives as the one edge act2 → act.
const CHAIN_NODES: SimNode[] = [
  node('wk', 'worker'),
  node('wf', 'workflow', 'wk'),
  node('act', 'activity', 'wk'),
  node('act2', 'activity', 'wk'),
]
const CHAIN_EDGES: GraphEdge[] = [
  { id: 'c0', sourceId: 'wf', targetId: 'wk', relation: 'containment' },
  { id: 'c1', sourceId: 'act', targetId: 'wk', relation: 'containment' },
  { id: 'c2', sourceId: 'act2', targetId: 'wk', relation: 'containment' },
  { id: 'd0', sourceId: 'wf', targetId: 'act', relation: 'dependency' },
  { id: 'd1', sourceId: 'act2', targetId: 'wf', relation: 'dependency' },
]
const CHAIN = (() => { const byId = new Map(CHAIN_NODES.map(n => [n.id, n])); return { nodes: CHAIN_NODES, edges: CHAIN_EDGES, getNode: (id: string) => byId.get(id) } })()
const SPLICING = createTaxonomy({
  ...DEFAULT_TAXONOMY_SPEC,
  styles: ALL_NODE_TYPES.map(t => ({ id: t, ...NODE_TYPE_REGISTRY[t], ...(t === 'workflow' ? { whenHidden: 'splice' as const } : {}) })),
})
function hiddenPolicy(taxonomy: typeof DEFAULT_TAXONOMY): Json {
  const vg = computeVisibleGraph(CHAIN, filterOfSets(new Set(['workerDef', 'activityDef']), new Set<string>()), taxonomy)
  return sorted(vg.visibleEdges.map(e => `${e.sourceId} -> ${e.targetId}|${relationOf(e)}`))
}

// Two graduated edges landing on one pair (D60): a call edge carrying
// metadata, spliced through a hidden operation to its backing, and the
// operation's own metadata-less edge to the same backing, spliced on its
// source side to the same caller. The one carrying metadata keeps precedence
// whichever the parser emits first — the rule the fixtures pinned, said
// without a payload key.
const edgeLine = (e: GraphEdge) => `${e.sourceId} -> ${e.targetId}|${relationOf(e)}${e.payload ? '|meta=' + Object.keys(e.payload).sort().join(',') : ''}`
function collision(callFirst: boolean): Json {
  const nodes: SimNode[] = [
    node('wk', 'worker'),
    node('caller', 'workflow', 'wk'),
    node('svc', 'nexusService', 'wk'),
    node('op', 'nexusOperation', 'svc'),
    node('backing', 'workflow', 'wk'),
  ]
  const call: GraphEdge = { id: 'call', sourceId: 'caller', targetId: 'op', relation: 'dependency', payload: { route: 'ep' } }
  const backs: GraphEdge[] = [{ id: 'backs', sourceId: 'op', targetId: 'backing', relation: 'dependency' }]
  const contain: GraphEdge[] = [
    { id: 'c1', sourceId: 'caller', targetId: 'wk', relation: 'containment' },
    { id: 'c2', sourceId: 'svc', targetId: 'wk', relation: 'containment' },
    { id: 'c3', sourceId: 'op', targetId: 'svc', relation: 'containment' },
    { id: 'c4', sourceId: 'backing', targetId: 'wk', relation: 'containment' },
  ]
  const edges = callFirst ? [...contain, call, ...backs] : [...contain, ...backs, call]
  const byId = new Map(nodes.map(n => [n.id, n]))
  const vg = computeVisibleGraph({ nodes, edges, getNode: (id: string) => byId.get(id) }, filterOfSets(new Set(['workerDef', 'workflowDef', 'nexusServiceDef']), new Set<string>()), DEFAULT_TAXONOMY)
  return sorted(vg.visibleEdges.filter(e => relationOf(e) === 'dependency').map(edgeLine))
}

// Two hidden spliced nodes that call each other, and a visible caller into the
// cycle: the resolution passes each hidden node once and ends.
function cycle(): Json {
  const nodes: SimNode[] = [
    node('wk', 'worker'),
    node('caller', 'workflow', 'wk'),
    node('svc', 'nexusService', 'wk'),
    node('ping', 'nexusOperation', 'svc'),
    node('pong', 'nexusOperation', 'svc'),
  ]
  const edges: GraphEdge[] = [
    { id: 'c1', sourceId: 'caller', targetId: 'wk', relation: 'containment' },
    { id: 'c2', sourceId: 'svc', targetId: 'wk', relation: 'containment' },
    { id: 'c3', sourceId: 'ping', targetId: 'svc', relation: 'containment' },
    { id: 'c4', sourceId: 'pong', targetId: 'svc', relation: 'containment' },
    { id: 'd0', sourceId: 'caller', targetId: 'ping', relation: 'dependency' },
    { id: 'd1', sourceId: 'ping', targetId: 'pong', relation: 'dependency' },
    { id: 'd2', sourceId: 'pong', targetId: 'ping', relation: 'dependency' },
  ]
  const byId = new Map(nodes.map(n => [n.id, n]))
  const vg = computeVisibleGraph({ nodes, edges, getNode: (id: string) => byId.get(id) }, filterOfSets(new Set(['workerDef', 'workflowDef']), new Set<string>()), DEFAULT_TAXONOMY)
  return sorted(vg.visibleEdges.map(edgeLine))
}

/**
 * The mapping primitive, including the case it refuses to build.
 *
 * "Result sets must be non-intersecting" is only a guarantee if something proves
 * the refusal happens. A value in two buckets has no answer for which token
 * tunes it, and without the throw the answer would silently be "whichever bucket
 * was declared last" — a layout that depends on list order, found months later
 * by someone alphabetising a declaration for readability.
 */
function mappingProbes(): Json {
  const descriptor: AxisNamer = {
    id: 'probe', label: 'Probe',
    labelFor: v => v.toUpperCase(),
    abbreviationFor: v => v.slice(0, 1).toUpperCase(),
  }
  const grouped = createAxisMapping({
    id: 'probe:grouped', label: 'Grouped', axis: 'probe',
    buckets: [
      { id: 'ab', label: 'A+B', abbreviation: 'AB', values: ['a', 'b'] },
      { id: 'cd', label: 'C+D', abbreviation: 'CD', values: ['c', 'd'] },
    ],
  })
  let refusal = 'NOT REFUSED — the guarantee is not enforced'
  try {
    createAxisMapping({
      id: 'probe:overlapping', label: 'Overlapping', axis: 'probe',
      buckets: [
        { id: 'ab', label: 'A+B', abbreviation: 'AB', values: ['a', 'b'] },
        { id: 'bc', label: 'B+C', abbreviation: 'BC', values: ['b', 'c'] },
      ],
    })
  } catch (err) {
    refusal = err instanceof Error ? err.message : String(err)
  }
  return {
    identity: identityMapping(descriptor, ['a', 'b', 'c', 'd']).buckets.map(b => `${b.id}=${b.label}:${b.values.join(',')}`),
    grouped: {
      buckets: grouped.buckets.map(b => `${b.id}:${b.values.join(',')}`),
      // Every value resolves, and a value the mapping omits resolves to nothing
      // rather than to an arbitrary bucket.
      resolved: ['a', 'b', 'c', 'd', 'e'].map(v => `${v} -> ${grouped.bucketFor(v)?.id ?? 'none'}`),
      absentResolves: grouped.bucketFor(undefined) === undefined,
    },
    intersectingBucketsRefused: refusal,
    // Composite selections must fold to a stable string before they are used as
    // a Set key, or they deduplicate by identity and degenerate to one entry per
    // node — no type error, no crash, a silently different layout.
    interning: {
      stringPassesThrough: internValue('a') === 'a',
      compositeIsStable: internValue(['a', 'b']) === internValue(['a', 'b']),
      compositeIsDistinct: internValue(['a', 'b']) !== internValue(['a', 'c']),
      deduplicatesInASet: new Set([internValue(['a', 'b']), internValue(['a', 'b'])]).size,
    },
  }
}


/**
 * Axis values that name `Object.prototype` members.
 *
 * Values are host-supplied strings, so nothing stops one being called
 * `constructor`. A plain `table[key]` read resolves that up the prototype chain
 * and returns the `Object` function — which is not `undefined`, so every
 * `?? ABSENT_VALUE_PHYSICS.x` and `!== undefined` guard downstream accepts it
 * as a declared value. The consequences are not local: the `Object` function
 * enters the force arithmetic as NaN, and because charge couples a pair by the
 * *average* of two charges, one such node takes the whole layout non-finite.
 * `styleOf` meanwhile returns the constructor as though it were a style,
 * and the first read of `.size.r` throws inside the draw loop — the exact
 * failure the required-fallback design exists to prevent.
 *
 * Every row below must show the fallback/absent answer, never an inherited one.
 */
function prototypeNamedValues(): Json {
  const NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']
  const params = defaultParamsFor(DEFAULT_TAXONOMY)
  const resolved = resolvePhysics(params, DEFAULT_TAXONOMY)
  // An ARRAY of rows, each carrying its own name, because the row keys are the
  // very prototype names being probed. As an object this dropped `__proto__`
  // twice: `rows['__proto__'] = …` invokes the setter, and even built with
  // `Object.fromEntries` the snapshot canonicaliser rebuilds the object and
  // loses it again. The probe listed five names and recorded four — silently
  // missing the row most likely to catch the bug it exists for. A list has no
  // key space to collide with.
  const rows: Json[] = []
  for (const name of NAMES) {
    const subject = { values: { [TEMPORAL_TYPE_DIMENSION]: name } }
    const style = DEFAULT_TAXONOMY.nodeStyleOf(subject)
    const node = subject
    const band = bandFor(mappedAxis(resolved.bandY), node)
    rows.push({
      name,
      styleIsFallback: style === DEFAULT_TAXONOMY.nodeStyleOf({ values: {} }),
      styleLabel: style.label,
      charge: chargeFor(resolved.push, node),
      coreRadius: coreRadiusFor(resolved.push, node),
      chargeIsFinite: Number.isFinite(chargeFor(resolved.push, node)),
      band: `${band.min}..${band.max}`,
      // D39 fixed the style lookup and the force lookups and missed this one.
      abbreviation: DEFAULT_TAXONOMY.abbreviationFor(name),
      abbreviationIsString: typeof DEFAULT_TAXONOMY.abbreviationFor(name) === 'string',
    })
  }
  return rows
}


/**
 * The physics half of the container — the half no gate watched.
 *
 * The injection probe below drives `computeVisibleGraph` through two taxonomies
 * and goldens that the answers differ. That covers styling and filtering and
 * nothing else, so the review was able to pin `Simulation` to the first taxonomy
 * it ever saw, and to pin `resolveEdgeType`, with every gate green: the argument
 * "supply a different container and the answer must change" was only ever being
 * made for one consumer.
 *
 * These rows make it for the other two. `defaultParamsFor` must derive its axis
 * and its whole key space from the taxonomy it is handed, and `resolvePhysics`
 * must build the spring table from the supplied taxonomy's edge types and rule
 * rather than captured ones.
 */
function physicsInjection(): Json {
  const fromDefault = defaultParamsFor(DEFAULT_TAXONOMY)
  const fromAlternate = defaultParamsFor(ALTERNATE)
  const worker = { values: { [TEMPORAL_TYPE_DIMENSION]: 'worker' } }

  // A taxonomy on a DIFFERENT axis entirely. Its charge map is keyed by values
  // no node in the shipped domain carries, so a consumer that ignored the
  // supplied container and used the shipped one would score these nodes; one
  // that honours it finds nothing and returns the absent-value physics.
  const OTHER_AXIS = createTaxonomy({
    styleAxis: 'zone',
    styleLabel: 'Zone',
    styles: [
      { id: 'north', ...NODE_TYPE_REGISTRY.worker, abbreviation: 'N' },
      { id: 'south', ...NODE_TYPE_REGISTRY.activity, abbreviation: 'S' },
    ],
    filterAxes: DEFAULT_TAXONOMY.filterAxes,
    // Its own edge table and rule, so the spring rows below can only come out
    // right by reading the container.
    edgeTypes: [{
      id: 'zoneLink', label: 'N↔S', sourceValue: 'north', targetValue: 'south',
      relation: 'dependency',
      physics: { strength: 0.7, distance: 123 }, tooltip: 'zone link',
      style: { color: { light: '#000000', dark: '#FFFFFF' }, alpha: 1, dash: [], width: 1 },
    }],
    classifyEdge: () => 'zoneLink',
    scalars: [],
    fallbackStyle: NODE_TYPE_REGISTRY.activity,
  })
  const zoned = defaultParamsFor(OTHER_AXIS)
  const northNode = { values: { zone: 'north' } }

  return {
    // The axis itself must come from the container.
    axes: {
      shipped: fromDefault.pair.mapping.axis,
      otherAxis: zoned.pair.mapping.axis,
      differ: fromDefault.pair.mapping.axis !== zoned.pair.mapping.axis,
    },
    // And so must the key space the maps are built over.
    chargeKeys: {
      shipped: sorted([...resolvePhysics(fromDefault, DEFAULT_TAXONOMY).push.byBucket.keys()]),
      otherAxis: sorted([...resolvePhysics(zoned, OTHER_AXIS).push.byBucket.keys()]),
    },
    // And the spring table: categories and physics from the container's own
    // edge types, through its own rule.
    springKeys: {
      shipped: sorted(DEFAULT_TAXONOMY.edgeTypes.map(e => e.id).filter(id => resolvePhysics(fromDefault, DEFAULT_TAXONOMY).spring.describe(id) !== undefined)),
      otherAxis: sorted(OTHER_AXIS.edgeTypes.map(e => e.id).filter(id => resolvePhysics(zoned, OTHER_AXIS).spring.describe(id) !== undefined)),
    },
    zoneSpring: (() => {
      const ph = resolvePhysics(zoned, OTHER_AXIS).spring.physicsFor('zoneLink')
      return { strength: ph.strength, distance: ph.distance }
    })(),
    // A node on the other axis scores under ITS taxonomy and is absent under the
    // shipped one. Both rows are needed: the first proves the container is read,
    // the second proves the shipped one is genuinely not consulted.
    northNodeUnderOwnTaxonomy: chargeFor(resolvePhysics(zoned, OTHER_AXIS).push, northNode),
    northNodeUnderShippedTaxonomy: chargeFor(resolvePhysics(fromDefault, DEFAULT_TAXONOMY).push, northNode),
    // The alternate taxonomy from the injection probe keeps the shipped axis but
    // restyles it, so the physics MUST agree with the shipped one here — a probe
    // that reported a difference for every alternate would prove nothing.
    workerChargeShipped: chargeFor(resolvePhysics(fromDefault, DEFAULT_TAXONOMY).push, worker),
    workerChargeAlternate: chargeFor(resolvePhysics(fromAlternate, ALTERNATE).push, worker),

    // The axis has exactly one source, so a container derived by spreading
    // cannot end up disagreeing with itself. Before `styleAxis()` this row read
    // `sourceFile` while `styleValueOf` still answered on the type axis.
    derivedBySpreadStaysConsistent: (() => {
      const derived = { ...DEFAULT_TAXONOMY } as typeof DEFAULT_TAXONOMY
      return {
        axisAfterSpread: derived.styleAxis(),
        stillResolvesTheSameStyle:
          derived.nodeStyleOf(worker) === DEFAULT_TAXONOMY.nodeStyleOf(worker),
        physicsAgreesWithStyling:
          defaultParamsFor(derived).pair.mapping.axis === derived.styleAxis(),
      }
    })(),
  }
}


/**
 * The per-axis reheat policy, and the fold across axes (T9).
 *
 * This block exists because the policy had **no reader any gate could reach**:
 * every field of a descriptor's `reheat` could be inverted — including
 * `resume: false`, which is precisely the mistake T9 names and leaves the canvas
 * frozen after every toggle — and all six gates plus 7/7 goldens stayed green.
 *
 * The rows record each axis's declared policy and the fold for every subset of
 * axes, so a changed policy or a changed combination rule turns the golden red.
 */
function reheatPolicy(): Json {
  const dims = DEFAULT_TAXONOMY.filterAxes
  const declared: Record<string, Json> = {}
  for (const d of dims) {
    const policy = reheatOf(d)
    declared[d.id] = {
      alpha: policy.alpha,
      seedRevealed: policy.seedRevealed,
      refit: policy.refit,
      resume: policy.resume,
      emptyMeans: d.emptyMeans,
      absentMeans: d.absentMeans,
      focus: d.focus,
    }
  }
  // Every subset, because a view switch moves more than one axis at once and the
  // combination is where "last one wins" would hide.
  const folds: Record<string, Json> = {}
  const n = dims.length
  for (let mask = 0; mask < (1 << n); mask++) {
    const subset = dims.filter((_, i) => (mask & (1 << i)) !== 0)
    const plan = foldReheatPolicy(subset)
    const label = subset.length === 0 ? '(none)' : subset.map(d => d.id).sort().join('+')
    folds[label] = {
      alpha: plan.alpha,
      seedRevealed: plan.seedRevealed,
      refit: plan.refit,
      resume: plan.resume,
    }
  }
  return { declared, folds }
}

/** What the search matches on: the name unless the host's hook says otherwise. */
function searchText(): Json {
  const byCode = createTaxonomy({ ...DEFAULT_TAXONOMY_SPEC, searchText: n => `${payloadString(n, 'code') ?? ''} ${n.name}`.trim() })
  const coded = { ...NODES[1], payload: { code: 'WF-7' } }
  return {
    default: DEFAULT_TAXONOMY.searchText(NODES[1]),
    hooked: byCode.searchText(coded),
    hookedWithoutCode: byCode.searchText(NODES[1]),
  }
}

/**
 * Declarative classification: on one pair, a type whose `match` the edge
 * satisfies beats the fallback that declares none; the declared orientation
 * beats the reverse; an edge no type fits is unclassified; two types nothing
 * tells apart are refused at construction unless the host's rule is given;
 * and the host's rule is handed the declared answer.
 */
function matchClassification(): Json {
  const colour = { light: { fill: '#111111', border: '#222222' }, dark: { fill: '#333333', border: '#444444' } }
  const base = {
    styleAxis: 'kind',
    styles: [{ id: 'a', label: 'A', color: colour }, { id: 'b', label: 'B', color: colour }],
  }
  const taxonomy = createTaxonomy({
    ...base,
    edgeTypes: [
      { id: 'plain', label: 'plain', sourceValue: 'a', targetValue: 'b', relation: 'dependency' },
      { id: 'signal', label: 'signal', sourceValue: 'a', targetValue: 'b', relation: 'dependency', match: { via: 'signal' } },
      { id: 'reverse', label: 'reverse', sourceValue: 'b', targetValue: 'a', relation: 'dependency' },
      { id: 'onlyMatched', label: 'only', sourceValue: 'a', targetValue: 'a', relation: 'dependency', match: { via: 'x' } },
    ],
  })
  const edge = (values?: Record<string, string>): GraphEdge => ({ id: 'e', sourceId: 's', targetId: 't', relation: 'dependency', values })
  const twoAlike = [
    { id: 'one', label: '1', sourceValue: 'a', targetValue: 'b', relation: 'dependency' as const },
    { id: 'two', label: '2', sourceValue: 'a', targetValue: 'b', relation: 'dependency' as const },
  ]
  const outcome = (build: () => unknown): string => {
    try { build(); return 'built' } catch (e) { return /nothing tells them apart/.test(e instanceof Error ? e.message : '') ? 'refused' : 'other error' }
  }
  const handed: Array<string | undefined> = []
  const withRule = createTaxonomy({ ...base, edgeTypes: twoAlike, classifyEdge: (_e, _s, _t, declared) => { handed.push(declared); return 'two' } })
  return {
    fallback: taxonomy.classifyEdge(edge(), 'a', 'b') ?? null,
    matched: taxonomy.classifyEdge(edge({ via: 'signal' }), 'a', 'b') ?? null,
    unmatchedValue: taxonomy.classifyEdge(edge({ via: 'other' }), 'a', 'b') ?? null,
    reverseOrientation: taxonomy.classifyEdge(edge(), 'b', 'a') ?? null,
    matchedReverse: taxonomy.classifyEdge(edge({ via: 'signal' }), 'b', 'a') ?? null,
    onlyMatchedUnmet: taxonomy.classifyEdge(edge(), 'a', 'a') ?? null,
    onlyMatchedMet: taxonomy.classifyEdge(edge({ via: 'x' }), 'a', 'a') ?? null,
    twoAlikeRefused: outcome(() => createTaxonomy({ ...base, edgeTypes: twoAlike })),
    emptyMatchRefused: (() => {
      try { createTaxonomy({ ...base, edgeTypes: [{ id: 'e', label: 'e', sourceValue: 'a', targetValue: 'b', relation: 'dependency', match: {} }] }); return 'built' }
      catch (e) { return /match is empty/.test(e instanceof Error ? e.message : '') ? 'refused' : 'other error' }
    })(),
    twoAlikeWithRule: outcome(() => createTaxonomy({ ...base, edgeTypes: twoAlike, classifyEdge: () => 'one' })),
    ruleSeesDeclared: { answer: withRule.classifyEdge(edge(), 'a', 'b') ?? null, handed: handed.map(h => h ?? null) },
  }
}

/** A colour written as hsl() is a scheme colour, read as the channels a browser would give. */
function hslColour(): Json {
  const colour = { light: { fill: 'hsl(210, 50%, 40%)', border: 'hsl(210deg 50% 20% / 0.5)' }, dark: { fill: '#333333', border: '#444444' } }
  const taxonomy = createTaxonomy({ styleAxis: 'kind', styles: [{ id: 'a', label: 'A', color: colour }], edgeTypes: [] })
  const fill = rgbOf(taxonomy.styleOf('a').color.light.fill)
  const border = rgbOf(taxonomy.styleOf('a').color.light.border)
  return { fill: fill ? [...fill] : null, border: border ? [...border] : null }
}

export function taxonomyProbes(): Json {
  const fallback = DEFAULT_TAXONOMY.nodeStyleOf({ values: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } })
  return {
    searchText: searchText(),
    matchClassification: matchClassification(),
    hslColour: hslColour(),
    mappings: mappingProbes(),
    prototypeNamedValues: prototypeNamedValues(),
    reheatPolicy: reheatPolicy(),
    physicsInjection: physicsInjection(),
    // What a miss resolves to, field by field. Visibility is not among them any
    // more: the kind axis is on the node (D50), so an unrecognized style key
    // changes how a node is drawn and summarized, never whether it is shown.
    fallbackStyle: {
      label: fallback.label,
      icon: fallback.icon,
      summaryKind: fallback.summaryKind,
      size: { r: fallback.size.r, iconSize: fallback.size.iconSize },
      physics: {
        charge: fallback.physics.charge,
        coreRadius: fallback.physics.coreRadius,
        band: { x: { ...fallback.physics.band.x }, y: { ...fallback.physics.band.y } },
      },
    },
    // A miss must be stable, not a fresh object each time: the draw loop resolves
    // per node per frame and callers compare styles by reference.
    fallbackIsStable:
      DEFAULT_TAXONOMY.nodeStyleOf({ values: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } }) ===
      DEFAULT_TAXONOMY.nodeStyleOf({ values: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } }),
    // A node with no value on the style axis at all — the other half of the
    // guard, and the one an axis model makes reachable for the first time.
    absentValueResolvesToFallback:
      DEFAULT_TAXONOMY.nodeStyleOf({ values: {} }) === fallback,
    // A declared key must NOT reach the fallback: it resolves to its own entry
    // (defaults filled in, so the resolved style is a new object, not the
    // declared one), and to the same object every time.
    declaredKeyResolvesToItself: (() => {
      const worker = { values: { [TEMPORAL_TYPE_DIMENSION]: 'worker' } }
      const style = DEFAULT_TAXONOMY.nodeStyleOf(worker)
      return {
        sameLabel: style.label === NODE_TYPE_REGISTRY.worker.label,
        sameFill: style.color.light.fill === NODE_TYPE_REGISTRY.worker.color.light.fill,
        stable: DEFAULT_TAXONOMY.styleOf('worker') === DEFAULT_TAXONOMY.nodeStyleOf(worker),
      }
    })(),

    // The seam, exercised. Visibility now reads the node (its adapter wrote the
    // kind axis), so the shipped nodes are invisible under the alternate keys
    // whichever taxonomy is supplied — that is the first pair. What the
    // container still decides is what the visible set *means*: the same node
    // ids summarize differently under the two taxonomies, which is the second.
    injection: {
      shippedNodesOnShippedKeys: visible(DEFAULT_TAXONOMY, SOURCE, ['workerDef', 'workflowDef']),
      shippedNodesOnAlternateKeys: visible(ALTERNATE, SOURCE, ['tier-2', 'tier-3']),
      alternateNodesOnAlternateKeys: visible(ALTERNATE, ALT_SOURCE, ['tier-2', 'tier-3']),
      alternateNodesUnderShippedTaxonomy: visible(DEFAULT_TAXONOMY, ALT_SOURCE, ['tier-2', 'tier-3']),
    },
    // The hidden-node policy is the taxonomy's (D59, B16): the same chain, the
    // same hidden value, two answers — ascended edges under the shipped
    // policy, one spliced edge under a taxonomy that says `splice`.
    hiddenPolicy: {
      ascend: hiddenPolicy(DEFAULT_TAXONOMY),
      splice: hiddenPolicy(SPLICING),
      collisionCallFirst: collision(true),
      collisionCallLast: collision(false),
      cycle: cycle(),
    },
  }
}
