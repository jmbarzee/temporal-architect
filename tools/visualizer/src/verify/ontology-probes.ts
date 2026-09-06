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
import { bandFor, chargeFor, coreRadiusFor } from '../graph/forces'
import { TEMPORAL_TYPE_DIMENSION } from '../adapter/build'
import type { Json } from './snapshot'
import { sorted } from './snapshot'

const UNDECLARED = 'notADeclaredKey' as NodeType

function node(id: string, nodeType: NodeType, parentId?: string): SimNode {
  return {
    id, dimensions: { [TEMPORAL_TYPE_DIMENSION]: nodeType },
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
const EDGES: GraphEdge[] = [
  { id: 'c0', edgeType: 'containment', sourceId: 'wf', targetId: 'wk' },
  { id: 'd0', edgeType: 'dependency', sourceId: 'wf', targetId: 'act' },
]
const BY_ID = new Map(NODES.map(n => [n.id, n]))
const SOURCE = { nodes: NODES, edges: EDGES, getNode: (id: string) => BY_ID.get(id) }

/**
 * A taxonomy that answers differently from the shipped one: it declares the same
 * keys but maps them to different filter keys entirely. Nothing about it is
 * domain-specific — that is the point. If the graph engine is genuinely driven
 * by its container, filtering on `tier-2` selects the worker.
 */
const ALTERNATE = createOntology({
  styleDimension: TEMPORAL_TYPE_DIMENSION,
  abbreviations: { worker: 'T2', workflow: 'T3', activity: 'T4' },
  styleGroups: [{ id: 'tiers', values: ['worker', 'workflow', 'activity'] }],
  nodeTypeKeys: ['worker', 'workflow', 'activity'] as NodeType[],
  nodeStyles: {
    worker: { ...NODE_TYPE_REGISTRY.worker, defType: 'tier-2', summaryKind: 'degree' },
    workflow: { ...NODE_TYPE_REGISTRY.workflow, defType: 'tier-3' },
    activity: { ...NODE_TYPE_REGISTRY.activity, defType: 'tier-4' },
  } as Record<NodeType, (typeof NODE_TYPE_REGISTRY)['worker']>,
  edgeTypes: DEFAULT_ONTOLOGY.edgeTypes,
  resolveEdgeType: DEFAULT_ONTOLOGY.resolveEdgeType,
  fallbackStyle: NODE_TYPE_REGISTRY.activity,
})

function visible(ontology: typeof DEFAULT_ONTOLOGY, types: string[]): Json {
  const vg = computeVisibleGraph(SOURCE, new Set(types), new Set<string>(), ontology)
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
    values: ['a', 'b', 'c', 'd'],
    emptyMeans: 'none', absentMeans: 'visible',
    labelFor: v => v.toUpperCase(),
    abbreviationFor: v => v.slice(0, 1).toUpperCase(),
  }
  const grouped = createDimensionalMapping({
    id: 'probe:grouped', label: 'Grouped', dimension: 'probe',
    buckets: [
      { id: 'ab', label: 'A+B', values: ['a', 'b'] },
      { id: 'cd', label: 'C+D', values: ['c', 'd'] },
    ],
  })
  let refusal = 'NOT REFUSED — the guarantee is not enforced'
  try {
    createDimensionalMapping({
      id: 'probe:overlapping', label: 'Overlapping', dimension: 'probe',
      buckets: [
        { id: 'ab', label: 'A+B', values: ['a', 'b'] },
        { id: 'bc', label: 'B+C', values: ['b', 'c'] },
      ],
    })
  } catch (err) {
    refusal = err instanceof Error ? err.message : String(err)
  }
  return {
    identity: identityMapping(descriptor).buckets.map(b => `${b.id}=${b.label}:${b.values.join(',')}`),
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
  const rows: Record<string, Json> = {}
  for (const name of NAMES) {
    const subject = { dimensions: { [TEMPORAL_TYPE_DIMENSION]: name } }
    const style = DEFAULT_ONTOLOGY.resolveNodeStyle(subject)
    const node = { ...subject, id: name, name, orphan: true, definitionKey: name,
                   x: 0, y: 0, vx: 0, vy: 0, pinned: false } as SimNode
    const band = bandFor(params, node)
    rows[name] = {
      styleIsFallback: style === DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: {} }),
      styleLabel: style.label,
      charge: chargeFor(params, node),
      coreRadius: coreRadiusFor(params, node),
      chargeIsFinite: Number.isFinite(chargeFor(params, node)),
      band: `${band.yMin}..${band.yMax}`,
    }
  }
  return rows
}

export function ontologyProbes(): Json {
  const fallback = DEFAULT_ONTOLOGY.resolveNodeStyle({ dimensions: { [TEMPORAL_TYPE_DIMENSION]: UNDECLARED } })
  return {
    mappings: mappingProbes(),
    prototypeNamedValues: prototypeNamedValues(),
    // What a miss resolves to, field by field. The `defType` matters most: it is
    // what the visibility predicate tests, so it decides whether an unrecognized
    // node is permanently visible, permanently hidden, or accidentally lumped in
    // with a real type.
    fallbackStyle: {
      label: fallback.label,
      icon: fallback.icon,
      defType: fallback.defType,
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

    // The seam, exercised. Same graph, same filter vocabulary, two taxonomies —
    // the answers must differ, or nothing is actually being injected.
    injection: {
      shippedTaxonomyOnItsOwnKeys: visible(DEFAULT_ONTOLOGY, ['workerDef', 'workflowDef']),
      shippedTaxonomyOnAlternateKeys: visible(DEFAULT_ONTOLOGY, ['tier-2', 'tier-3']),
      alternateTaxonomyOnItsOwnKeys: visible(ALTERNATE, ['tier-2', 'tier-3']),
      alternateTaxonomyOnShippedKeys: visible(ALTERNATE, ['workerDef', 'workflowDef']),
    },
  }
}
