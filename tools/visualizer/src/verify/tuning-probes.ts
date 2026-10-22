// Probes for the tuning layer — what D47 and D51 promise about overrides,
// retuning, the ceiling and the taxonomy's coherence, none of which a fixture
// reaches. Every fixture runs `defaultParamsFor`: identity multipliers, nothing
// overridden, every axis in range. So a dropped override, a stale mapping after
// a graph change, a ceiling that admitted anything, or a taxonomy whose four
// declarations of its value set disagreed would all have left every golden
// green. The Unit 4 review showed each of those sabotages passing; these rows
// are what now goes red.

import type { Graph, GraphEdge, GraphNode } from '../graph/model'
import type { NodeType } from '../adapter/node-types'
import { DEFAULT_ONTOLOGY, NODE_TYPE_REGISTRY, DEFAULT_ONTOLOGY_SPEC } from '../adapter/node-types'
import { dimensionsFor } from '../adapter/build'
import {
  Simulation, axisOptions, defaultParamsFor, fitsCeiling, pairTuning, retunedFor,
  withPushOverride, withSpringOverride, withOverride, TOKEN_CEILING,
} from '../graph/simulation'
import type { ForceParams, SimNode } from '../graph/simulation'
import { resolvePhysics, springFor } from '../graph/forces'
import { createOntology } from '../graph/ontology'
import {
  DEF_TYPE_DIMENSION, RELATION_DIMENSION, SOURCE_FILE_DIMENSION,
  createDimensionalMapping, identityMapping,
} from '../graph/dimension'
import { computeVisibleGraph } from '../components/graph-view/visibleGraph'
import { filterOfSets } from '../filter/types'
import { FIXTURES } from './fixtures'
import { buildFixtureGraph } from './tier-a'
import { mulberry32 } from './rng'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const SEED = 0x7a1e

function multifile(): Graph {
  const fixture = FIXTURES.find(f => f.name === 'multifile-sample')
  if (!fixture) throw new Error('tuning-probes: the multifile fixture is missing')
  return buildFixtureGraph(fixture)
}

function graphOf(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  return { nodes: new Map(nodes.map(n => [n.id, n])), edges, duplicateGroups: new Map() }
}

function syntheticNode(id: string, nodeType: NodeType, sourceFile: string | undefined): GraphNode {
  return { id, dimensions: dimensionsFor(nodeType, sourceFile), name: id, orphan: true, definitionKey: `${nodeType}:${id}` }
}

/** N files, one node each, chained by dependency edges — past the ceiling for N > 24. */
function manyFiles(n: number): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  for (let i = 0; i < n; i++) {
    nodes.push(syntheticNode(`n${i}`, 'workflow', `f${i}.twf`))
    if (i > 0) edges.push({ id: `e${i}`, sourceId: `n${i - 1}`, targetId: `n${i}`, dimensions: { [RELATION_DIMENSION]: 'dependency' } })
  }
  return graphOf(nodes, edges)
}

function without(graph: Graph, file: string): Graph {
  const keep = [...graph.nodes.values()].filter(n => n.dimensions[SOURCE_FILE_DIMENSION] !== file)
  const ids = new Set(keep.map(n => n.id))
  return graphOf(keep, graph.edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId)))
}

function fileAxisParams(graph: Graph): ForceParams {
  const option = axisOptions(DEFAULT_ONTOLOGY, graph).find(o => o.mapping.dimension === SOURCE_FILE_DIMENSION)
  if (!option) throw new Error('tuning-probes: the fixture offers no file axis')
  const params = defaultParamsFor(DEFAULT_ONTOLOGY)
  return { ...params, pair: withPushOverride(pairTuning(option.mapping), 'nexus.twf', { charge: -123, coreRadius: 45 }) }
}

const pushRow = (params: ForceParams, bucket: string): Json => {
  const v = resolvePhysics(params, DEFAULT_ONTOLOGY).push.byBucket.get(bucket)
  return v ? { charge: v.charge, coreRadius: v.coreRadius } : 'absent'
}

/**
 * The sparse override channel, end to end: resolution carries an override and
 * leaves its neighbours declared, and a Simulation given one moves differently
 * on its first tick. Two seeded simulations on one graph, one overridden.
 */
function overrides(graph: Graph): Json {
  const base = defaultParamsFor(DEFAULT_ONTOLOGY)
  const tuned: ForceParams = {
    ...base,
    pair: withSpringOverride(
      withPushOverride(base.pair, 'workflow', { charge: -123, coreRadius: 45 }),
      'linkWorkflowToActivity', { strength: 0.33, distance: 77 },
    ),
  }
  const resolved = resolvePhysics(tuned, DEFAULT_ONTOLOGY)
  const declared = resolvePhysics(base, DEFAULT_ONTOLOGY)
  const firstTick = (params: ForceParams): [number, number] => {
    const sim = new Simulation(graph, params, mulberry32(SEED), DEFAULT_ONTOLOGY)
    sim.tick()
    const n = sim.nodes.find(x => x.dimensions.temporalType === 'workflow')
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
  const reversed: Graph = { ...graph, nodes: new Map([...graph.nodes].reverse()) }
  const dropped = retunedFor(params, DEFAULT_ONTOLOGY, without(graph, 'task-queues.twf'))
  const fileless = retunedFor(params, DEFAULT_ONTOLOGY, graphOf([syntheticNode('x', 'workflow', undefined)], []))
  const big = manyFiles(30)
  const bigOption = axisOptions(DEFAULT_ONTOLOGY, big).find(o => o.mapping.dimension === SOURCE_FILE_DIMENSION)
  const outgrown = retunedFor(params, DEFAULT_ONTOLOGY, big)
  // A taxonomy with three of the seven types, derived from the spec (not by
  // spreading the built container): the style axis is the same, its buckets
  // are not, and the override on a surviving value must survive with it.
  const three = createOntology({
    ...DEFAULT_ONTOLOGY_SPEC,
    nodeTypeKeys: ['worker', 'workflow', 'activity'],
    nodeStyles: { worker: NODE_TYPE_REGISTRY.worker, workflow: NODE_TYPE_REGISTRY.workflow, activity: NODE_TYPE_REGISTRY.activity },
    styleGroups: [{ id: 'three', values: ['worker', 'workflow', 'activity'] }],
    abbreviations: { worker: 'Wk', workflow: 'Wf', activity: 'Act' },
  })
  const styled = defaultParamsFor(DEFAULT_ONTOLOGY)
  const styledTuned: ForceParams = {
    ...styled,
    pair: withPushOverride(styled.pair, 'worker', { charge: -1, coreRadius: 2 }),
    bandY: withOverride(styled.bandY, 'worker', { min: -5, max: 5 }),
  }
  const swapped = retunedFor(styledTuned, three, graph)
  return {
    unchangedGraphReturnsSameObject: retunedFor(params, DEFAULT_ONTOLOGY, graph) === params,
    reorderedNodesReturnSameObject: retunedFor(params, DEFAULT_ONTOLOGY, reversed) === params,
    fileDropped: {
      buckets: dropped.pair.mapping.buckets.map(b => b.id),
      overrideKept: dropped.pair.push.has('nexus.twf'),
      isNewObject: dropped !== params,
    },
    axisVanished: { axis: fileless.pair.mapping.dimension, overrides: fileless.pair.push.size },
    outgrown: {
      fileOption: bigOption ? { pushTokens: bigOption.pushTokens, pullTokens: bigOption.pullTokens, fits: fitsCeiling(bigOption) } : 'absent',
      ceiling: TOKEN_CEILING,
      fellBackTo: outgrown.pair.mapping.dimension,
    },
    taxonomySwapped: {
      pairBuckets: swapped.pair.mapping.buckets.map(b => b.id),
      bandBuckets: swapped.bandY.mapping.buckets.map(b => b.id),
      pushOverrideKept: swapped.pair.push.has('worker'),
      bandOverrideKept: swapped.bandY.overrides.has('worker'),
      sameTaxonomyReturnsSameObject: retunedFor(styledTuned, DEFAULT_ONTOLOGY, graph) === styledTuned,
    },
  }
}

/**
 * Off the style axis a bucket is not a style key. Its physics is the host's
 * typical declared value — the fold over every declared type — never the
 * fallback style's, and resolving it warns about nothing (the review found
 * every file bucket at the placeholder's -300/30 with a false warning each).
 */
function foreignAxisPhysics(graph: Graph): Json {
  const params = fileAxisParams(graph)
  const resolved = resolvePhysics(params, DEFAULT_ONTOLOGY)
  const typical = resolvePhysics({ ...params, pair: pairTuning(params.pair.mapping) }, DEFAULT_ONTOLOGY).push.byBucket.get('task-queues.twf')
  const fallback = DEFAULT_ONTOLOGY.styleForKey('not-a-style-key').physics
  return {
    buckets: sortedRecord([...resolved.push.byBucket].map(([k, v]) => [k, { charge: v.charge, coreRadius: v.coreRadius }] as const)),
    typicalIsNotTheFallback: typical !== undefined && (typical.charge !== fallback.charge || typical.coreRadius !== fallback.coreRadius),
    typicalIsTheDeclaredMean: (() => {
      const keys = DEFAULT_ONTOLOGY.nodeTypeKeys
      const mean = keys.reduce((s, k) => s + DEFAULT_ONTOLOGY.styleForKey(k).physics.charge, 0) / keys.length
      return typical !== undefined && Math.abs(typical.charge - mean) < 1e-9
    })(),
    springIsTypical: (() => {
      const ids = sorted(axisOptions(DEFAULT_ONTOLOGY, graph).find(o => o.mapping.dimension === SOURCE_FILE_DIMENSION)!.mapping.buckets.map(b => b.id))
      const edge: GraphEdge = { id: 's', sourceId: 'a', targetId: 'b', dimensions: { [RELATION_DIMENSION]: 'dependency' } }
      const a = syntheticNode('a', 'workflow', ids[0])
      const b = syntheticNode('b', 'activity', ids[0])
      const s = springFor(resolved.spring, edge, a, b)
      const declared = DEFAULT_ONTOLOGY.edgeTypes
      const mean = declared.reduce((t, e) => t + e.physics.strength, 0) / declared.length
      return { key: s.key ?? '(unbucketed)', strengthIsDeclaredMean: Math.abs(s.strength - mean) < 1e-9 }
    })(),
  }
}

/** A host rule that returns an id its table does not declare is a host bug, and it throws — in `springFor`, before any tick. */
function membership(): Json {
  const rogue = createOntology({ ...DEFAULT_ONTOLOGY_SPEC, resolveEdgeType: () => 'notDeclaredAnywhere' })
  const params = defaultParamsFor(rogue)
  const spring = resolvePhysics(params, rogue).spring
  const edge: GraphEdge = { id: 'r', sourceId: 'a', targetId: 'b', dimensions: { [RELATION_DIMENSION]: 'dependency' } }
  let message = 'DID NOT THROW'
  try { springFor(spring, edge, syntheticNode('a', 'workflow', undefined), syntheticNode('b', 'activity', undefined)) } catch (err) { message = err instanceof Error ? err.message : String(err) }
  return { throws: message !== 'DID NOT THROW', message }
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
  const noKind: SimNode = { ...withKind, id: 'n', dimensions: { ...withKind.dimensions } }
  delete (noKind.dimensions as Record<string, string>)[DEF_TYPE_DIMENSION]
  const source = { nodes: [withKind, noKind], edges: [], getNode: (id: string) => (id === 'k' ? withKind : id === 'n' ? noKind : undefined) }
  const allKinds = new Set(DEFAULT_ONTOLOGY.nodeTypeKeys.map(k => NODE_TYPE_REGISTRY[k as NodeType].defType))
  const filter = filterOfSets(allKinds, new Set<string>())
  const lenient = createOntology({
    ...DEFAULT_ONTOLOGY_SPEC,
    filterDimensions: DEFAULT_ONTOLOGY_SPEC.filterDimensions.map(d => d.id === DEF_TYPE_DIMENSION ? { ...d, absentMeans: 'visible' as const } : d),
  })
  return {
    shipped: sorted(computeVisibleGraph(source, filter, DEFAULT_ONTOLOGY).visibleIds),
    lenient: sorted(computeVisibleGraph(source, filter, lenient).visibleIds),
  }
}

/** What the builders refuse, and the one thing identityMapping repairs. */
function coherence(): Json {
  const refusal = (f: () => unknown): string => {
    try { f(); return 'NOT REFUSED' } catch (err) { return err instanceof Error ? err.message : String(err) }
  }
  const namer = { id: 'probe', label: 'Probe', labelFor: (v: string) => v, abbreviationFor: (v: string) => v.slice(0, 2) }
  return {
    ghostKey: refusal(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, nodeTypeKeys: [...DEFAULT_ONTOLOGY_SPEC.nodeTypeKeys, 'ghost'] })),
    undeclaredStyle: refusal(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, nodeStyles: { ...DEFAULT_ONTOLOGY_SPEC.nodeStyles, ghost: NODE_TYPE_REGISTRY.worker } })),
    groupOutsideKeys: refusal(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, styleGroups: [{ id: 'g', values: ['ghost'] }] })),
    duplicateBucketId: refusal(() => createDimensionalMapping({ id: 'm', label: 'M', dimension: 'probe', buckets: [
      { id: 'a', label: 'A', abbreviation: 'A', values: ['v1'] }, { id: 'a', label: 'A', abbreviation: 'A', values: ['v2'] }] })),
    emptyBucket: refusal(() => createDimensionalMapping({ id: 'm', label: 'M', dimension: 'probe', buckets: [{ id: 'e', label: 'E', abbreviation: 'E', values: [] }] })),
    duplicateAbbreviationsNumbered: identityMapping(namer, ['nexus.twf', 'nexus2.twf', 'other.twf']).buckets.map(b => b.abbreviation),
  }
}

export function tuningProbes(): Json {
  const graph = multifile()
  return {
    overrides: overrides(graph),
    retune: retune(graph),
    foreignAxisPhysics: foreignAxisPhysics(graph),
    membership: membership(),
    visibilityPolicy: visibilityPolicy(),
    coherence: coherence(),
  }
}
