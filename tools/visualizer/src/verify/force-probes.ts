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

import {
  applyBandGravity,
  applyCenterGravity,
  applyChargeForce,
  applyLinkForce,
  applyTopologicalGravity,
} from '../graph/forces'
import type { EdgeTypeDefinition } from '../graph/edge-types'
import type { GraphEdge, NodeType } from '../graph/model'
import { DEFAULT_ONTOLOGY } from '../graph/node-types'
import { DEFAULT_PARAMS } from '../graph/simulation'
import type { ForceParams, SimNode } from '../graph/simulation'
import { mulberry32 } from './rng'
import type { Json } from './snapshot'
import { sortedRecord } from './snapshot'

const PROBE_SEED = 0x5eed

function node(id: string, nodeType: NodeType, x: number, y: number): SimNode {
  return {
    id,
    nodeType,
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
  run(nodes, { ...DEFAULT_PARAMS }, mulberry32(PROBE_SEED))
  return {
    allFinite: allFinite(nodes),
    nonFiniteNodeIds: nonFinite(nodes),
    velocities: velocities(nodes),
  }
}

const PROBE_EDGES: GraphEdge[] = [
  { id: 'p0', edgeType: 'containment', sourceId: 'wf', targetId: 'wk', sourceNodeType: 'workflow', targetNodeType: 'worker' },
  { id: 'p1', edgeType: 'containment', sourceId: 'op', targetId: 'nx', sourceNodeType: 'nexusOperation', targetNodeType: 'nexusService' },
  { id: 'p2', edgeType: 'dependency', sourceId: 'wf', targetId: 'act', sourceNodeType: 'workflow', targetNodeType: 'activity' },
  { id: 'p3', edgeType: 'dependency', sourceId: 'ns', targetId: 'ep', sourceNodeType: 'namespace', targetNodeType: 'nexusEndpoint' },
  { id: 'p4', edgeType: 'dependency', sourceId: 'wf', targetId: 'op', sourceNodeType: 'workflow', targetNodeType: 'nexusOperation' },
  // The coincident pair, so the link force takes its degenerate branch too.
  { id: 'p5', edgeType: 'dependency', sourceId: 'dupA', targetId: 'dupB', sourceNodeType: 'activity', targetNodeType: 'workflow' },
]

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
    nodes.push(node('unknown', 'notADeclaredType' as NodeType, 300, -400))
    return nodes
  }
  const run = (apply: (nodes: SimNode[], params: ForceParams, rng: () => number) => void): Json => {
    const nodes = withUnknown()
    apply(nodes, { ...DEFAULT_PARAMS }, mulberry32(PROBE_SEED))
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
  // An edge category the param maps do not declare, which is what a supplied
  // taxonomy produces: its ids are its own, and `params.link` is keyed by the
  // shipped ones.
  const undeclaredEdgeCategory = () => {
    const nodes = withUnknown()
    const map = new Map(nodes.map(n => [n.id, n]))
    applyLinkForce(
      PROBE_EDGES, map, { ...DEFAULT_PARAMS }, 1, mulberry32(PROBE_SEED),
      () => ({
        id: 'linkNotDeclaredAnywhere' as EdgeTypeDefinition['id'],
        label: '??', sourceType: 'workflow', targetType: 'workflow',
        category: 'dependency', directional: false,
        physics: { strength: 1, distance: 1 }, tooltip: '',
      }),
    )
    return {
      allFinite: allFinite(nodes),
      nonFiniteNodeIds: nonFinite(nodes),
      velocities: velocities(nodes),
    }
  }
  return {
    charge: run((nodes, params, rng) => applyChargeForce(nodes, params, 1, rng)),
    bandCartesian: run((nodes, params, rng) =>
      applyBandGravity(nodes, { ...params, gravityMode: 'cartesian' }, 1, rng)),
    bandRadial: run((nodes, params, rng) =>
      applyBandGravity(nodes, { ...params, gravityMode: 'radial' }, 1, rng)),
    undeclaredEdgeCategory: undeclaredEdgeCategory(),
  }
}

export function forceProbes(): Json {
  return {
    seed: PROBE_SEED,
    absentValue: absentValueProbes(),
    charge: probe((nodes, params, rng) => applyChargeForce(nodes, params, 1, rng)),
    link: probe((nodes, params, rng) => {
      const map = new Map(nodes.map(n => [n.id, n]))
      applyLinkForce(PROBE_EDGES, map, params, 1, rng, DEFAULT_ONTOLOGY.resolveEdgeType)
    }),
    bandCartesian: probe((nodes, params, rng) =>
      applyBandGravity(nodes, { ...params, gravityMode: 'cartesian' }, 1, rng)),
    // Includes a node sitting exactly on the origin, where the ring pull has no
    // defined direction and the kernel must kick it somewhere.
    bandRadial: (() => {
      const nodes = probeNodes()
      nodes.push(node('origin', 'workflow', 0, 0))
      applyBandGravity(nodes, { ...DEFAULT_PARAMS, gravityMode: 'radial' }, 1, mulberry32(PROBE_SEED))
      return {
        allFinite: allFinite(nodes),
        nonFiniteNodeIds: nonFinite(nodes),
        velocities: velocities(nodes),
      }
    })(),
    topological: probe((nodes, params) => {
      const scores = new Map(nodes.map((n, i) => [n.id, (i + 1) / nodes.length]))
      applyTopologicalGravity(nodes, { ...params, gravityDownstream: 0.4 }, 1, scores)
    }),
    topologicalRadial: probe((nodes, params) => {
      const scores = new Map(nodes.map((n, i) => [n.id, (i + 1) / nodes.length]))
      applyTopologicalGravity(
        nodes, { ...params, gravityDownstream: 0.4, gravityMode: 'radial' }, 1, scores,
      )
    }),
    center: probe((nodes, params) => {
      applyCenterGravity(nodes, { ...params, gravityCenter: 0.3 }, 1)
    }),
  }
}
