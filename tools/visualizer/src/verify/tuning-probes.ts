// Probes for the tuning layer — what D47 and D51 promise about overrides,
// retuning, the ceiling and the taxonomy's coherence, none of which a fixture
// reaches. Every fixture runs `defaultParamsFor`: identity multipliers, nothing
// overridden, every axis in range. So a dropped override, a stale mapping after
// a graph change, a ceiling that admitted anything, or a taxonomy whose four
// declarations of its value set disagreed would all have left every golden
// green. The Unit 4 review showed each of those sabotages passing; these rows
// are what now goes red.

import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import type { NodeType } from '../adapter/node-types'
import type { AxisDescriptor } from '@temporal-architect/graph-view/graph/axis'
import { DEFAULT_TAXONOMY, NODE_TYPE_REGISTRY, DEFAULT_TAXONOMY_SPEC } from '../adapter/node-types'
import { ALL_EDGE_TYPES } from '../adapter/edge-types'
import { dimensionsFor } from '../adapter/build'
import {
  Simulation, axisOptions, defaultParamsFor, fitsCeiling, layoutAxisKey, layoutAxisOptions, pairTuning, retunedFor,
  withPushOverride, withSpringOverride, withOverride, TOKEN_CEILING,
} from '@temporal-architect/graph-view/graph/simulation'
import { isScalarTuning } from '@temporal-architect/graph-view/graph/scalar'
import type { ForceParams, SimNode } from '@temporal-architect/graph-view/graph/simulation'
import { resolvePhysics, springFor } from '@temporal-architect/graph-view/graph/forces'
import { createTaxonomy } from '@temporal-architect/graph-view/graph/taxonomy'
import { createAxisMapping, identityMapping } from '@temporal-architect/graph-view/graph/axis'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import { computeVisibleGraph } from '@temporal-architect/graph-view/components/graph-view/visibleGraph'
import { filterOfSets } from './filter-states'
import { FIXTURES } from './fixtures'
import { buildFixtureGraph } from './tier-a'
import { mulberry32 } from './rng'
import { MIDDLING_SPRING } from '@temporal-architect/graph-view/graph/shapes'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const SEED = 0x7a1e

/** The mapped half of a layout tuning; loud if a probe reaches a scalar where it expected buckets. */
function mapped(t: ForceParams['bandY']): Exclude<ForceParams['bandY'], { scalar: string }> {
  if (isScalarTuning(t)) throw new Error('probe expected a mapped axis')
  return t
}

function multifile(): Graph {
  const fixture = FIXTURES.find(f => f.name === 'multifile-sample')
  if (!fixture) throw new Error('tuning-probes: the multifile fixture is missing')
  return buildFixtureGraph(fixture)
}

function graphOf(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  return { nodes, edges }
}

export function syntheticNode(id: string, nodeType: NodeType, sourceFile: string | undefined): GraphNode {
  return { id, values: dimensionsFor(nodeType, sourceFile), name: id, ring: 'dashed', copyKey: `${nodeType}:${id}` }
}

/** N files, one node each, chained by dependency edges — past the ceiling for N > 24. */
function manyFiles(n: number): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  for (let i = 0; i < n; i++) {
    nodes.push(syntheticNode(`n${i}`, 'workflow', `f${i}.twf`))
    if (i > 0) edges.push({ id: `e${i}`, sourceId: `n${i - 1}`, targetId: `n${i}`, relation: 'dependency' })
  }
  return graphOf(nodes, edges)
}

function without(graph: Graph, file: string): Graph {
  const keep = graph.nodes.filter(n => n.values[SOURCE_FILE_DIMENSION] !== file)
  const ids = new Set(keep.map(n => n.id))
  return graphOf(keep, graph.edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId)))
}

function fileAxisParams(graph: Graph): ForceParams {
  const option = axisOptions(DEFAULT_TAXONOMY, graph).find(o => o.mapping.axis === SOURCE_FILE_DIMENSION)
  if (!option) throw new Error('tuning-probes: the fixture offers no file axis')
  const params = defaultParamsFor(DEFAULT_TAXONOMY)
  return { ...params, pair: withPushOverride(pairTuning(option.mapping), 'nexus.twf', { charge: -123, coreRadius: 45 }) }
}

const pushRow = (params: ForceParams, bucket: string): Json => {
  const v = resolvePhysics(params, DEFAULT_TAXONOMY).push.byBucket.get(bucket)
  return v ? { charge: v.charge, coreRadius: v.coreRadius } : 'absent'
}

/**
 * The sparse override channel, end to end: resolution carries an override and
 * leaves its neighbours declared, and a Simulation given one moves differently
 * on its first tick. Two seeded simulations on one graph, one overridden.
 */
function overrides(graph: Graph): Json {
  const base = defaultParamsFor(DEFAULT_TAXONOMY)
  const tuned: ForceParams = {
    ...base,
    pair: withSpringOverride(
      withPushOverride(base.pair, 'workflow', { charge: -123, coreRadius: 45 }),
      'linkWorkflowToActivity', { strength: 0.33, distance: 77 },
    ),
  }
  const resolved = resolvePhysics(tuned, DEFAULT_TAXONOMY)
  const declared = resolvePhysics(base, DEFAULT_TAXONOMY)
  const firstTick = (params: ForceParams): [number, number] => {
    const sim = new Simulation(graph, params, mulberry32(SEED), DEFAULT_TAXONOMY)
    sim.tick()
    const n = sim.nodes.find(x => x.values.temporalType === 'workflow')
    return n ? [n.vx, n.vy] : [NaN, NaN]
  }
  const [bx, by] = firstTick(base)
  const [tx, ty] = firstTick(tuned)
  return {
    overriddenBucket: pushRow(tuned, 'workflow'),
    neighbourStaysDeclared: pushRow(tuned, 'worker'),
    neighbourEqualsDefault: JSON.stringify(pushRow(tuned, 'worker')) === JSON.stringify(pushRow(base, 'worker')),
    overriddenSpring: (() => { const p = resolved.spring.physicsFor('linkWorkflowToActivity'); return { strength: p.strength, distance: p.distance } })(),
    neighbourSpringStaysDeclared: (() => { const p = resolved.spring.physicsFor('linkWorkerToWorkflow'); const d = declared.spring.physicsFor('linkWorkerToWorkflow'); return p.strength === d.strength && p.distance === d.distance })(),
    simulationMovesDifferently: bx !== tx || by !== ty,
    firstTickBase: [bx, by],
    firstTickTuned: [tx, ty],
  }
}

/**
 * `retunedFor`'s contract (D51): the same object when nothing moved, including
 * when only node order moved; overrides kept when a value survives; the style
 * axis when the axis vanished, outgrew the ceiling, or the taxonomy changed.
 */
function retune(graph: Graph): Json {
  const params = fileAxisParams(graph)
  const reversed: Graph = { ...graph, nodes: [...graph.nodes].reverse() }
  const dropped = retunedFor(params, DEFAULT_TAXONOMY, without(graph, 'task-queues.twf'))
  const fileless = retunedFor(params, DEFAULT_TAXONOMY, graphOf([syntheticNode('x', 'workflow', undefined)], []))
  const big = manyFiles(30)
  const bigOption = axisOptions(DEFAULT_TAXONOMY, big).find(o => o.mapping.axis === SOURCE_FILE_DIMENSION)
  const outgrown = retunedFor(params, DEFAULT_TAXONOMY, big)
  // A taxonomy with three of the seven types, derived from the spec (not by
  // spreading the built container): the style axis is the same, its buckets
  // are not, and the override on a surviving value must survive with it.
  const three = createTaxonomy({
    ...DEFAULT_TAXONOMY_SPEC,
    styles: [
      { id: 'worker', ...NODE_TYPE_REGISTRY.worker },
      { id: 'workflow', ...NODE_TYPE_REGISTRY.workflow },
      { id: 'activity', ...NODE_TYPE_REGISTRY.activity },
    ],
    // The edge types among those three values: one to a value nobody declared is refused.
    edgeTypes: ALL_EDGE_TYPES.filter(e => ['worker', 'workflow', 'activity'].includes(e.sourceValue) && ['worker', 'workflow', 'activity'].includes(e.targetValue)),
  })
  const styled = defaultParamsFor(DEFAULT_TAXONOMY)
  const styledTuned: ForceParams = {
    ...styled,
    pair: withPushOverride(styled.pair, 'worker', { charge: -1, coreRadius: 2 }),
    bandY: withOverride(mapped(styled.bandY), 'worker', { min: -5, max: 5 }),
  }
  const swapped = retunedFor(styledTuned, three, graph)
  return {
    unchangedGraphReturnsSameObject: retunedFor(params, DEFAULT_TAXONOMY, graph) === params,
    reorderedNodesReturnSameObject: retunedFor(params, DEFAULT_TAXONOMY, reversed) === params,
    fileDropped: {
      buckets: dropped.pair.mapping.buckets.map(b => b.id),
      overrideKept: dropped.pair.push.has('nexus.twf'),
      isNewObject: dropped !== params,
    },
    axisVanished: { axis: fileless.pair.mapping.axis, overrides: fileless.pair.push.size },
    outgrown: {
      fileOption: bigOption ? { pushTokens: bigOption.pushTokens, pullTokens: bigOption.pullTokens, fits: fitsCeiling(bigOption) } : 'absent',
      ceiling: TOKEN_CEILING,
      fellBackTo: outgrown.pair.mapping.axis,
    },
    // The band axes under the same rule as the pair axis: an
    // axis bucketed by observed values follows the graph, keeps its overrides
    // while the value survives, and falls back to the style axis with nothing
    // overridden when the axis vanishes or outgrows the ceiling — on X too.
    bandAxes: (() => {
      const fileOption = axisOptions(DEFAULT_TAXONOMY, graph).find(o => o.mapping.axis === SOURCE_FILE_DIMENSION)
      if (!fileOption) return 'no file axis'
      const tuned: ForceParams = {
        ...defaultParamsFor(DEFAULT_TAXONOMY),
        bandX: withOverride({ mapping: fileOption.mapping, overrides: new Map() }, 'nexus.twf', { min: -1, max: 1 }),
        bandY: withOverride({ mapping: fileOption.mapping, overrides: new Map() }, 'nexus.twf', { min: -2, max: 2 }),
      }
      const same = retunedFor(tuned, DEFAULT_TAXONOMY, graph)
      const droppedFile = retunedFor(tuned, DEFAULT_TAXONOMY, without(graph, 'task-queues.twf'))
      const gone = retunedFor(tuned, DEFAULT_TAXONOMY, graphOf([syntheticNode('x', 'workflow', undefined)], []))
      const grown = retunedFor(tuned, DEFAULT_TAXONOMY, manyFiles(30))
      return {
        sameGraphReturnsSameObject: same === tuned,
        fileDropped: { xBuckets: mapped(droppedFile.bandX).mapping.buckets.map(b => b.id), yBuckets: mapped(droppedFile.bandY).mapping.buckets.map(b => b.id), xOverrideKept: mapped(droppedFile.bandX).overrides.has('nexus.twf'), yOverrideKept: mapped(droppedFile.bandY).overrides.has('nexus.twf') },
        axisVanished: { x: mapped(gone.bandX).mapping.axis, y: mapped(gone.bandY).mapping.axis, xOverrides: mapped(gone.bandX).overrides.size, yOverrides: mapped(gone.bandY).overrides.size },
        outgrown: { x: mapped(grown.bandX).mapping.axis, y: mapped(grown.bandY).mapping.axis, xOverrides: mapped(grown.bandX).overrides.size },
        // A scalar axis has no buckets: a graph change keeps it by reference; a
        // taxonomy that does not know the scalar falls it back to the style identity.
        scalar: (() => {
          const onReach: ForceParams = { ...defaultParamsFor(DEFAULT_TAXONOMY), bandY: { scalar: 'reach' } }
          const kept = retunedFor(onReach, DEFAULT_TAXONOMY, without(graph, 'task-queues.twf'))
          const unknown: ForceParams = { ...onReach, bandY: { scalar: 'not-a-scalar', span: { zero: 1, one: -1 } } }
          const fell = retunedFor(unknown, DEFAULT_TAXONOMY, graph)
          return { graphChangeKeepsIt: kept.bandY === onReach.bandY, unknownScalarFallsBack: !isScalarTuning(fell.bandY) && (fell.bandY as { mapping: { axis: string } }).mapping.axis === 'temporalType' }
        })(),
      }
    })(),
    taxonomySwapped: {
      pairBuckets: swapped.pair.mapping.buckets.map(b => b.id),
      bandBuckets: mapped(swapped.bandY).mapping.buckets.map(b => b.id),
      pushOverrideKept: swapped.pair.push.has('worker'),
      bandOverrideKept: mapped(swapped.bandY).overrides.has('worker'),
      sameTaxonomyReturnsSameObject: retunedFor(styledTuned, DEFAULT_TAXONOMY, graph) === styledTuned,
    },
  }
}

/**
 * Off the style axis a bucket is not a style key. Its push physics is the
 * host's typical declared value — the fold over every declared style — never
 * the fallback style's, and resolving it warns about nothing; its spring is
 * the middling spring, the same start a declared type gets when it leaves
 * its spring out, so no type's declared spring moves a pair category.
 */
function foreignAxisPhysics(graph: Graph): Json {
  const params = fileAxisParams(graph)
  const resolved = resolvePhysics(params, DEFAULT_TAXONOMY)
  const typical = resolvePhysics({ ...params, pair: pairTuning(params.pair.mapping) }, DEFAULT_TAXONOMY).push.byBucket.get('task-queues.twf')
  const fallback = DEFAULT_TAXONOMY.styleOf('not-a-style-key').physics
  return {
    buckets: sortedRecord([...resolved.push.byBucket].map(([k, v]) => [k, { charge: v.charge, coreRadius: v.coreRadius }] as const)),
    typicalIsNotTheFallback: typical !== undefined && (typical.charge !== fallback.charge || typical.coreRadius !== fallback.coreRadius),
    typicalIsTheDeclaredMean: (() => {
      const keys = DEFAULT_TAXONOMY.styleValues
      const mean = keys.reduce((s, k) => s + DEFAULT_TAXONOMY.styleOf(k).physics.charge, 0) / keys.length
      return typical !== undefined && Math.abs(typical.charge - mean) < 1e-9
    })(),
    springIsTypical: (() => {
      const ids = sorted(axisOptions(DEFAULT_TAXONOMY, graph).find(o => o.mapping.axis === SOURCE_FILE_DIMENSION)!.mapping.buckets.map(b => b.id))
      const edge: GraphEdge = { id: 's', sourceId: 'a', targetId: 'b', relation: 'dependency' }
      const a = syntheticNode('a', 'workflow', ids[0])
      const b = syntheticNode('b', 'activity', ids[0])
      const s = springFor(resolved.spring, edge, a, b)
      return { key: s.key ?? '(unbucketed)', strengthIsMiddling: Math.abs(s.strength - MIDDLING_SPRING.strength) < 1e-9 && Math.abs(s.distance - MIDDLING_SPRING.distance) < 1e-9 }
    })(),
  }
}

/** The filter axes the shipped spec declares — optional in the library's shape, always present in this host's. */
function shippedFilters(): readonly AxisDescriptor[] {
  const declared = DEFAULT_TAXONOMY_SPEC.filterAxes
  if (!declared) throw new Error('tuning-probes: the shipped spec declares no filter axes')
  return declared
}

/** A host rule that answers an id its table does not declare gets no category: the edge pulls nothing and is named by `validateGraph`, never thrown on. */
function membership(): Json {
  const rogue = createTaxonomy({ ...DEFAULT_TAXONOMY_SPEC, classifyEdge: () => 'notDeclaredAnywhere' })
  const params = defaultParamsFor(rogue)
  const spring = resolvePhysics(params, rogue).spring
  const edge: GraphEdge = { id: 'r', sourceId: 'a', targetId: 'b', relation: 'dependency' }
  // A rogue id from the host's rule is no category: the edge pulls nothing
  // rather than throwing in the force loop.
  let message = 'DID NOT THROW'
  let key: string | null = null
  try { key = springFor(spring, edge, syntheticNode('a', 'workflow', undefined), syntheticNode('b', 'activity', undefined)).key ?? null } catch (err) { message = err instanceof Error ? err.message : String(err) }
  return { throws: message !== 'DID NOT THROW', message, key }
}

/**
 * The visibility predicate reads the node for the kind AND the container for
 * the policy. A node without a kind is hidden under this taxonomy's
 * `absentMeans: 'hidden'`, and visible under a taxonomy that declares the other
 * answer — on the same nodes, which is what makes the second row injection.
 */
function visibilityPolicy(): Json {
  const at = (n: GraphNode): SimNode => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, pinned: false })
  const withKind = at(syntheticNode('k', 'workflow', 'a.twf'))
  const noKind: SimNode = { ...withKind, id: 'n', values: { ...withKind.values } }
  delete (noKind.values as Record<string, string>)[DEF_TYPE_DIMENSION]
  const source = { nodes: [withKind, noKind], edges: [], getNode: (id: string) => (id === 'k' ? withKind : id === 'n' ? noKind : undefined) }
  const allKinds = new Set(DEFAULT_TAXONOMY.styleValues.map(k => NODE_TYPE_REGISTRY[k as NodeType].defType))
  const filter = filterOfSets(allKinds, new Set<string>())
  const lenient = createTaxonomy({
    ...DEFAULT_TAXONOMY_SPEC,
    filterAxes: shippedFilters().map(d => d.id === DEF_TYPE_DIMENSION ? { ...d, absentMeans: 'visible' as const } : d),
  })
  return {
    shipped: sorted(computeVisibleGraph(source, filter, DEFAULT_TAXONOMY).visibleIds),
    lenient: sorted(computeVisibleGraph(source, filter, lenient).visibleIds),
  }
}

/** What the builders refuse, and the one thing identityMapping repairs. */
function coherence(): Json {
  const refusal = (f: () => unknown): string => {
    try { f(); return 'NOT REFUSED' } catch (err) { return err instanceof Error ? err.message : String(err) }
  }
  const namer = { id: 'probe', label: 'Probe', labelFor: (v: string) => v, abbreviationFor: (v: string) => v.slice(0, 2) }
  const spec = { ...DEFAULT_TAXONOMY_SPEC, edgeTypes: ALL_EDGE_TYPES }
  return {
    duplicateValue: refusal(() => createTaxonomy({ ...spec, styles: [...spec.styles, spec.styles[0]] })),
    edgeEndpointUndeclared: refusal(() => createTaxonomy({ ...spec, edgeTypes: [...spec.edgeTypes, { ...spec.edgeTypes[0], id: 'ghostLink', sourceValue: 'ghost' }] })),
    duplicateEdgeType: refusal(() => createTaxonomy({ ...spec, edgeTypes: [...spec.edgeTypes, spec.edgeTypes[0]] })),
    duplicateFilterAxis: refusal(() => createTaxonomy({ ...spec, filterAxes: [...shippedFilters(), shippedFilters()[0]] })),
    crossedBand: refusal(() => createTaxonomy({ ...spec, styles: spec.styles.map((v, i) => i === 0 ? { ...v, physics: { ...v.physics, band: { ...v.physics?.band, y: { min: 10, max: -10 } } } } : v) })),
    duplicateBucketId: refusal(() => createAxisMapping({ id: 'm', label: 'M', axis: 'probe', buckets: [
      { id: 'a', label: 'A', abbreviation: 'A', values: ['v1'] }, { id: 'a', label: 'A', abbreviation: 'A', values: ['v2'] }] })),
    emptyBucket: refusal(() => createAxisMapping({ id: 'm', label: 'M', axis: 'probe', buckets: [{ id: 'e', label: 'E', abbreviation: 'E', values: [] }] })),
    duplicateAbbreviationsNumbered: identityMapping(namer, ['nexus.twf', 'nexus2.twf', 'other.twf']).buckets.map(b => b.abbreviation),
  }
}

/**
 * An axis the host wrote on its nodes without declaring a filter for it is
 * offered for push, pull and layout like a declared one, labelled by its id;
 * a tuning on it survives a retune while the nodes carry it and returns to
 * the style axis, said once on the console, when they stop.
 */
function plainAxis(): Json {
  const withTerm = (id: string, term: string | undefined): GraphNode => {
    const n = syntheticNode(id, 'workflow', 'a.twf')
    return term === undefined ? n : { ...n, values: { ...n.values, term } }
  }
  const graph = graphOf([withTerm('n1', 'spring'), withTerm('n2', 'autumn'), withTerm('n3', 'spring')], [])
  const options = axisOptions(DEFAULT_TAXONOMY, graph)
  const term = options.find(o => o.mapping.axis === 'term')
  const params = defaultParamsFor(DEFAULT_TAXONOMY)
  const onTerm: ForceParams = { ...params, pair: pairTuning(term!.mapping), bandY: { mapping: term!.mapping, overrides: new Map() } }
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])) }
  let kept: ForceParams, fallen: ForceParams
  try {
    kept = retunedFor(onTerm, DEFAULT_TAXONOMY, graph)
    fallen = retunedFor(onTerm, DEFAULT_TAXONOMY, graphOf([withTerm('n1', undefined)], []))
  } finally {
    console.warn = warn
  }
  return {
    offered: options.map(o => `${o.mapping.axis}=${o.mapping.label}:${o.mapping.buckets.map(b => `${b.id}/${b.abbreviation}`).join(',')}`),
    keptOnTerm: kept.pair.mapping.axis === 'term' && (!isScalarTuning(kept.bandY) && kept.bandY.mapping.axis === 'term'),
    fellBackToStyle: fallen.pair.mapping.axis === DEFAULT_TAXONOMY.styleAxis() && (!isScalarTuning(fallen.bandY) && fallen.bandY.mapping.axis === DEFAULT_TAXONOMY.styleAxis()),
    saidOnce: warnings.length,
    said: warnings.map(w => w.replace(/^\[graph\] /, '')),
  }
}

export function tuningProbes(): Json {
  const graph = multifile()
  return {
    plainAxis: plainAxis(),
    overrides: overrides(graph),
    retune: retune(graph),
    foreignAxisPhysics: foreignAxisPhysics(graph),
    membership: membership(),
    visibilityPolicy: visibilityPolicy(),
    coherence: coherence(),
    layoutAxisKeys: layoutAxisKeys(graph),
  }
}

// The one spelling of a layout-axis choice: every option's
// key is distinct, and the tuning the control builds from an option answers
// to the option's own key — so the dropdown can never show a value the params
// do not hold.
function layoutAxisKeys(graph: Graph): Json {
  const options = layoutAxisOptions(axisOptions(DEFAULT_TAXONOMY, graph), DEFAULT_TAXONOMY)
  const keys = options.map(layoutAxisKey)
  const tunings = options.map(o => o.kind === 'scalar' ? { scalar: o.scalar.id } : { mapping: o.option.mapping, overrides: new Map() })
  return {
    keys,
    unique: new Set(keys).size === keys.length,
    roundTrip: tunings.every((t, i) => layoutAxisKey(t) === keys[i]),
  }
}
