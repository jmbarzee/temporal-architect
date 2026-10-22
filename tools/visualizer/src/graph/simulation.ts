// Force-directed simulation engine.
// Implements GRAPH_VIEW.md § Layout: Force-Directed Simulation.

import type { GraphNode, GraphEdge, Graph } from './model'
import type { EdgeTypeId, SpringPhysics } from './taxonomy'
import {
  applyChargeForce,
  applyLinkForce,
  applyBandGravity,
  applyTopologicalGravity,
  applyCenterGravity,
  bandFor,
  medianBandCenter,
  presentSpringCategories,
  resolvePhysics,
  resolveSprings,
  springFor,
} from './forces'
import type { Rng } from './rng'
import type { EdgeCategory, ResolvedPhysics } from './forces'
import type { DimensionalMapping } from './dimension'
import { identityMapping, valuesOn } from './dimension'
import type { Ontology } from './ontology'

// The force helpers now live in ./forces; re-export them so existing consumers
// (GraphCanvas, GraphControlPanel, ChargeControls) keep importing them here.
export {
  CORE_RADIUS_MIN,
  chargeFor,
  coreRadiusFor,
  bandFor,
  bandForKey,
  springFor,
  RADIAL_R_MIN,
  RADIAL_R_MAX,
} from './forces'

export interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

// The simulation's tunable parameters, split into the four force categories the
// control panel exposes (Push / Pull / Gravity / Dynamics) and intersected into
// `ForceParams` below. At runtime `ForceParams` is still a single flat object —
// `keyof ForceParams`, the key-addressed control sliders/tokens, the per-type
// lookup records, and the shallow merges in `Simulation` all keep working. The
// split is purely at the type level: each force in ./forces takes only its
// category's slice, so it cannot read params outside its own force.

/** What the push force needs per bucket. */
export interface PushPhysics { charge: number; coreRadius: number }
/** A rest band, as declared and as tuned. Converted to `YBand` at read time. */
export interface BandRange { min: number; max: number }

/**
 * Per-bucket tuning of one force along one axis.
 *
 * Three facts that must agree — which axis, how its values bucket, and the
 * per-bucket numbers — as ONE constructed value, so there is no second field for
 * them to disagree with. The axis and its table used to be two independent
 * fields (`chargeDimension` and `charge`), and the Unit 2 review found the exact
 * state that admits: after a taxonomy swap the axis was the new one and the
 * table was still keyed by the old, every lookup missed, and the layout silently
 * collapsed (PLAN §6.6).
 *
 * `overrides` holds **only what the user changed**, keyed by bucket id. Every
 * other bucket resolves to the taxonomy's declared physics at read time
 * (`resolvePhysics`). That is what makes the shape a projection rather than a
 * copy: there is no dense table to go stale, and no provenance token to keep in
 * step, because nothing here duplicates the taxonomy. It also makes "is this
 * value tuned?" answerable — presence is the answer — and reset granular.
 *
 * T10 holds: the scalars beside this stay flat, so `keyof ForceParams` and the
 * key-addressed sliders are unchanged. Only the table fields changed shape.
 */
export interface AxisTuning<T> {
  /** Which axis, and how its values bucket. The mapping names its own dimension. */
  readonly mapping: DimensionalMapping
  readonly overrides: ReadonlyMap<string, T>
}

/** Set one bucket's override, copy-on-write. */
export function withOverride<T>(tuning: AxisTuning<T>, bucketId: string, value: T): AxisTuning<T> {
  const overrides = new Map(tuning.overrides)
  overrides.set(bucketId, value)
  return { ...tuning, overrides }
}

/**
 * The two pair forces' tuning: ONE axis for both, and only what the user has
 * changed on each. Push and pull keying on different axes is a state the
 * domain has no meaning for (D51: one dropdown drives both), so the type does
 * not admit it — the mapping is stored once, here.
 */
export interface PairTuning {
  readonly mapping: DimensionalMapping
  /** Per-bucket charge and core radius, only where the user changed it. */
  readonly push: ReadonlyMap<string, PushPhysics>
  /** Per-category stiffness and rest length, only where the user changed it. */
  readonly spring: ReadonlyMap<EdgeTypeId, SpringPhysics>
}

/** Both forces on an axis, nothing overridden. */
export function pairTuning(mapping: DimensionalMapping): PairTuning {
  return { mapping, push: new Map(), spring: new Map() }
}

export function withPushOverride(pair: PairTuning, bucketId: string, value: PushPhysics): PairTuning {
  const push = new Map(pair.push)
  push.set(bucketId, value)
  return { ...pair, push }
}

export function withSpringOverride(pair: PairTuning, id: EdgeTypeId, value: SpringPhysics): PairTuning {
  const spring = new Map(pair.spring)
  spring.set(id, value)
  return { ...pair, spring }
}

/**
 * The identity bucketing of the taxonomy's style axis — one bucket per declared
 * value. The style axis has no descriptor (it is not a filter), so its labels
 * come from the taxonomy rather than through `identityMapping`.
 */
export function styleIdentityMapping(ontology: Ontology): DimensionalMapping {
  return identityMapping({
    id: ontology.styleAxis(),
    label: ontology.styleLabel(),
    labelFor: value => ontology.styleForKey(value).label,
    abbreviationFor: value => ontology.abbreviationFor(value),
  }, ontology.nodeTypeKeys)
}

/** A single-axis tuning on the style axis, bucketed by identity, nothing overridden. */
export function identityTuning<T>(ontology: Ontology): AxisTuning<T> {
  return { mapping: styleIdentityMapping(ontology), overrides: new Map() }
}

/**
 * The bounded-token rule. A dimension is usable for push/pull only through a
 * mapping small enough that one token per bucket (push) and one per spring
 * category present (pull) is still a control surface a person can use. Above
 * this the surface is unbounded, which PLAN §5.1 names as a tripwire.
 */
export const TOKEN_CEILING = 24

/** One axis the push/pull forces could key on, and what it would cost to show. */
export interface AxisOption {
  readonly mapping: DimensionalMapping
  /** Push tokens — one per bucket. */
  readonly pushTokens: number
  /** Pull tokens — one per spring category some edge of the graph falls in. */
  readonly pullTokens: number
}

export function fitsCeiling(option: AxisOption): boolean {
  return option.pushTokens <= TOKEN_CEILING && option.pullTokens <= TOKEN_CEILING
}

/**
 * Every axis push/pull can key on for this graph: the style axis bucketed by
 * identity, then each filter axis bucketed by the values the graph presents on
 * it. The token counts are measured, not estimated, so the ceiling is a number
 * the dropdown can show beside an axis it has to decline.
 */
export function axisOptions(ontology: Ontology, graph: Graph): AxisOption[] {
  const style = ontology.styleAxis()
  const mappings: DimensionalMapping[] = [styleIdentityMapping(ontology)]
  for (const d of ontology.filterDimensions) {
    if (d.id === style) continue
    const values = valuesOn(graph.nodes.values(), d.id)
    if (values.length > 0) mappings.push(identityMapping(d, values))
  }
  const nodeOf = (id: string) => graph.nodes.get(id)
  return mappings.map(mapping => ({
    mapping,
    pushTokens: mapping.buckets.length,
    pullTokens: presentSpringCategories(resolveSprings(pairTuning(mapping), ontology), graph.edges, nodeOf).size,
  }))
}

/** Same axis, same buckets, same values — order-insensitive, since node order is not a fact about the graph. */
function sameBuckets(a: DimensionalMapping, b: DimensionalMapping): boolean {
  const key = (m: DimensionalMapping) =>
    m.buckets.map(x => `${x.id}=${[...x.values].sort().join(',')}`).sort().join(';')
  return a.dimension === b.dimension && key(a) === key(b)
}

/**
 * The same parameters, re-bucketed for the graph and taxonomy they now face.
 * An identity mapping over observed values goes stale when a file is added or
 * removed; the style axis's goes stale when the taxonomy is swapped. Overrides
 * are keyed by value, so they survive where the value does. A tuning whose
 * buckets did not change comes back by reference, so a caller can tell nothing
 * moved. An axis the graph no longer carries, or one that has grown past the
 * token ceiling, falls back to the style axis with nothing overridden.
 */
export function retunedFor(params: ForceParams, ontology: Ontology, graph: Graph): ForceParams {
  const style = ontology.styleAxis()
  const nodeOf = (id: string) => graph.nodes.get(id)
  const refreshed = (m: DimensionalMapping): DimensionalMapping | undefined => {
    if (m.dimension === style) return styleIdentityMapping(ontology)
    const descriptor = ontology.descriptorFor(m.dimension)
    if (!descriptor) return undefined
    const values = valuesOn(graph.nodes.values(), m.dimension)
    return values.length === 0 ? undefined : identityMapping(descriptor, values)
  }
  const fits = (mapping: DimensionalMapping) => fitsCeiling({
    mapping,
    pushTokens: mapping.buckets.length,
    pullTokens: presentSpringCategories(resolveSprings(pairTuning(mapping), ontology), graph.edges, nodeOf).size,
  })
  const nextPair = refreshed(params.pair.mapping)
  const pair = nextPair === undefined || (nextPair.dimension !== style && !fits(nextPair))
    ? pairTuning(styleIdentityMapping(ontology))
    : sameBuckets(nextPair, params.pair.mapping) ? params.pair : { ...params.pair, mapping: nextPair }
  const refreshBand = (tuning: AxisTuning<BandRange>): AxisTuning<BandRange> => {
    const next = refreshed(tuning.mapping) ?? styleIdentityMapping(ontology)
    return sameBuckets(next, tuning.mapping) ? tuning : { ...tuning, mapping: next }
  }
  const bandX = refreshBand(params.bandX)
  const bandY = refreshBand(params.bandY)
  return pair === params.pair && bandX === params.bandX && bandY === params.bandY ? params : { ...params, pair, bandX, bandY }
}

// PUSH — repulsion. Per-type charge strength and core radius, the masters that
// scale them, and the charge falloff exponent.
export interface ChargeParams {
  /** The pair forces' shared axis and per-bucket overrides — see `PairTuning`. */
  pair: PairTuning

  pushMultiplier: number       // scales all charge (repulsion) forces
  coreRadiusMultiplier: number // scales all per-type core radii (charge softening)
  chargeExponent: number       // power of (dist² + softening) in charge falloff (1 = inverse-square)
}

// PULL — spring attraction. Per-edge-category stiffness (k) and rest length,
// the masters that scale them, and the displacement exponent.
export interface LinkParams {
  /** The same value `ChargeParams` names: one axis for both pair forces. */
  pair: PairTuning

  pullMultiplier: number     // scales all link (attraction) forces
  distanceMultiplier: number // scales all rest distances
  linkExponent: number       // power of displacement in spring force (1 = linear/Hooke)
}

// GRAVITY — anchoring. Each layout axis carries per-bucket rest bands (no force
// inside, pull toward the nearest edge outside), re-centred on the median of
// the bands present so the stack sits on the origin without canvas-side
// compensation. Plus the optional topological pull and the center baseline.
export interface GravityParams {
  /**
   * The two layout axes' rest bands — the same shape, each on its own mapping
   * (T22). A strength of zero switches an axis off; when both are off and
   * topological gravity is too, center gravity is the baseline.
   */
  bandX: AxisTuning<BandRange>
  bandY: AxisTuning<BandRange>
  gravityX: number
  gravityY: number
  // Band falloff exponent applied to the displacement outside the rest band
  // (force = strength × d^exp). 1 = linear (Hooke); higher = softer just outside
  // the band, stiffer far out. Mirrors the Pull tab's linkExponent.
  gravityBandExp: number
  /**
   * Radial layout: the Y axis's bands become rings about the origin (uppermost
   * bucket innermost) and X is ignored; topological gravity's focal point moves
   * from the top to the centre. Entered from the Y axis's switch (R27).
   */
  radial: boolean
  // Topological gravity strength: scales the single-sided inward pull on each
  // node by its (shaped) downstream-reach score. Default 0 (off).
  gravityTopological: number
  // Topological contrast: exponent applied to the reach score (score^exp) so
  // high-reach roots dominate. 1 = linear; higher = sharper tiering (only the
  // biggest hubs pull hard).
  gravityTopologicalExp: number
  // Center gravity strength: radial pull toward the world origin — the baseline
  // cohesion/anchor force used when neither band axis nor Topological is active.
  gravityCenter: number
  topologicalEnabled: boolean
}

// DYNAMICS — how the simulation cools and damps over time.
export interface DynamicsParams {
  alphaDecay: number
  alphaMin: number
  velocityDecay: number
}

// The full parameter set: a flat object that is the intersection of the four
// force categories (so `keyof ForceParams` is the union of all category keys).
export type ForceParams = ChargeParams & LinkParams & GravityParams & DynamicsParams

// Defaults are a hand-tuned baseline captured from interactive use across
// the topic library and the example workflows. The model is intentionally
// charge-dominant: repulsion does most of the layout work, the per-type Y
// bands hold the hierarchy, and the link springs act as short tethers
// rather than rigid rods. Concretely:
//
//   - pushMultiplier 0.4 + chargeExponent 0.7 (acting on dist² + softening)
//     + per-type core radii (read off the charge map) produce strong,
//     softly-decaying repulsion that prevents node overlap and naturally
//     fans siblings apart. push is modest because the per-type charges
//     themselves are now large (container/host tiers ~800).
//   - pullMultiplier 0.6 + distanceMultiplier 0.1 means every spring is
//     ~6% of its old strength × ~10% of its old rest distance — enough to
//     keep connected nodes near each other, not enough to fight the
//     repulsion or the Y bands.
//   - gravityY 0.145 is roughly 2.5× its old strength; the Y bands now
//     carry the vertical structure of the layout. Bands are also wider
//     than before so each tier has room without crowding its neighbours.
//   - linkExponent stays at 1.0 (linear). A sub-linear shape was tested
//     and made the high-fan-out side dominate harder, not less.
//
// The per-category sliders all still work; these are starting points the
// user can drag from. Ranges in GraphControlPanel.tsx are wide enough that
// every default sits in a comfortable middle of its slider.
/**
 * The starting parameters for a taxonomy.
 *
 * This was a module-load constant built from the shipped registry, which made
 * the engine's defaults a property of one domain: importing the simulation
 * imported that domain's charges, bands and spring categories, whether or not
 * the caller ever used them. Deriving them from the supplied taxonomy instead
 * is what lets a host bring its own values and get the same tuning surface.
 *
 * Note that this returns a **fresh** object per call, nested maps included. The
 * old constant was shared, and `{ ...DEFAULT_PARAMS }` copied only the top
 * level — so every "copy" aliased the same `charge`, `coreRadius`, `band`,
 * `link` and `dist` objects, and an in-place write to any of them would have
 * reached every other holder, including the module default itself. Nothing did
 * that today (the control panel rebuilds each map immutably), which is exactly
 * why it would have been a bad bug to acquire later rather than one to find.
 */
export function defaultParamsFor(ontology: Ontology): ForceParams {
  return {
    // Both default to the axis the taxonomy resolves style on, so the layout
    // keys on the same thing it is coloured by. Unit 4 makes this a choice.
    pair: pairTuning(styleIdentityMapping(ontology)),
    bandX: identityTuning<BandRange>(ontology),
    bandY: identityTuning<BandRange>(ontology),

    // Gravity. The Y bands carry the vertical structure of the layout — strong
    // (gravityY = 0.145) and overlapping at the edges so adjacent tiers can
    // soften their boundary instead of forming a hard stripe. The X bands bound
    // the horizontal spread, gently (gravityX = 0.05): wide fan-outs may spread.
    gravityX: 0.05,
    gravityY: 0.145,
    gravityBandExp: 1,
    radial: false,
    // Off by default — the experiment lives behind a slider. When non-zero,
    // every node with a positive downstream score gets an additional pull
    // toward the focal point, layered additively on top of the bands.
    gravityTopological: 0,
    gravityTopologicalExp: 3,
    gravityCenter: 0.05,
    topologicalEnabled: false,

    // Dynamics. alphaMin is well below the d3 default (0.001) so the
    // simulation continues into its slow-cooling tail — layouts read as
    // "settled" rather than freezing while springs are still measurably
    // active. friction and cooling are stock.
    alphaDecay:    0.005,
    alphaMin:      0.0001,
    velocityDecay: 0.4,

    pushMultiplier:       0.4,
    pullMultiplier:       0.6,
    distanceMultiplier:   0.1,
    coreRadiusMultiplier: 1.0,
    chargeExponent:       0.7,  // acts on (dist² + softening); = old 1.4 with the /2 folded in
    linkExponent:         1.0,
  }
}

// Stability bounds — defenses against numerical instability cascades.
//
// MAX_VELOCITY: per-tick cap on a node's speed (world units / tick). A healthy
// simulation produces speeds well below this; the cap exists only to break
// runaway cascades where two nodes briefly overlap, get hit with a singular
// force, fly apart, collide with a third, and so on. Picked an order of
// magnitude larger than typical equilibrium speeds and an order of magnitude
// smaller than what causes visible "teleport" frames.
//
// MAX_POSITION: hard bound on world coordinates. Final safety net so the canvas
// 2D context never receives non-finite or astronomically-large coords (which
// can OOM the GPU command buffer and crash the webview renderer).
const MAX_VELOCITY = 50
const MAX_POSITION = 1e6

// REHEAT_TICKS: the fixed settle window (in ticks) that a `reheat()` cools over,
// regardless of how hard it kicks. Cooling normally subtracts a constant
// `alphaDecay` each tick, so a bigger kick would linger proportionally longer
// (alpha 10 ÷ decay 0.005 ≈ 2000 ticks of jitter). Instead, `reheat()` derives a
// per-burst decay of `alpha / REHEAT_TICKS`, so a stronger kick moves nodes
// *further* within the same window rather than dragging the tail out *longer*.
const REHEAT_TICKS = 200

export class Simulation {
  nodes: SimNode[]
  edges: GraphEdge[]
  params: ForceParams
  alpha: number

  // Per-burst cooling rate set by `reheat()` so the settle window stays fixed
  // (~REHEAT_TICKS) no matter the kick size. Null means "cool at the normal
  // alphaDecay" — used during steady-state and live tuning via `nudge()`.
  private reheatDecay: number | null = null

  private nodeMap: Map<string, SimNode>

  // Source of randomness for the degenerate-frame breakers and the position
  // jitter. Defaults to the platform generator, so app behaviour is unchanged;
  // the verification harness passes a seeded one to make a run reproducible.
  private rng: Rng

  // The taxonomy the link force resolves spring categories through. Held rather
  // than imported so the engine is not bound to one set of edge categories.
  private ontology: Ontology

  // The per-bucket tables, resolved once from (params, taxonomy) and read by the
  // kernels per pair / per node. Recomputed only when either input changes —
  // never per tick, and never inside a loop (T25).
  private resolved: ResolvedPhysics
  // Each edge's spring category, classified once per (edges, resolved) rather
  // than per tick: an edge's category depends on the edge, its endpoints'
  // buckets and the pair mapping, none of which change between ticks. Built on
  // first use and dropped whenever the tables are re-resolved.
  private springByEdge: Map<string, EdgeCategory> | null = null

  // `ontology` is REQUIRED, deliberately. It was defaulted first, and the single
  // production construction site then quietly kept the shipped taxonomy while
  // every component resolved through an injected one — a split-brain that no
  // gate could see because both halves were individually correct.
  constructor(
    graph: Graph,
    params: Partial<ForceParams> | undefined,
    rng: Rng,
    ontology: Ontology,
  ) {
    this.params = { ...defaultParamsFor(ontology), ...params }
    this.alpha = 1.0
    this.rng = rng
    this.ontology = ontology
    this.resolved = resolvePhysics(this.params, ontology)

    // Seed each node inside its rest bands on both axes, re-centred exactly as
    // the band force re-centres them (on the median of the present centres), so
    // the first tick does not relocate what the seeding placed (T2). A node with
    // no value on an axis has the absent band: a point at that axis's centre.
    this.nodes = []
    this.nodeMap = new Map()
    const seedNodes = [...graph.nodes.values()]
    const shiftX = medianBandCenter(seedNodes, this.resolved.bandX)
    const shiftY = medianBandCenter(seedNodes, this.resolved.bandY)
    for (const node of seedNodes) {
      const bx = bandFor(this.resolved.bandX, node)
      const by = bandFor(this.resolved.bandY, node)
      const xCenter = (bx.min + bx.max) / 2 - shiftX
      const yCenter = (by.min + by.max) / 2 - shiftY
      const xJitter = Math.max(40, (bx.max - bx.min) * 0.7)
      const yJitter = Math.max(20, (by.max - by.min) / 2)
      const sim: SimNode = {
        ...node,
        x: xCenter + (rng() - 0.5) * xJitter,
        y: yCenter + (rng() - 0.5) * yJitter,
        vx: 0,
        vy: 0,
        pinned: false,
      }
      this.nodes.push(sim)
      this.nodeMap.set(sim.id, sim)
    }

    // Children inherit their parent's X (so they stack vertically under their
    // worker/namespace) but Y stays in the child's own band.
    for (const node of this.nodes) {
      if (node.parentId) {
        const parent = this.nodeMap.get(node.parentId)
        if (parent) {
          node.x = parent.x + (rng() - 0.5) * 20
        }
      }
    }

    this.edges = graph.edges
  }

  getNode(id: string): SimNode | undefined {
    return this.nodeMap.get(id)
  }

  tick(visibleIds?: Set<string>, downstreamScores?: Map<string, number>): void {
    if (this.alpha < this.params.alphaMin) return

    const active = visibleIds
      ? this.nodes.filter(n => visibleIds.has(n.id))
      : this.nodes

    const activeEdges = visibleIds
      ? this.edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
      : this.edges

    // Forces — each scaled by the current alpha, mutating node velocities.
    // (Implemented in ./forces, one function per category.) Gravity is the two
    // shaping forces (Band, Topological) gated by their toggles, with Center
    // gravity as the baseline when neither is active. The Cartesian/Radial mode
    // is read inside the band/topological forces.
    applyChargeForce(active, this.params, this.resolved, this.alpha, this.rng)
    applyLinkForce(activeEdges, this.nodeMap, this.params, this.edgeCategory, this.alpha, this.rng)
    const bands = this.params.gravityX > 0 || this.params.gravityY > 0
    if (bands) applyBandGravity(active, this.params, this.resolved, this.alpha, this.rng)
    if (this.params.topologicalEnabled) applyTopologicalGravity(active, this.params, this.alpha, downstreamScores)
    if (!bands && !this.params.topologicalEnabled) {
      applyCenterGravity(active, this.params, this.alpha)
    }

    // Apply velocity and damping with stability guards.
    //
    // Three layered defenses against numerical instability cascades:
    //   1. NaN/Infinity guard — if any force computation produced a non-finite
    //      value (e.g. division by an unexpected zero), reset that component
    //      to zero rather than let it propagate into positions and reach the
    //      canvas (where NaN/Infinity coords can crash the renderer).
    //   2. Per-tick velocity clamp — explicit "node movement limit" that
    //      breaks runaway cascades. A healthy sim never hits this; if it does,
    //      we've absorbed a singular force without letting it ricochet.
    //   3. Position hard bound — final safety net so positions can never
    //      reach values that crash compositing.
    const decay = this.params.velocityDecay
    const maxV2 = MAX_VELOCITY * MAX_VELOCITY
    for (const node of active) {
      if (node.pinned) continue

      node.vx *= decay
      node.vy *= decay

      if (!Number.isFinite(node.vx)) node.vx = 0
      if (!Number.isFinite(node.vy)) node.vy = 0

      const v2 = node.vx * node.vx + node.vy * node.vy
      if (v2 > maxV2) {
        const s = MAX_VELOCITY / Math.sqrt(v2)
        node.vx *= s
        node.vy *= s
      }

      node.x += node.vx
      node.y += node.vy

      if (!Number.isFinite(node.x)) node.x = 0
      if (!Number.isFinite(node.y)) node.y = 0
      if (node.x < -MAX_POSITION) node.x = -MAX_POSITION
      else if (node.x > MAX_POSITION) node.x = MAX_POSITION
      if (node.y < -MAX_POSITION) node.y = -MAX_POSITION
      else if (node.y > MAX_POSITION) node.y = MAX_POSITION
    }

    // Cool. A `reheat()` burst cools at its own bounded rate so the settle
    // window stays fixed; once it lands back at rest, drop back to the normal
    // alphaDecay for any future steady-state warming.
    const cool = this.reheatDecay ?? this.params.alphaDecay
    this.alpha = Math.max(this.alpha - cool, 0)
    if (this.alpha <= this.params.alphaMin) this.reheatDecay = null
  }

  // Strong, bounded-duration kick. A bigger `alpha` rearranges the layout
  // further but settles in the same ~REHEAT_TICKS window (decay scales with the
  // kick) rather than lingering proportionally longer.
  reheat(alpha = 0.5): void {
    this.alpha = alpha
    this.reheatDecay = alpha / REHEAT_TICKS
  }

  // Raise alpha to at least `target` without ever cooling a hotter sim.
  // This is the physics primitive behind the control panel's "keep the
  // layout warm while tuning" hook: a parameter edit re-energises the
  // simulation just enough to show its effect, but a still-hot sim is
  // left alone so dragging a slider during settling doesn't dampen it.
  nudge(target = 0.3): void {
    if (this.alpha < target) this.alpha = target
    // Live tuning cools at the normal rate — clear any leftover reheat burst so
    // a prior strong kick's fast decay doesn't dampen the warm-while-editing feel.
    this.reheatDecay = null
  }

  isStable(): boolean {
    return this.alpha < this.params.alphaMin
  }

  pinNode(id: string, x: number, y: number): void {
    const node = this.nodeMap.get(id)
    if (node) {
      node.pinned = true
      node.x = x
      node.y = y
      node.vx = 0
      node.vy = 0
    }
  }

  unpinNode(id: string): void {
    const node = this.nodeMap.get(id)
    if (node) {
      node.pinned = false
    }
  }

  setParams(params: Partial<ForceParams>): void {
    Object.assign(this.params, params)
    // A patch may replace a whole tuning; the dense tables and the per-edge
    // classification follow it.
    this.resolved = resolvePhysics(this.params, this.ontology)
    this.springByEdge = null
  }

  private classifyEdges(): Map<string, EdgeCategory> {
    const byEdge = new Map<string, EdgeCategory>()
    for (const edge of this.edges) {
      const src = this.nodeMap.get(edge.sourceId)
      const tgt = this.nodeMap.get(edge.targetId)
      if (src && tgt) byEdge.set(edge.id, springFor(this.resolved.spring, edge, src, tgt))
    }
    return byEdge
  }

  // Loud on a miss: every edge the simulation owns is classified above, so an
  // absent entry means the cache and the edge list have come apart.
  private edgeCategory = (edge: GraphEdge): EdgeCategory => {
    const cats = this.springByEdge ?? (this.springByEdge = this.classifyEdges())
    const cat = cats.get(edge.id)
    if (cat === undefined) throw new Error(`edge ${JSON.stringify(edge.id)} has no spring classification; the cache and the edge list have come apart`)
    return cat
  }

  // Seed a node at a given position (used when new nodes appear during a
  // level-toggle transition). X follows the seed point; Y snaps into the
  // node's own band — re-centred as the force sees it — so the hierarchy is
  // honoured immediately.
  seedAt(id: string, x: number, y: number): void {
    const node = this.nodeMap.get(id)
    if (!node) return
    const band = bandFor(this.resolved.bandY, node)
    const shift = medianBandCenter(this.nodes, this.resolved.bandY)
    const yClamped = Math.min(Math.max(y, band.min - shift), band.max - shift)
    node.x = x + (this.rng() - 0.5) * 10
    node.y = yClamped + (this.rng() - 0.5) * 10
    node.vx = 0
    node.vy = 0
  }
}
