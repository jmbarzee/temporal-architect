// Tier B — invariants, not positions.
//
// `Math.pow`, `Math.hypot` and the trig functions are not guaranteed
// bit-identical across V8 versions or platforms, and 200 active ticks of an
// O(n²) force loop amplifies a one-ULP difference into a visibly different
// layout. A position snapshot would therefore be flaky between a dev machine
// and CI — and a layout differing by 0.3px does not matter. A layout
// *collapsing* does.
//
// So the golden carries only facts that are structural (counts of types, of
// entries, of ticks — no coordinate reaches them) or that hold with an
// order-of-magnitude margin (finite, bounded, non-degenerate). The genuinely
// positional measurements — band occupancy and the speed at rest — are computed
// on every run and printed as diagnostics, because goldening a chaotic float
// -derived count would produce a gate that goes red for the wrong reason. See
// DECISIONS.md D24.

import { bandCenters, bandForType } from '../graph/forces'
import type { Graph, NodeType } from '../graph/model'
import { DEFAULT_PARAMS, Simulation } from '../graph/simulation'
import type { SimNode } from '../graph/simulation'
import type { Json } from './snapshot'
import { sorted } from './snapshot'
import { mulberry32 } from './rng'

/** Committed alongside the goldens so a re-run is reproducible. */
export const TIER_B_PARAMS = {
  rngSeed: 0x5eed,
  tickCount: 400,
  /** Fraction of a band's height a node may sit outside it by. */
  bandTolerance: 0.05,
  /** Mean speed below `alphaMin × settledFactor` counts as at rest. */
  settledFactor: 10,
  /**
   * Collapse detectors, both an order of magnitude clear of anything a healthy
   * layout produces: positions stay well inside the engine's own 1e6 clamp, and
   * the whole graph does not converge onto a single point.
   */
  maxAbsPosition: 1e5,
  minExtent: 1,
} as const

/** A fresh, seeded simulation over a fixture's graph. */
export function seededSimulation(graph: Graph): Simulation {
  return new Simulation(graph, DEFAULT_PARAMS, mulberry32(TIER_B_PARAMS.rngSeed))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = s.length
  return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2
}

export function tierB(fixtureName: string, sim: Simulation): Json {
  // Cooling is pure arithmetic on alpha — no coordinate enters it — so the tick
  // at which the simulation comes to rest is exact on every platform. That
  // makes "does it settle inside the budget" the settle assertion that can
  // actually be goldened.
  let ticksToStable = -1
  for (let i = 0; i < TIER_B_PARAMS.tickCount; i++) {
    sim.tick()
    if (ticksToStable < 0 && sim.isStable()) ticksToStable = i + 1
  }

  const active = sim.nodes
  const params = sim.params

  // ── 1. No NaN anywhere in the state the canvas will read. The only detector
  // for the missing-key → undefined/NaN path: `coreRadiusForType` returns NaN
  // for an unmapped key and its Math.max floor swallows the miss.
  const nonFinite: string[] = []
  for (const n of active) {
    if (![n.x, n.y, n.vx, n.vy].every(Number.isFinite)) nonFinite.push(n.id)
  }

  // ── 2. One band centre per distinct type present. THE detector for the
  // value-vs-identity trap: a dimension selection that keys the collection by
  // identity rather than by an interned value silently degenerates to one entry
  // per node, and nothing else in the simulation notices.
  //
  // Asserted on the count of ENTRIES COLLECTED, never on distinct centre
  // *values* — several types deliberately share a band, so with all 7 present
  // there are only 4 distinct values and a distinct-value assertion would be
  // permanently red. Both numbers are recorded so that stays visible.
  const centers = bandCenters(active, params)
  const distinctTypesPresent = new Set<NodeType>(active.map(n => n.nodeType)).size

  // ── 3. The layout did not collapse or explode. Order-of-magnitude margins,
  // so these survive a different platform's floating point.
  let maxAbs = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of active) {
    maxAbs = Math.max(maxAbs, Math.abs(n.x), Math.abs(n.y))
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  const extent = active.length === 0 ? 0 : Math.hypot(maxX - minX, maxY - minY)

  // ── Diagnostics: positional, chaotic, deliberately NOT goldened.
  const shift = median(centers)
  let outsideBand = 0
  for (const n of active) {
    const band = bandForType(params, n.nodeType)
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
    // 1
    allFinite: nonFinite.length === 0,
    nonFiniteNodeIds: sorted(nonFinite),
    // 2
    bandCenterEntries: centers.length,
    distinctTypesPresent,
    bandCentersMatchDistinctTypes: centers.length === distinctTypesPresent,
    distinctCenterValues: new Set(centers).size,
    // 3
    boundedPositions: maxAbs < TIER_B_PARAMS.maxAbsPosition,
    nonDegenerateExtent: extent > TIER_B_PARAMS.minExtent,
    // 4
    ticksToStable,
    stableWithinTickBudget: ticksToStable > 0,
  }
}
