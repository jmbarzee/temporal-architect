// Tier B — the simulation.
//
// Two kinds of row, for two different reasons.
//
// **Positions, goldened exactly, at tick 0 and after a handful of ticks.** These
// are what make the layout observable at all. The seeded start positions are
// bit-exact everywhere — mulberry32 is integer arithmetic plus one division by
// 2^32, and the jitter that consumes it is only `+ - * Math.max` — so a
// reordered, dropped or added draw moves them. A short run keeps that property:
// the transcendental functions in the kernels may differ by a last place, but
// with no iteration to amplify it the error stays ~1e-11 against a rounding grid
// of 1e-6. This is deliberately NOT a 400-tick position snapshot, which would be
// flaky: chaotic amplification over 200 active ticks is real, and it is what the
// invariants-not-positions rule was written about.
//
// **Structural invariants after the full run**, which no coordinate reaches:
// entry counts, distinct-value counts, the tick at which cooling completes.
//
// What is measured but deliberately NOT goldened: band occupancy and the mean
// speed at rest. Both are chaotic float-derived aggregates over the full run, and
// both are printed as diagnostics instead. See DECISIONS.md D24 and D26.

import { filterOfSets } from '../filter/types'
import { bandCenters, bandFor } from '../graph/forces'
import type { Graph } from '../graph/model'
import { defaultParamsFor, Simulation } from '../graph/simulation'
import type { ForceParams, SimNode } from '../graph/simulation'
import { computeVisibleGraph } from '../components/graph-view/visibleGraph'
import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY, DEFAULT_ONTOLOGY } from '../adapter/node-types'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'
import { mulberry32 } from './rng'

/** Committed alongside the goldens so a re-run is reproducible. */
export const TIER_B_PARAMS = {
  rngSeed: 0x5eed,
  tickCount: 400,
  /**
   * Ticks for the goldened position rows. Small on purpose: long enough that
   * every enabled force has visibly moved every node, short enough that a
   * last-place difference in Math.pow cannot grow to the 1e-6 rounding grid.
   */
  shortTicks: 3,
  /** Fraction of a band's height a node may sit outside it by. */
  bandTolerance: 0.05,
  /** Mean speed below `alphaMin × settledFactor` counts as at rest. */
  settledFactor: 10,
  /** Collapse detectors, both an order of magnitude clear of a healthy layout. */
  maxAbsPosition: 1e5,
  minExtent: 1,
} as const

/** A fresh, seeded simulation over a fixture's graph. */
export function seededSimulation(graph: Graph, params: ForceParams = defaultParamsFor(DEFAULT_ONTOLOGY)): Simulation {
  return new Simulation(graph, params, mulberry32(TIER_B_PARAMS.rngSeed), DEFAULT_ONTOLOGY)
}

function positions(nodes: SimNode[]): Json {
  const entries: [string, Json][] = nodes.map(n => [n.id, [n.x, n.y] as Json])
  return sortedRecord(entries)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = s.length
  return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2
}

/**
 * The four force configurations the control panel can actually produce. The
 * defaults reach only one of them, so without this the radial branch, the
 * topological pull and the center-gravity baseline are dead code as far as every
 * gate is concerned.
 */
function scenarios(): [string, ForceParams][] {
  return [
    ['default', defaultParamsFor(DEFAULT_ONTOLOGY)],
    ['radial', { ...defaultParamsFor(DEFAULT_ONTOLOGY), gravityMode: 'radial' }],
    ['topological', { ...defaultParamsFor(DEFAULT_ONTOLOGY), topologicalEnabled: true, gravityDownstream: 0.4 }],
    ['centerOnly', { ...defaultParamsFor(DEFAULT_ONTOLOGY), bandEnabled: false, topologicalEnabled: false }],
  ]
}

const ALL_DEF_TYPES = new Set(ALL_NODE_TYPES.map(t => NODE_TYPE_REGISTRY[t].defType))

export function tierB(fixtureName: string, graph: Graph): Json {
  // ── Seeding. Bit-exact, and the only detector for a change to the order or
  // count of draws — which the units that rewrite seeding and the charge loop
  // will both make.
  const seedSim = seededSimulation(graph)
  const seeded = positions(seedSim.nodes)

  // `seedAt` is the other half of the seeding path and is reached by no fixture
  // run: it fires only when a filter toggle reveals a node. Two more draws.
  const seedAtProbe = (() => {
    const sim = seededSimulation(graph)
    const first = [...graph.nodes.keys()].sort()[0]
    if (first === undefined) return null
    sim.seedAt(first, 111, 222)
    const n = sim.getNode(first)
    return n ? { id: first, position: [n.x, n.y] as Json } : null
  })()

  // Downstream scores, needed by the topological scenario.
  const scoreSim = seededSimulation(graph)
  const vg = computeVisibleGraph(scoreSim, filterOfSets(ALL_DEF_TYPES, new Set<string>()), DEFAULT_ONTOLOGY)

  // ── Short runs, one per force configuration. Positions goldened exactly.
  const shortRuns: [string, Json][] = scenarios().map(([name, params]) => {
    const sim = seededSimulation(graph, params)
    for (let i = 0; i < TIER_B_PARAMS.shortTicks; i++) {
      sim.tick(undefined, vg.downstreamScores)
    }
    return [name, positions(sim.nodes)]
  })

  // ── The full run, for the structural invariants and the diagnostics.
  const sim = seededSimulation(graph)
  let ticksToStable = -1
  for (let i = 0; i < TIER_B_PARAMS.tickCount; i++) {
    sim.tick(undefined, vg.downstreamScores)
    if (ticksToStable < 0 && sim.isStable()) ticksToStable = i + 1
  }

  const active = sim.nodes
  const params = sim.params

  const nonFinite = active
    .filter(n => ![n.x, n.y, n.vx, n.vy].every(Number.isFinite))
    .map(n => n.id)

  // One band centre per distinct type present. The detector for the
  // value-vs-identity trap: a selection keyed by identity rather than by an
  // interned value silently degenerates to one entry per node, and nothing else
  // in the simulation notices. Asserted on the count of ENTRIES COLLECTED, never
  // on distinct centre *values* — several types deliberately share a band, so
  // with all 7 present there are only 4 distinct values.
  const centers = bandCenters(active, params)
  const distinctTypesPresent = new Set(active.map(n => DEFAULT_ONTOLOGY.valueFor(n))).size

  let maxAbs = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of active) {
    maxAbs = Math.max(maxAbs, Math.abs(n.x), Math.abs(n.y))
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  const extent = active.length === 0 ? 0 : Math.hypot(maxX - minX, maxY - minY)

  // ── Diagnostics: chaotic, deliberately not goldened.
  const shift = median(centers)
  let outsideBand = 0
  for (const n of active) {
    const band = bandFor(params, n)
    const slack = Math.abs(band.yMax - band.yMin) * TIER_B_PARAMS.bandTolerance
    if (!(n.y >= band.yMin - shift - slack && n.y <= band.yMax - shift + slack)) outsideBand++
  }
  const meanSpeed = active.length === 0
    ? 0
    : active.reduce((sum: number, n: SimNode) => sum + Math.hypot(n.vx, n.vy), 0) / active.length
  console.error(
    `[tier-b] ${fixtureName}: nodes=${active.length} ticksToStable=${ticksToStable} ` +
    `meanSpeedAtRest=${meanSpeed.toExponential(3)} ` +
    `(threshold ${(params.alphaMin * TIER_B_PARAMS.settledFactor).toExponential(3)}) ` +
    `outsideBand=${outsideBand}/${active.length} extent=${extent.toFixed(1)}`,
  )

  return {
    params: { ...TIER_B_PARAMS },
    activeNodeCount: active.length,
    seededPositions: seeded,
    seedAt: seedAtProbe,
    afterShortRun: sortedRecord(shortRuns),
    allFinite: nonFinite.length === 0,
    nonFiniteNodeIds: sorted(nonFinite),
    bandCenterEntries: centers.length,
    distinctTypesPresent,
    bandCentersMatchDistinctTypes: centers.length === distinctTypesPresent,
    distinctCenterValues: new Set(centers).size,
    boundedPositions: maxAbs < TIER_B_PARAMS.maxAbsPosition,
    nonDegenerateExtent: extent > TIER_B_PARAMS.minExtent,
    ticksToStable,
    stableWithinTickBudget: ticksToStable > 0,
  }
}
