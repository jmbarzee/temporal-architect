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

import { RELATION_DIMENSION } from '@temporal-architect/graph-view/graph/dimension'
import { DEF_TYPE_DIMENSION } from '../adapter/dimensions'
import { filterOfSets } from './filter-states'
import { computeVisibleGraph } from '@temporal-architect/graph-view/components/graph-view/visibleGraph'
import type { GraphEdge } from '@temporal-architect/graph-view/graph/model'
import type { NodeType, TemporalNodeStyle } from '../adapter/node-types'
import type { NodeStyle } from '@temporal-architect/graph-view/graph/taxonomy'
import { ALL_NODE_TYPES, DEFAULT_ONTOLOGY, NODE_TYPE_REGISTRY, DEFAULT_ONTOLOGY_SPEC } from '../adapter/node-types'
import { createOntology } from '@temporal-architect/graph-view/graph/ontology'
import {
  createDimensionalMapping,
  identityMapping,
  internValue,
} from '@temporal-architect/graph-view/graph/dimension'
import type { AxisNamer } from '@temporal-architect/graph-view/graph/dimension'
import type { SimNode } from '@temporal-architect/graph-view/graph/simulation'
import { defaultParamsFor } from '@temporal-architect/graph-view/graph/simulation'
import { foldReheatPolicy } from '@temporal-architect/graph-view/graph/dimension'
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
    dimensions: defType === undefined ? dimensionsFor(nodeType, undefined) : { ...dimensionsFor(nodeType, undefined), [DEF_TYPE_DIMENSION]: defType },
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
  const t = n.dimensions[TEMPORAL_TYPE_DIMENSION] as NodeType
  return node(n.id, t, n.parentId, ALT_DEF_TYPE[t])
})
const EDGES: GraphEdge[] = [
  { id: 'c0', sourceId: 'wf', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  { id: 'd0', sourceId: 'wf', targetId: 'act', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
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
const ALTERNATE = createOntology({
  styleDimension: TEMPORAL_TYPE_DIMENSION,
  styleLabel: 'Tier',
  values: [
    alternate('worker', { abbreviation: 'T2', defType: ALT_DEF_TYPE.worker, summaryKind: 'degree' }),
    alternate('workflow', { abbreviation: 'T3', defType: ALT_DEF_TYPE.workflow }),
    alternate('activity', { abbreviation: 'T4', defType: ALT_DEF_TYPE.activity }),
  ],
  filterDimensions: DEFAULT_ONTOLOGY.filterDimensions,
  // Only the shipped edge types that run between values this taxonomy declares:
  // an edge type to a value nobody declared is refused at construction.
  edgeTypes: DEFAULT_ONTOLOGY.edgeTypes.filter(e => ALT_VALUES.includes(e.sourceType) && ALT_VALUES.includes(e.targetType)),
  resolveEdgeType: DEFAULT_ONTOLOGY.resolveEdgeType,
  scalars: [],
  fallbackStyle: NODE_TYPE_REGISTRY.activity,
})

function visible(ontology: typeof DEFAULT_ONTOLOGY, source: typeof SOURCE, types: string[]): Json {
  const vg = computeVisibleGraph(source, filterOfSets(new Set(types), new Set<string>()), ontology)
  return {
    visibleNodeIds: sorted(vg.visibleIds),
    summaries: sorted([...vg.nodeSummaries].map(([id, s]) => `${id}=${s}`)),
    graduatedEdges: sorted(vg.visibleEdges.map(e => `${e.sourceId} -> ${e.targetId}|${e.dimensions[RELATION_DIMENSION]}`)),
    // The hover box's context line per visible node — the taxonomy's hook, or
    // its default, the parent's name (D59).
    contextLines: sorted(vg.visibleNodes.map(n => `${n.id}=${ontology.contextLine(n, n.parentId ? source.getNode(n.parentId) : undefined) ?? ''}`)),
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
  { id: 'c0', sourceId: 'wf', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  { id: 'c1', sourceId: 'act', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  { id: 'c2', sourceId: 'act2', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  { id: 'd0', sourceId: 'wf', targetId: 'act', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
  { id: 'd1', sourceId: 'act2', targetId: 'wf', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
]
const CHAIN = (() => { const byId = new Map(CHAIN_NODES.map(n => [n.id, n])); return { nodes: CHAIN_NODES, edges: CHAIN_EDGES, getNode: (id: string) => byId.get(id) } })()
const SPLICING = createOntology({
  ...DEFAULT_ONTOLOGY_SPEC,
  values: ALL_NODE_TYPES.map(t => ({ id: t, ...NODE_TYPE_REGISTRY[t], ...(t === 'workflow' ? { whenHidden: 'splice' as const } : {}) })),
})
function hiddenPolicy(ontology: typeof DEFAULT_ONTOLOGY): Json {
  const vg = computeVisibleGraph(CHAIN, filterOfSets(new Set(['workerDef', 'activityDef']), new Set<string>()), ontology)
  return sorted(vg.visibleEdges.map(e => `${e.sourceId} -> ${e.targetId}|${e.dimensions[RELATION_DIMENSION]}`))
}

// Two graduated edges landing on one pair (D60): a call edge carrying
// metadata, spliced through a hidden operation to its backing, and the
// operation's own metadata-less edge to the same backing, spliced on its
// source side to the same caller. The one carrying metadata keeps precedence
// whichever the parser emits first — the rule the fixtures pinned, said
// without a payload key.
const edgeLine = (e: GraphEdge) => `${e.sourceId} -> ${e.targetId}|${e.dimensions[RELATION_DIMENSION]}${e.payload ? '|meta=' + Object.keys(e.payload).sort().join(',') : ''}`
function collision(callFirst: boolean): Json {
  const nodes: SimNode[] = [
    node('wk', 'worker'),
    node('caller', 'workflow', 'wk'),
    node('svc', 'nexusService', 'wk'),
    node('op', 'nexusOperation', 'svc'),
    node('backing', 'workflow', 'wk'),
  ]
  const call: GraphEdge = { id: 'call', sourceId: 'caller', targetId: 'op', dimensions: { [RELATION_DIMENSION]: 'dependency' }, payload: { route: 'ep' } }
  const backs: GraphEdge[] = [{ id: 'backs', sourceId: 'op', targetId: 'backing', dimensions: { [RELATION_DIMENSION]: 'dependency' } }]
  const contain: GraphEdge[] = [
    { id: 'c1', sourceId: 'caller', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'c2', sourceId: 'svc', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'c3', sourceId: 'op', targetId: 'svc', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'c4', sourceId: 'backing', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  ]
  const edges = callFirst ? [...contain, call, ...backs] : [...contain, ...backs, call]
  const byId = new Map(nodes.map(n => [n.id, n]))
  const vg = computeVisibleGraph({ nodes, edges, getNode: (id: string) => byId.get(id) }, filterOfSets(new Set(['workerDef', 'workflowDef', 'nexusServiceDef']), new Set<string>()), DEFAULT_ONTOLOGY)
  return sorted(vg.visibleEdges.filter(e => e.dimensions[RELATION_DIMENSION] === 'dependency').map(edgeLine))
}

// Two hidden spliced nodes that call each other, and a visible caller into the
// cycle: the resolution passes each hidden node once and ends (REVIEW_7 C3).
function cycle(): Json {
  const nodes: SimNode[] = [
    node('wk', 'worker'),
    node('caller', 'workflow', 'wk'),
    node('svc', 'nexusService', 'wk'),
    node('ping', 'nexusOperation', 'svc'),
    node('pong', 'nexusOperation', 'svc'),
  ]
  const edges: GraphEdge[] = [
    { id: 'c1', sourceId: 'caller', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'c2', sourceId: 'svc', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'c3', sourceId: 'ping', targetId: 'svc', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'c4', sourceId: 'pong', targetId: 'svc', dimensions: { [RELATION_DIMENSION]: 'containment' } },
    { id: 'd0', sourceId: 'caller', targetId: 'ping', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
    { id: 'd1', sourceId: 'ping', targetId: 'pong', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
    { id: 'd2', sourceId: 'pong', targetId: 'ping', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
  ]
  const byId = new Map(nodes.map(n => [n.id, n]))
  const vg = computeVisibleGraph({ nodes, edges, getNode: (id: string) => byId.get(id) }, filterOfSets(new Set(['workerDef', 'workflowDef']), new Set<string>()), DEFAULT_ONTOLOGY)
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
  const grouped = createDimensionalMapping({
    id: 'probe:grouped', label: 'Grouped', dimension: 'probe',
    buckets: [
      { id: 'ab', label: 'A+B', abbreviation: 'AB', values: ['a', 'b'] },
      { id: 'cd', label: 'C+D', abbreviation: 'CD', values: ['c', 'd'] },
    ],
  })
  let refusal = 'NOT REFUSED — the guarantee is not enforced'
  try {
    createDimensionalMapping({
      id: 'probe:overlapping', label: 'Overlapping', dimension: 'probe',
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
 * Dimension values that name `Object.prototype` members.
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
  const params = defaultParamsFor(DEFAULT_ONTOLOGY)
  const resolved = resolvePhysics(params, DEFAULT_ONTOLOGY)
  // An ARRAY of rows, each carrying its own name, because the row keys are the
  // very prototype names being probed. As an object this dropped `__proto__`
  // twice: `rows['__proto__'] = …` invokes the setter, and even built with
  // `Object.fromEntries` the snapshot canonicaliser rebuilds the object and
  // loses it again. The probe listed five names and recorded four — silently
  // missing the row most likely to catch the bug it exists for. A list has no
  // key space to collide with.
  const rows: Json[] = []
  for (const name of NAMES) {
    const subject = { dimensions: { [TEMPORAL_TYPE_DIMENSION]: name } }
    const style = DEFAULT_ONTOLOGY.resolveNodeStyle(subject)
    const node = subject
    const band = bandFor(mappedAxis(resolved.bandY), node)
    rows.push({
      name,
      styleIsFallback: style === DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: {} }),
      styleLabel: style.label,
      charge: chargeFor(resolved.push, node),
      coreRadius: coreRadiusFor(resolved.push, node),
      chargeIsFinite: Number.isFinite(chargeFor(resolved.push, node)),
      band: `${band.min}..${band.max}`,
      // D39 fixed the style lookup and the force lookups and missed this one.
      abbreviation: DEFAULT_ONTOLOGY.abbreviationFor(name),
      abbreviationIsString: typeof DEFAULT_ONTOLOGY.abbreviationFor(name) === 'string',
    })
  }
  return rows
}


/**
 * The physics half of the container — the half no gate watched.
 *
 * The injection probe below drives `computeVisibleGraph` through two taxonomies
 * and goldens that the answers differ. That covers styling and filtering and
 * nothing else, so the review was able to pin `Simulation` to the first ontology
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
  const fromDefault = defaultParamsFor(DEFAULT_ONTOLOGY)
  const fromAlternate = defaultParamsFor(ALTERNATE)
  const worker = { dimensions: { [TEMPORAL_TYPE_DIMENSION]: 'worker' } }

  // A taxonomy on a DIFFERENT axis entirely. Its charge map is keyed by values
  // no node in the shipped domain carries, so a consumer that ignored the
  // supplied container and used the shipped one would score these nodes; one
  // that honours it finds nothing and returns the absent-value physics.
  const OTHER_AXIS = createOntology({
    styleDimension: 'zone',
    styleLabel: 'Zone',
    values: [
      { id: 'north', ...NODE_TYPE_REGISTRY.worker, abbreviation: 'N' },
      { id: 'south', ...NODE_TYPE_REGISTRY.activity, abbreviation: 'S' },
    ],
    filterDimensions: DEFAULT_ONTOLOGY.filterDimensions,
    // Its own edge table and rule, so the spring rows below can only come out
    // right by reading the container.
    edgeTypes: [{
      id: 'zoneLink', label: 'N↔S', sourceType: 'north', targetType: 'south',
      relation: 'dependency',
      physics: { strength: 0.7, distance: 123 }, tooltip: 'zone link',
      style: { color: { light: '#000000', dark: '#FFFFFF' }, alpha: 1, dash: [], width: 1 },
    }],
    resolveEdgeType: () => 'zoneLink',
    scalars: [],
    fallbackStyle: NODE_TYPE_REGISTRY.activity,
  })
  const zoned = defaultParamsFor(OTHER_AXIS)
  const northNode = { dimensions: { zone: 'north' } }

  return {
    // The axis itself must come from the container.
    axes: {
      shipped: fromDefault.pair.mapping.dimension,
      otherAxis: zoned.pair.mapping.dimension,
      differ: fromDefault.pair.mapping.dimension !== zoned.pair.mapping.dimension,
    },
    // And so must the key space the maps are built over.
    chargeKeys: {
      shipped: sorted([...resolvePhysics(fromDefault, DEFAULT_ONTOLOGY).push.byBucket.keys()]),
      otherAxis: sorted([...resolvePhysics(zoned, OTHER_AXIS).push.byBucket.keys()]),
    },
    // And the spring table: categories and physics from the container's own
    // edge types, through its own rule.
    springKeys: {
      shipped: sorted(DEFAULT_ONTOLOGY.edgeTypes.map(e => e.id).filter(id => resolvePhysics(fromDefault, DEFAULT_ONTOLOGY).spring.describe(id) !== undefined)),
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
    northNodeUnderShippedTaxonomy: chargeFor(resolvePhysics(fromDefault, DEFAULT_ONTOLOGY).push, northNode),
    // The alternate taxonomy from the injection probe keeps the shipped axis but
    // restyles it, so the physics MUST agree with the shipped one here — a probe
    // that reported a difference for every alternate would prove nothing.
    workerChargeShipped: chargeFor(resolvePhysics(fromDefault, DEFAULT_ONTOLOGY).push, worker),
    workerChargeAlternate: chargeFor(resolvePhysics(fromAlternate, ALTERNATE).push, worker),

    // The axis has exactly one source, so a container derived by spreading
    // cannot end up disagreeing with itself. Before `styleAxis()` this row read
    // `sourceFile` while `valueFor` still answered on the type axis.
    derivedBySpreadStaysConsistent: (() => {
      const derived = { ...DEFAULT_ONTOLOGY } as typeof DEFAULT_ONTOLOGY
      return {
        axisAfterSpread: derived.styleAxis(),
        stillResolvesTheSameStyle:
          derived.resolveNodeStyle(worker) === DEFAULT_ONTOLOGY.resolveNodeStyle(worker),
        physicsAgreesWithStyling:
          defaultParamsFor(derived).pair.mapping.dimension === derived.styleAxis(),
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
  const dims = DEFAULT_ONTOLOGY.filterDimensions
  const declared: Record<string, Json> = {}
  for (const d of dims) {
    declared[d.id] = {
      alpha: d.reheat.alpha,
      seedRevealed: d.reheat.seedRevealed,
      refit: d.reheat.refit,
      resume: d.reheat.resume,
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

export function ontologyProbes(): Json {
  const fallback = DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } })
  return {
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
      DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } }) ===
      DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } }),
    // A node with no value on the style axis at all — the other half of the
    // guard, and the one a dimension model makes reachable for the first time.
    absentValueResolvesToFallback:
      DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: {} }) === fallback,
    // A declared key must NOT reach the fallback: it resolves to its own entry
    // (defaults filled in, so the resolved style is a new object, not the
    // declared one), and to the same object every time.
    declaredKeyResolvesToItself: (() => {
      const worker = { dimensions: { [TEMPORAL_TYPE_DIMENSION]: 'worker' } }
      const style = DEFAULT_ONTOLOGY.resolveNodeStyle(worker)
      return {
        sameLabel: style.label === NODE_TYPE_REGISTRY.worker.label,
        sameFill: style.color.light.fill === NODE_TYPE_REGISTRY.worker.color.light.fill,
        stable: DEFAULT_ONTOLOGY.styleOf('worker') === DEFAULT_ONTOLOGY.resolveNodeStyle(worker),
      }
    })(),

    // The seam, exercised. Visibility now reads the node (its adapter wrote the
    // kind axis), so the shipped nodes are invisible under the alternate keys
    // whichever taxonomy is supplied — that is the first pair. What the
    // container still decides is what the visible set *means*: the same node
    // ids summarize differently under the two taxonomies, which is the second.
    injection: {
      shippedNodesOnShippedKeys: visible(DEFAULT_ONTOLOGY, SOURCE, ['workerDef', 'workflowDef']),
      shippedNodesOnAlternateKeys: visible(ALTERNATE, SOURCE, ['tier-2', 'tier-3']),
      alternateNodesOnAlternateKeys: visible(ALTERNATE, ALT_SOURCE, ['tier-2', 'tier-3']),
      alternateNodesUnderShippedTaxonomy: visible(DEFAULT_ONTOLOGY, ALT_SOURCE, ['tier-2', 'tier-3']),
    },
    // The hidden-node policy is the taxonomy's (D59, B16): the same chain, the
    // same hidden value, two answers — ascended edges under the shipped
    // policy, one spliced edge under a taxonomy that says `splice`.
    hiddenPolicy: {
      ascend: hiddenPolicy(DEFAULT_ONTOLOGY),
      splice: hiddenPolicy(SPLICING),
      collisionCallFirst: collision(true),
      collisionCallLast: collision(false),
      cycle: cycle(),
    },
  }
}
