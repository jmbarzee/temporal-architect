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

import { DEF_TYPE_DIMENSION, RELATION_DIMENSION } from '../graph/dimension'
import { filterOfSets } from '../filter/types'
import { computeVisibleGraph } from '../components/graph-view/visibleGraph'
import type { GraphEdge } from '../graph/model'
import type { NodeType } from '../adapter/node-types'
import { DEFAULT_ONTOLOGY, NODE_TYPE_REGISTRY } from '../adapter/node-types'
import { createOntology } from '../graph/ontology'
import {
  createDimensionalMapping,
  identityMapping,
  internValue,
} from '../graph/dimension'
import type { DimensionDescriptor } from '../graph/dimension'
import type { SimNode } from '../graph/simulation'
import { defaultParamsFor } from '../graph/simulation'
import { foldReheatPolicy } from '../graph/dimension'
import { bandFor, chargeFor, coreRadiusFor, resolvePhysics, springForKey } from '../graph/forces'
import { TEMPORAL_TYPE_DIMENSION } from '../adapter/node-types'
import type { Json } from './snapshot'
import { sorted } from './snapshot'

const UNDECLARED = 'notADeclaredKey' as NodeType

/** The alternate taxonomy's kind projection — its adapter would write these. */
const ALT_DEF_TYPE: Record<string, string> = { worker: 'tier-2', workflow: 'tier-3', activity: 'tier-4' }

function node(id: string, nodeType: NodeType, parentId?: string, defType = NODE_TYPE_REGISTRY[nodeType].defType): SimNode {
  return {
    id, dimensions: { [TEMPORAL_TYPE_DIMENSION]: nodeType, [DEF_TYPE_DIMENSION]: defType },
    name: id, orphan: parentId === undefined,
    definitionKey: `${nodeType}:${id}`,
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
const ALTERNATE = createOntology({
  styleDimension: TEMPORAL_TYPE_DIMENSION,
  styleLabel: 'Tier',
  abbreviations: { worker: 'T2', workflow: 'T3', activity: 'T4' },
  styleGroups: [{ id: 'tiers', values: ['worker', 'workflow', 'activity'] }],
  nodeTypeKeys: ['worker', 'workflow', 'activity'] as NodeType[],
  filterDimensions: DEFAULT_ONTOLOGY.filterDimensions,
  nodeStyles: {
    worker: { ...NODE_TYPE_REGISTRY.worker, defType: ALT_DEF_TYPE.worker, summaryKind: 'degree' },
    workflow: { ...NODE_TYPE_REGISTRY.workflow, defType: ALT_DEF_TYPE.workflow },
    activity: { ...NODE_TYPE_REGISTRY.activity, defType: ALT_DEF_TYPE.activity },
  } as Record<NodeType, (typeof NODE_TYPE_REGISTRY)['worker']>,
  edgeTypes: DEFAULT_ONTOLOGY.edgeTypes,
  resolveEdgeType: DEFAULT_ONTOLOGY.resolveEdgeType,
  fallbackStyle: NODE_TYPE_REGISTRY.activity,
})

function visible(ontology: typeof DEFAULT_ONTOLOGY, source: typeof SOURCE, types: string[]): Json {
  const vg = computeVisibleGraph(source, filterOfSets(new Set(types), new Set<string>()), ontology)
  return {
    visibleNodeIds: sorted(vg.visibleIds),
    summaries: sorted([...vg.nodeSummaries].map(([id, s]) => `${id}=${s}`)),
  }
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
  const descriptor: DimensionDescriptor = {
    id: 'probe', label: 'Probe',
    emptyMeans: 'none', absentMeans: 'visible',
    focus: 'always',
    reheat: { alpha: 0.5, seedRevealed: true, refit: true, resume: true },
    chipsFor: values => values.map(v => ({ id: v, label: v, values: [v] })),
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
 * `styleForKey` meanwhile returns the constructor as though it were a style,
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
    const band = bandFor(resolved.band, node)
    rows.push({
      name,
      styleIsFallback: style === DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: {} }),
      styleLabel: style.label,
      charge: chargeFor(resolved.push, node),
      coreRadius: coreRadiusFor(resolved.push, node),
      chargeIsFinite: Number.isFinite(chargeFor(resolved.push, node)),
      band: `${band.yMin}..${band.yMax}`,
      // D39 fixed styleForKey and the force lookups and missed this one.
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
    abbreviations: { north: 'N', south: 'S' },
    styleGroups: [{ id: 'zones', values: ['north', 'south'] }],
    nodeTypeKeys: ['north', 'south'],
    filterDimensions: DEFAULT_ONTOLOGY.filterDimensions,
    nodeStyles: {
      north: NODE_TYPE_REGISTRY.worker,
      south: NODE_TYPE_REGISTRY.activity,
    },
    // Its own edge table and rule, so the spring rows below can only come out
    // right by reading the container.
    edgeTypes: [{
      id: 'zoneLink', label: 'N↔S', sourceType: 'north', targetType: 'south',
      category: 'dependency', directional: false,
      physics: { strength: 0.7, distance: 123 }, tooltip: 'zone link',
    }],
    resolveEdgeType: () => 'zoneLink',
    fallbackStyle: NODE_TYPE_REGISTRY.activity,
  })
  const zoned = defaultParamsFor(OTHER_AXIS)
  const northNode = { dimensions: { zone: 'north' } }

  return {
    // The axis itself must come from the container.
    axes: {
      shipped: fromDefault.push.mapping.dimension,
      otherAxis: zoned.push.mapping.dimension,
      differ: fromDefault.push.mapping.dimension !== zoned.push.mapping.dimension,
    },
    // And so must the key space the maps are built over.
    chargeKeys: {
      shipped: sorted([...resolvePhysics(fromDefault, DEFAULT_ONTOLOGY).push.byBucket.keys()]),
      otherAxis: sorted([...resolvePhysics(zoned, OTHER_AXIS).push.byBucket.keys()]),
    },
    // And the spring table: categories and physics from the container's own
    // edge types, through its own rule.
    springKeys: {
      shipped: sorted([...resolvePhysics(fromDefault, DEFAULT_ONTOLOGY).spring.byCategory.keys()]),
      otherAxis: sorted([...resolvePhysics(zoned, OTHER_AXIS).spring.byCategory.keys()]),
    },
    zoneSpring: (() => {
      const ph = springForKey(resolvePhysics(zoned, OTHER_AXIS).spring, 'zoneLink')
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
          defaultParamsFor(derived).push.mapping.dimension === derived.styleAxis(),
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
        yBand: { ...fallback.physics.yBand },
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
    // A declared key must NOT reach the fallback.
    declaredKeyUnaffected:
      DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: { [TEMPORAL_TYPE_DIMENSION]: 'worker' } }) === NODE_TYPE_REGISTRY.worker,

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
  }
}
