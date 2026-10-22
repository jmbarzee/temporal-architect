// Direct probes of the five force kernels.
//
// Fixture-independent, and the only place three of the kernels execute at all:
// the defaults enable Band gravity in cartesian mode, so Topological, Center and
// the radial band branch are never reached by a fixture run. Each probe builds a
// handful of nodes at hand-chosen positions, calls ONE kernel with a seeded
// generator and alpha = 1, and records the resulting velocities.
//
// Three things this buys that a fixture run cannot:
//
//   1. **It reads velocities before the simulation sanitizes them.**
//      `Simulation.tick` resets any non-finite velocity to 0 and clamps
//      positions, so a NaN produced inside a force is invisible downstream —
//      which makes a post-tick "no NaN" assertion a tautology. The missing-key
//      path is exactly this: `coreRadiusFor` returns NaN for an unmapped
//      key and its Math.max floor swallows the miss. These probes are the only
//      detector for it.
//   2. **It reaches every draw site deterministically.** The degenerate frames
//      that consume randomness — two coincident nodes, a node exactly on the
//      origin under radial gravity — essentially never occur in a fixture, so
//      four of the nine injected sites would otherwise never execute.
//   3. **It is bit-stable.** One kernel invocation from fixed inputs, with no
//      iteration to amplify a last-place difference, rounds identically
//      everywhere.

import { RELATION_DIMENSION, createDimensionalMapping } from '../graph/dimension'
import {
  applyBandGravity,
  resolvePhysics,
  applyCenterGravity,
  applyChargeForce,
  applyLinkForce,
  applyTopologicalGravity,
  layoutFrame,
  presentSpringCategories,
  springFor,
} from '../graph/forces'
import type { EdgeCategory, ResolvedSprings } from '../graph/forces'
import type { GraphEdge } from '../graph/model'
import type { NodeType } from '../adapter/node-types'
import { DEFAULT_ONTOLOGY } from '../adapter/node-types'
import { dimensionsFor } from '../adapter/build'
import { defaultParamsFor, pairTuning, withPushOverride } from '../graph/simulation'
import type { ForceParams, SimNode } from '../graph/simulation'
import { mulberry32 } from './rng'
import { TEMPORAL_TYPE_DIMENSION } from '../adapter/node-types'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const PROBE_SEED = 0x5eed

// Projected by the adapter's own rule, so a probe node carries every axis a
// built node does and the kernel probes can run on any of them.
function node(id: string, nodeType: NodeType, x: number, y: number): SimNode {
  return {
    id,
    dimensions: dimensionsFor(nodeType, undefined),
    name: id,
    orphan: false,
    definitionKey: `${nodeType}:${id}`,
    x,
    y,
    vx: 0,
    vy: 0,
    pinned: false,
  }
}

// A node on a style key the taxonomy does not declare. Built by hand: the
// adapter's projection cannot place a type the registry lacks, and would not
// be asked to — `nodeTypeFromKind` refuses the kind first.
function undeclaredNode(id: string, x: number, y: number): SimNode {
  return { ...node(id, 'workflow', x, y), dimensions: { [TEMPORAL_TYPE_DIMENSION]: 'notADeclaredType' } }
}

/**
 * One node of every type, plus a deliberately COINCIDENT pair. The pair is what
 * drives a force into its degenerate branch, where the only sane direction is a
 * random one.
 */
function probeNodes(): SimNode[] {
  return [
    node('ns', 'namespace', -300, -260),
    node('ep', 'nexusEndpoint', 240, -200),
    node('wk', 'worker', -120, 40),
    node('nx', 'nexusService', 180, -20),
    node('wf', 'workflow', -60, 300),
    node('op', 'nexusOperation', 120, 260),
    node('act', 'activity', 20, 480),
    // Coincident: dist² = 0 < 0.01 in charge, dist = 0 < 0.1 in link.
    node('dupA', 'activity', 55.5, -12.25),
    node('dupB', 'workflow', 55.5, -12.25),
  ]
}

/** Velocities after a kernel ran, rounded by the snapshot canonicalizer. */
function velocities(nodes: SimNode[]): Json {
  const entries: [string, Json][] = nodes.map(n => [n.id, [n.vx, n.vy] as Json])
  return sortedRecord(entries)
}

/** True when every velocity is finite — read BEFORE any sanitizing clamp. */
function allFinite(nodes: SimNode[]): boolean {
  return nodes.every(n => Number.isFinite(n.vx) && Number.isFinite(n.vy))
}

function nonFinite(nodes: SimNode[]): string[] {
  return nodes.filter(n => !Number.isFinite(n.vx) || !Number.isFinite(n.vy)).map(n => n.id).sort()
}

function probe(run: (nodes: SimNode[], params: ForceParams, rng: () => number) => void): Json {
  const nodes = probeNodes()
  run(nodes, defaultParamsFor(DEFAULT_ONTOLOGY), mulberry32(PROBE_SEED))
  return {
    allFinite: allFinite(nodes),
    nonFiniteNodeIds: nonFinite(nodes),
    velocities: velocities(nodes),
  }
}

const PROBE_EDGES: GraphEdge[] = [
  { id: 'p0', sourceId: 'wf', targetId: 'wk', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  { id: 'p1', sourceId: 'op', targetId: 'nx', dimensions: { [RELATION_DIMENSION]: 'containment' } },
  { id: 'p2', sourceId: 'wf', targetId: 'act', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
  { id: 'p3', sourceId: 'ns', targetId: 'ep', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
  { id: 'p4', sourceId: 'wf', targetId: 'op', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
  // The coincident pair, so the link force takes its degenerate branch too.
  { id: 'p5', sourceId: 'dupA', targetId: 'dupB', dimensions: { [RELATION_DIMENSION]: 'dependency' } },
]

/** An edge from the undeclared node, for the probes that add one. */
const UNKNOWN_EDGE: GraphEdge = { id: 'pu', sourceId: 'unknown', targetId: 'wf', dimensions: { [RELATION_DIMENSION]: 'dependency' } }

function nodeMapOf(nodes: SimNode[]): Map<string, SimNode> {
  return new Map(nodes.map(n => [n.id, n]))
}

function nodeAt(map: Map<string, SimNode>, id: string): SimNode {
  const n = map.get(id)
  if (!n) throw new Error(`probe edge references no node ${JSON.stringify(id)}`)
  return n
}

/** The band kernel as the simulation runs it: in the frame over the nodes it is given. */
function bandGravity(nodes: SimNode[], params: ForceParams, rng: () => number): void {
  const resolved = resolvePhysics(params, DEFAULT_ONTOLOGY)
  applyBandGravity(nodes, params, resolved, layoutFrame(nodes, resolved), 1, rng)
}

/** What the simulation hands the link kernel: each edge's category, classified against the resolved springs. */
function categoryOf(spring: ResolvedSprings, map: Map<string, SimNode>): (edge: GraphEdge) => EdgeCategory {
  return edge => springFor(spring, edge, nodeAt(map, edge.sourceId), nodeAt(map, edge.targetId))
}

/**
 * The same probes, with one node carrying a key the param maps do not declare.
 *
 * This is the permanent check for the defaulting accessors. Before them, this
 * input failed three different silent ways in three different kernels: charge
 * read `undefined`, core radius produced a NaN that its `Math.max` floor hid
 * and that reached velocity two lines later, and the band dereferenced
 * `undefined` and threw. Every velocity below must be finite, and the unknown
 * node must sit inert rather than pushing anything around.
 */
function absentValueProbes(): Json {
  const withUnknown = () => {
    const nodes = probeNodes()
    nodes.push(undeclaredNode('unknown', 300, -400))
    return nodes
  }
  const run = (apply: (nodes: SimNode[], params: ForceParams, rng: () => number) => void): Json => {
    const nodes = withUnknown()
    apply(nodes, defaultParamsFor(DEFAULT_ONTOLOGY), mulberry32(PROBE_SEED))
    return {
      allFinite: allFinite(nodes),
      nonFiniteNodeIds: nonFinite(nodes),
      // EVERY node's velocity, not just the unknown one's. The fallback physics
      // is not inert — a zero charge still couples through the pair average, and
      // an origin band still moves the median the stack re-centres on — so the
      // rows that matter are the DECLARED nodes': they are what a change to the
      // fallback policy would silently move.
      velocities: velocities(nodes),
    }
  }
  return {
    charge: run((nodes, params, rng) => applyChargeForce(nodes, params, resolvePhysics(params, DEFAULT_ONTOLOGY), 1, rng)),
    bandCartesian: run((nodes, params, rng) => bandGravity(nodes, { ...params, radial: false }, rng)),
    bandRadial: run((nodes, params, rng) => bandGravity(nodes, { ...params, radial: true }, rng)),
    // The unknown node's edge reaches the host's rule with an undefined bucket
    // and falls to its catch-all, so it still pulls; under a mapping (below) the
    // same edge is unbucketed and inert. Both are pinned.
    link: run((nodes, params, rng) =>
      applyLinkForce([...PROBE_EDGES, UNKNOWN_EDGE], nodeMapOf(nodes), params, categoryOf(resolvePhysics(params, DEFAULT_ONTOLOGY).spring, nodeMapOf(nodes)), 1, rng)),
  }
}

/**
 * The kernels under parameters that are NOT the defaults. Every other probe
 * runs `defaultParamsFor`, whose multipliers are 1.0 and whose declared values
 * are small integers, so dropping a multiplier, an exponent or float precision
 * inside a kernel changed nothing at the rounding grid (the Unit 4 review ran
 * three such sabotages green). These rows run each kernel with every scalar off
 * its identity and one non-integer override.
 */
function nonIdentityParams(): Json {
  const base = defaultParamsFor(DEFAULT_ONTOLOGY)
  const params: ForceParams = {
    ...base,
    pushMultiplier: 0.9, coreRadiusMultiplier: 1.7, chargeExponent: 0.85,
    pullMultiplier: 1.1, distanceMultiplier: 0.35, linkExponent: 1.3,
    gravityX: 0.07, gravityY: 0.11, gravityBandExp: 1.4,
    pair: withPushOverride(base.pair, 'workflow', { charge: -333.3, coreRadius: 17.25 }),
  }
  const resolved = resolvePhysics(params, DEFAULT_ONTOLOGY)
  const kernel = (apply: (nodes: SimNode[], rng: () => number) => void): Json => {
    const nodes = probeNodes()
    apply(nodes, mulberry32(PROBE_SEED))
    return { allFinite: allFinite(nodes), velocities: velocities(nodes) }
  }
  return {
    charge: kernel((nodes, rng) => applyChargeForce(nodes, params, resolved, 1, rng)),
    link: kernel((nodes, rng) => applyLinkForce(PROBE_EDGES, nodeMapOf(nodes), params, categoryOf(resolved.spring, nodeMapOf(nodes)), 1, rng)),
    bandCartesian: kernel((nodes, rng) => applyBandGravity(nodes, { ...params, radial: false }, resolved, layoutFrame(nodes, resolved), 1, rng)),
  }
}

/**
 * Springs on a MAPPED axis: two buckets over the style axis, so the host's
 * table cannot apply and the pair rule must. The identity row pins the gate
 * from the other side — the declared categories, in the host's order — and the
 * classified keys are the hover and override ids a control surface will show.
 */
function mappedAxisSprings(): Json {
  const params = defaultParamsFor(DEFAULT_ONTOLOGY)
  const mapping = createDimensionalMapping({
    id: 'probe:two', label: 'two', dimension: TEMPORAL_TYPE_DIMENSION,
    buckets: [
      { id: 'control', label: 'control', abbreviation: 'C', values: ['namespace', 'worker', 'nexusEndpoint'] },
      { id: 'work', label: 'work', abbreviation: 'W', values: ['workflow', 'activity', 'nexusService', 'nexusOperation'] },
    ],
  })
  const identity = resolvePhysics(params, DEFAULT_ONTOLOGY).spring
  const mappedPhysics = resolvePhysics({ ...params, pair: pairTuning(mapping) }, DEFAULT_ONTOLOGY)
  const mapped = mappedPhysics.spring
  const edges = [...PROBE_EDGES, UNKNOWN_EDGE]
  const nodes = probeNodes()
  nodes.push(undeclaredNode('unknown', 300, -400))
  const map = nodeMapOf(nodes)
  const classify = (spring: typeof mapped) =>
    sortedRecord(edges.map(e => [e.id, springFor(spring, e, nodeAt(map, e.sourceId), nodeAt(map, e.targetId)).key ?? '(unbucketed)'] as const))
  applyLinkForce(edges, map, params, categoryOf(mapped, map), 1, mulberry32(PROBE_SEED))
  return {
    identityDeclared: DEFAULT_ONTOLOGY.edgeTypes.map(e => e.id).filter(id => identity.describe(id) !== undefined),
    identityClassified: classify(identity),
    // The pair rule enumerates nothing; its categories are the ones present.
    mappedPresent: sorted(presentSpringCategories(mapped, edges, id => map.get(id))),
    mappedClassified: classify(mapped),
    // The multi-value fold (D47): a bucket's declared push is the mean of its
    // values', its band the union — pinned here where a bucket has several.
    mappedPush: sortedRecord([...mappedPhysics.push.byBucket].map(([k, v]) => [k, { charge: v.charge, coreRadius: v.coreRadius }] as const)),
    allFinite: allFinite(nodes),
    nonFiniteNodeIds: nonFinite(nodes),
    velocities: velocities(nodes),
  }
}

export function forceProbes(): Json {
  return {
    seed: PROBE_SEED,
    absentValue: absentValueProbes(),
    charge: probe((nodes, params, rng) => applyChargeForce(nodes, params, resolvePhysics(params, DEFAULT_ONTOLOGY), 1, rng)),
    link: probe((nodes, params, rng) =>
      applyLinkForce(PROBE_EDGES, nodeMapOf(nodes), params, categoryOf(resolvePhysics(params, DEFAULT_ONTOLOGY).spring, nodeMapOf(nodes)), 1, rng)),
    mappedAxisSprings: mappedAxisSprings(),
    nonIdentityParams: nonIdentityParams(),
    bandCartesian: probe((nodes, params, rng) => bandGravity(nodes, { ...params, radial: false }, rng)),
    // Includes a node sitting exactly on the origin, where the ring pull has no
    // defined direction and the kernel must kick it somewhere.
    bandRadial: (() => {
      const nodes = probeNodes()
      nodes.push(node('origin', 'workflow', 0, 0))
      bandGravity(nodes, { ...defaultParamsFor(DEFAULT_ONTOLOGY), radial: true }, mulberry32(PROBE_SEED))
      return {
        allFinite: allFinite(nodes),
        nonFiniteNodeIds: nonFinite(nodes),
        velocities: velocities(nodes),
      }
    })(),
    topological: probe((nodes, params) => {
      const scores = new Map(nodes.map((n, i) => [n.id, (i + 1) / nodes.length]))
      applyTopologicalGravity(nodes, { ...params, gravityTopological: 0.4 }, 1, scores)
    }),
    topologicalRadial: probe((nodes, params) => {
      const scores = new Map(nodes.map((n, i) => [n.id, (i + 1) / nodes.length]))
      applyTopologicalGravity(
        nodes, { ...params, gravityTopological: 0.4, radial: true }, 1, scores,
      )
    }),
    center: probe((nodes, params) => {
      applyCenterGravity(nodes, { ...params, gravityCenter: 0.3 }, 1)
    }),
  }
}
