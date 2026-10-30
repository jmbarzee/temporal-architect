// Force-directed simulation engine.

import type { GraphNode, GraphEdge, Graph } from './model'
import { nodesById, readableGraph } from './model'
import type { EdgeTypeId, SpringPhysics } from './shapes'
import {
  applyChargeForce,
  applyLinkForce,
  applyBandGravity,
  applyTopologicalGravity,
  applyCenterGravity,
  bandAxesActing,
  layoutFrame,
  presentSpringCategories,
  topologicalActing,
  resolvePhysics,
  resolveSprings,
  springFor,
} from './forces'
import type { Rng } from './rng'
import type { EdgeCategory, LayoutFrame, LayoutSubject, ResolvedPhysics } from './forces'
import type { ScalarAxis, ScalarTuning } from './scalar'
import { isScalarTuning } from './scalar'
import type { AxisNamer, AxisId, AxisValue, AxisMapping } from './axis'
import { identityMapping, valuesOn } from './axis'
import type { Taxonomy } from './taxonomy'

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
/** A rest band on one axis, as declared and as tuned. */
export interface BandRange { min: number; max: number }

/**
 * Per-bucket tuning of one force along one axis.
 *
 * Three facts that must agree — which axis, how its values bucket, and the
 * per-bucket numbers — as ONE constructed value, so there is no second field for
 * them to disagree with. The axis and its table used to be two independent
 * fields (`chargeDimension` and `charge`), and that admitted the exact state
 * where, after a taxonomy swap, the axis was the new one and the table was
 * still keyed by the old, every lookup missed, and the layout silently
 * collapsed.
 *
 * `overrides` holds **only what the user changed**, keyed by bucket id. Every
 * other bucket resolves to the taxonomy's declared physics at read time
 * (`resolvePhysics`). That is what makes the shape a projection rather than a
 * copy: there is no dense table to go stale, and no provenance token to keep in
 * step, because nothing here duplicates the taxonomy. It also makes "is this
 * value tuned?" answerable — presence is the answer — and reset granular.
 *
 * The scalars beside this stay flat, so `keyof ForceParams` and the
 * key-addressed sliders are unchanged. Only the table fields changed shape.
 */
export interface AxisTuning<T> {
  /** Which axis, and how its values bucket. The mapping names its own axis. */
  readonly mapping: AxisMapping
  readonly overrides: ReadonlyMap<string, T>
}

/** Set one bucket's override, copy-on-write. */
export function withOverride<T>(tuning: AxisTuning<T>, bucketId: string, value: T): AxisTuning<T> {
  const overrides = new Map(tuning.overrides)
  overrides.set(bucketId, value)
  return { ...tuning, overrides }
}

/**
 * What a layout axis keys on: an axis mapping with its overrides, or a
 * computed scalar with its span. The narrowers are two guards
 * (`isScalarTuning`, `isScalarAxis`) and two loud casts for the callers that
 * hold the kind already (`mappedTuning`, `mappedAxis`).
 */
export type LayoutTuning = AxisTuning<BandRange> | ScalarTuning

/** The mapped half of a layout tuning; loud where a caller expects buckets and meets a scalar. */
export function mappedTuning(t: LayoutTuning): AxisTuning<BandRange> {
  if (isScalarTuning(t)) throw new Error(`expected a mapped axis, got scalar ${JSON.stringify(t.scalar)}`)
  return t
}

/**
 * The two pair forces' tuning: ONE axis for both, and only what the user has
 * changed on each. Push and pull keying on different axes is a state the
 * domain has no meaning for (one dropdown drives both), so the type does
 * not admit it — the mapping is stored once, here.
 */
export interface PairTuning {
  readonly mapping: AxisMapping
  /** Per-bucket charge and core radius, only where the user changed it. */
  readonly push: ReadonlyMap<string, PushPhysics>
  /** Per-category stiffness and rest length, only where the user changed it. */
  readonly spring: ReadonlyMap<EdgeTypeId, SpringPhysics>
}

/** Both forces on an axis, nothing overridden. */
export function pairTuning(mapping: AxisMapping): PairTuning {
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
export function styleIdentityMapping(taxonomy: Taxonomy): AxisMapping {
  return identityMapping({
    id: taxonomy.styleAxis(),
    label: taxonomy.styleLabel(),
    labelFor: value => taxonomy.styleOf(value).label,
    abbreviationFor: value => taxonomy.abbreviationFor(value),
  }, taxonomy.styleValues)
}

/** A single-axis tuning on the style axis, bucketed by identity, nothing overridden. */
export function identityTuning<T>(taxonomy: Taxonomy): AxisTuning<T> {
  return { mapping: styleIdentityMapping(taxonomy), overrides: new Map() }
}

/**
 * Seeding bias: how far below a band's centre, as a fraction of its height, a
 * node starts. Measured over 24 RNG seeds on three fixtures, 400 ticks each,
 * counting the nodes that settle outside their band: seeded at the centre of
 * two overlapping bands, the stress layout left the bottom tier wedged above
 * the tier over it in a third of the seeds (mean 11.9 outsiders, max 42),
 * because charge alone cannot sort interleaved tiers and the band force only
 * acts on nodes already outside their band. Seeded 0.35 of the band's height
 * below the centre, the tiers start pre-ordered and the force only has to
 * lift (mean 3.5, max 13). Uniform-within-band and a wider jitter were both
 * worse than the centre. The frame is unchanged by the bias, so seed and
 * force still agree; only where within the band a node starts moved (D54).
 */
export const SEED_BIAS = 0.35

/**
 * The bounded-token rule. A axis is usable for push/pull only through a
 * mapping small enough that one token per bucket (push) and one per spring
 * category present (pull) is still a control surface a person can use. Above
 * this the surface is unbounded.
 */
export const TOKEN_CEILING = 24

/** One axis the push/pull forces could key on, and what it would cost to show. */
export interface AxisOption {
  readonly mapping: AxisMapping
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
export function axisOptions(taxonomy: Taxonomy, graph: Graph): AxisOption[] {
  const mappings: AxisMapping[] = [styleIdentityMapping(taxonomy)]
  for (const axis of nodeAxes(taxonomy, graph)) {
    const values = valuesOn(graph.nodes, axis)
    if (values.length > 0) mappings.push(identityMapping(namerFor(taxonomy, axis), values))
  }
  const byId = nodesById(graph.nodes)
  const nodeOf = (id: string) => byId.get(id)
  return mappings.map(mapping => ({
    mapping,
    pushTokens: mapping.buckets.length,
    pullTokens: presentSpringCategories(resolveSprings(pairTuning(mapping), taxonomy), graph.edges, nodeOf).size,
  }))
}

/**
 * Every axis the nodes carry other than the style axis: the declared filter
 * axes first, in declaration order, then any other axis a node has a value
 * on, in first-encounter order. An axis is a fact about the nodes, not a
 * declaration: a host that writes `term` on its nodes may push and pull on
 * it without declaring a filter for it.
 */
function nodeAxes(taxonomy: Taxonomy, graph: Graph): AxisId[] {
  const style = taxonomy.styleAxis()
  const out: AxisId[] = []
  const seen = new Set<AxisId>([style])
  for (const d of taxonomy.filterAxes) {
    if (seen.has(d.id)) continue
    seen.add(d.id); out.push(d.id)
  }
  for (const node of graph.nodes) {
    for (const axis of Object.keys(node.values)) {
      if (seen.has(axis)) continue
      seen.add(axis); out.push(axis)
    }
  }
  return out
}

/** How an axis names itself and its values: its descriptor's way, or — for an axis no descriptor declares — the id and the value. */
function namerFor(taxonomy: Taxonomy, axis: AxisId): AxisNamer {
  return taxonomy.axisFor(axis) ?? {
    id: axis,
    label: axis,
    labelFor: (v: AxisValue) => v,
    abbreviationFor: (v: AxisValue) => v.slice(0, 2),
  }
}

/** One choice for a layout axis: a mapping (with its cost) or a computed scalar. */
export type LayoutAxisOption =
  | { readonly kind: 'mapping'; readonly option: AxisOption }
  | { readonly kind: 'scalar'; readonly scalar: ScalarAxis }

/** Every axis X or Y can key on: the mappings push/pull can (already measured), then every scalar the taxonomy knows. */
export function layoutAxisOptions(axes: readonly AxisOption[], taxonomy: Taxonomy): LayoutAxisOption[] {
  return [
    ...axes.map(option => ({ kind: 'mapping' as const, option })),
    ...taxonomy.scalars.map(scalar => ({ kind: 'scalar' as const, scalar })),
  ]
}

/**
 * The one spelling of a layout-axis choice, for the control that offers the
 * options and reads the current one back: what the dropdown's values are and
 * what the tuning answers to.
 */
export function layoutAxisKey(choice: LayoutTuning | LayoutAxisOption): string {
  if ('kind' in choice) return choice.kind === 'scalar' ? `scalar:${choice.scalar.id}` : `mapping:${choice.option.mapping.axis}`
  return isScalarTuning(choice) ? `scalar:${choice.scalar}` : `mapping:${choice.mapping.axis}`
}

/** Same axis, same buckets, same values — order-insensitive, since node order is not a fact about the graph. */
function sameBuckets(a: AxisMapping, b: AxisMapping): boolean {
  const key = (m: AxisMapping) =>
    m.buckets.map(x => `${x.id}=${[...x.values].sort().join(',')}`).sort().join(';')
  return a.axis === b.axis && key(a) === key(b)
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
export function retunedFor(params: ForceParams, taxonomy: Taxonomy, graph: Graph): ForceParams {
  const style = taxonomy.styleAxis()
  const byId = nodesById(graph.nodes)
  const nodeOf = (id: string) => byId.get(id)
  const refreshed = (m: AxisMapping): AxisMapping | undefined => {
    if (m.axis === style) return styleIdentityMapping(taxonomy)
    const values = valuesOn(graph.nodes, m.axis)
    return values.length === 0 ? undefined : identityMapping(namerFor(taxonomy, m.axis), values)
  }
  // One rule for every tuning: re-bucket; fall back to the style axis with
  // nothing overridden when the axis vanished or outgrew its ceiling — said
  // on the console, since the control the user set it on now shows another
  // axis; keep the same object when the buckets did not change. What "fits"
  // means is the only thing that differs — buckets for a band axis, buckets
  // and present pairs for the pair axis — so it is the one thing passed in.
  const refresh = <T extends { mapping: AxisMapping }>(
    tuning: T, fresh: (mapping: AxisMapping) => T, fits: (mapping: AxisMapping) => boolean,
  ): T => {
    const next = refreshed(tuning.mapping)
    if (next === undefined || (next.axis !== style && !fits(next))) {
      fellBack(tuning.mapping.axis, next === undefined ? 'no node carries it any more' : `it has ${next.buckets.length} buckets, past the ceiling of ${TOKEN_CEILING}`)
      return fresh(styleIdentityMapping(taxonomy))
    }
    return sameBuckets(next, tuning.mapping) ? tuning : { ...tuning, mapping: next }
  }
  const bucketsFit = (mapping: AxisMapping) => mapping.buckets.length <= TOKEN_CEILING
  const pairFits = (mapping: AxisMapping) => fitsCeiling({
    mapping,
    pushTokens: mapping.buckets.length,
    pullTokens: presentSpringCategories(resolveSprings(pairTuning(mapping), taxonomy), graph.edges, nodeOf).size,
  })
  // A scalar axis has no buckets to go stale; it falls back only when the
  // taxonomy no longer knows the scalar (a swap), with the style identity.
  const refreshLayout = (tuning: LayoutTuning): LayoutTuning =>
    isScalarTuning(tuning)
      ? (taxonomy.scalars.some(sc => sc.id === tuning.scalar) ? tuning : identityTuning<BandRange>(taxonomy))
      : refresh(tuning, m => ({ mapping: m, overrides: new Map() }), bucketsFit)
  const pair = refresh(params.pair, pairTuning, pairFits)
  const bandX = refreshLayout(params.bandX)
  const bandY = refreshLayout(params.bandY)
  return pair === params.pair && bandX === params.bandX && bandY === params.bandY ? params : { ...params, pair, bandX, bandY }
}

// A fallback is said once per axis and reason: it happens on every retune
// after the first, and the user has one control to look at, not a stream.
const FELL_BACK = new Set<string>()
function fellBack(axis: AxisId, reason: string): void {
  const key = `${axis}\u0000${reason}`
  if (FELL_BACK.has(key)) return
  FELL_BACK.add(key)
  console.warn(`[graph] the ${JSON.stringify(axis)} axis cannot be tuned on: ${reason}; the forces returned to the style axis with nothing overridden.`)
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

// GRAVITY — anchoring. Each layout axis carries per-bucket rest bands or a
// scalar's points (no force
// inside, pull toward the nearest edge outside), re-centred on the median of
// the bands present so the stack sits on the origin without canvas-side
// compensation. Plus the optional topological pull and the center baseline.
export interface GravityParams {
  /**
   * The two layout axes' rest bands — the same shape, each on its own mapping.
   * A strength of zero switches an axis off; when both are off and
   * topological gravity is too, center gravity is the baseline.
   */
  bandX: LayoutTuning
  bandY: LayoutTuning
  gravityX: number
  gravityY: number
  // Band falloff exponent applied to the displacement outside the rest band
  // (force = strength × d^exp). 1 = linear (Hooke); higher = softer just outside
  // the band, stiffer far out. Mirrors the Pull tab's linkExponent.
  gravityBandExp: number
  /**
   * Radial layout: the Y axis's bands become rings about the origin (uppermost
   * bucket innermost) and X is ignored; topological gravity's focal point moves
   * from the top to the centre. Entered from the Y axis's switch.
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
// the topic library and the example graphs. The model is intentionally
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
export function defaultParamsFor(taxonomy: Taxonomy): ForceParams {
  return {
    // Both default to the axis the taxonomy resolves style on, so the layout
    // keys on the same thing it is coloured by.
    pair: pairTuning(styleIdentityMapping(taxonomy)),
    bandX: identityTuning<BandRange>(taxonomy),
    bandY: identityTuning<BandRange>(taxonomy),

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
// can OOM the GPU command buffer and crash the renderer).
const MAX_VELOCITY = 50
const MAX_POSITION = 1e6

// REHEAT_TICKS: the fixed settle window (in ticks) that a `reheat()` cools over,
// regardless of how hard it kicks. Cooling normally subtracts a constant
// `alphaDecay` each tick, so a bigger kick would linger proportionally longer
// (alpha 10 ÷ decay 0.005 ≈ 2000 ticks of jitter). Instead, `reheat()` derives a
// per-burst decay of `alpha / REHEAT_TICKS`, so a stronger kick moves nodes
// *further* within the same window rather than dragging the tail out *longer*.
const REHEAT_TICKS = 200

/**
 * The edges a visible set springs: the graph's own, with both ends visible.
 * A graduated edge (re-pointed for drawing across a hidden node) is never
 * sprung — so the controls read this same predicate to offer pull tokens
 * (`components/graph-view/present.ts`), and nothing else restates it.
 */
export function sprungEdges(edges: readonly GraphEdge[], visibleIds: ReadonlySet<string>): GraphEdge[] {
  return edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
}

export class Simulation {
  nodes: SimNode[]
  edges: readonly GraphEdge[]
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
  private taxonomy: Taxonomy

  // The per-bucket tables, resolved once from (params, taxonomy) and read by the
  // kernels per pair / per node. Recomputed only when either input changes —
  // never per tick, and never inside a loop.
  private resolved: ResolvedPhysics
  // The frame the band forces act in — median centres and ring radii over the
  // WHOLE node set — shared by seeding, the kernels and (through the view) the
  // overlay, so they agree by construction. Recomputed with the tables.
  private frame: LayoutFrame
  // Each edge's spring category, classified once per (edges, resolved) rather
  // than per tick: an edge's category depends on the edge, its endpoints'
  // buckets and the pair mapping, none of which change between ticks. Built on
  // first use and dropped whenever the tables are re-resolved.
  private springByEdge: Map<string, EdgeCategory> | null = null

  // `taxonomy` is REQUIRED, deliberately. It was defaulted first, and the single
  // production construction site then quietly kept the shipped taxonomy while
  // every component resolved through an injected one — a split-brain that no
  // gate could see because both halves were individually correct.
  constructor(
    graph: Graph,
    params: Partial<ForceParams> | undefined,
    rng: Rng,
    taxonomy: Taxonomy,
    // Where a node starts when something already knows: a layout the host
    // kept, or the previous simulation's. A node with an entry is not seeded.
    positions?: ReadonlyMap<string, { x: number; y: number }>,
  ) {
    this.params = { ...defaultParamsFor(taxonomy), ...params }
    this.alpha = 1.0
    this.rng = rng
    this.taxonomy = taxonomy
    this.resolved = resolvePhysics(this.params, taxonomy)

    // Seed each node in the frame the forces act in. Cartesian: inside its
    // rest band on both axes, re-centred as the force re-centres them, and
    // biased toward the band's bottom edge by SEED_BIAS — centred seeding left a
    // third of the stress layouts with the bottom tier wedged above the tier
    // over it; a seed that pre-orders the tiers lets the band force lift rather
    // than sort (measured over 24 seeds). Radial: on the bucket's
    // ring at a random angle, children near their parent's angle. A node in no
    // bucket sits at the axis's centre, or at the origin.
    this.nodes = []
    this.nodeMap = new Map()
    const seedNodes = graph.nodes
    this.frame = layoutFrame(readableGraph(graph), this.resolved)
    for (const node of seedNodes) {
      const given = positions?.get(node.id)
      const [x, y] = given ? [given.x, given.y] : this.seedPosition(node, rng)
      const sim: SimNode = { ...node, x, y, vx: 0, vy: 0, pinned: false }
      this.nodes.push(sim)
      this.nodeMap.set(sim.id, sim)
    }

    // Children sit near their parent — same X (cartesian, then clamped into
    // the child's own X band) or same angle (radial) — so they stack under
    // their container; the other coordinate stays the child's own.
    for (const node of this.nodes) {
      if (!node.parentId || positions?.has(node.id)) continue
      const parent = this.nodeMap.get(node.parentId)
      if (!parent) continue
      if (this.params.radial) {
        const r = Math.hypot(node.x, node.y)
        const theta = Math.atan2(parent.y, parent.x) + (rng() - 0.5) * 0.3
        node.x = r * Math.cos(theta)
        node.y = r * Math.sin(theta)
      } else {
        const bx = this.axisBand(node, 'x')
        node.x = Math.min(Math.max(parent.x + (rng() - 0.5) * 20, bx.lo), bx.hi)
      }
    }

    this.edges = graph.edges
  }

  getNode(id: string): SimNode | undefined {
    return this.nodeMap.get(id)
  }

  // A node's rest interval on one axis in the frame — a re-centred band, a
  // scalar's point, or the centre itself for a node with no value there.
  private axisBand(node: LayoutSubject, axis: 'x' | 'y'): { lo: number; hi: number } {
    return this.frame.rest(axis, node)
  }

  private seedPosition(node: LayoutSubject, rng: Rng): [number, number] {
    if (this.params.radial) {
      const r = this.frame.ringOf(node)
      const theta = rng() * Math.PI * 2
      return [r * Math.cos(theta), r * Math.sin(theta)]
    }
    const bx = this.axisBand(node, 'x')
    const by = this.axisBand(node, 'y')
    const xJitter = Math.max(40, (bx.hi - bx.lo) * 0.7)
    const yJitter = Math.max(20, (by.hi - by.lo) / 2)
    return [
      (bx.lo + bx.hi) / 2 + (rng() - 0.5) * xJitter,
      (by.lo + by.hi) / 2 + (by.hi - by.lo) * SEED_BIAS + (rng() - 0.5) * yJitter,
    ]
  }

  tick(visibleIds?: Set<string>, downstreamScores?: Map<string, number>): void {
    if (this.alpha < this.params.alphaMin) return

    const active = visibleIds
      ? this.nodes.filter(n => visibleIds.has(n.id))
      : this.nodes

    const activeEdges = visibleIds ? sprungEdges(this.edges, visibleIds) : this.edges

    // Forces — each scaled by the current alpha, mutating node velocities.
    // (Implemented in ./forces, one function per category.) Center gravity is
    // the baseline when nothing else anchors: no band axis acting (mode-aware —
    // in radial only Y acts) and topological off or at zero strength.
    applyChargeForce(active, this.params, this.resolved, this.alpha, this.rng)
    applyLinkForce(activeEdges, this.nodeMap, this.params, this.edgeCategory, this.alpha, this.rng)
    const bands = bandAxesActing(this.params)
    const topo = topologicalActing(this.params)
    if (bands) applyBandGravity(active, this.params, this.frame, this.alpha, this.rng)
    if (topo) applyTopologicalGravity(active, this.params, this.alpha, downstreamScores)
    if (!bands && !topo) {
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
    this.resolved = resolvePhysics(this.params, this.taxonomy)
    this.frame = layoutFrame(this, this.resolved)
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
  // level-toggle transition): the point, snapped into the frame the forces act
  // in — both rest bands in cartesian, the bucket's ring in radial — so the
  // structure is honoured immediately.
  seedAt(id: string, x: number, y: number): void {
    const node = this.nodeMap.get(id)
    if (!node) return
    let sx: number
    let sy: number
    if (this.params.radial) {
      const r = this.frame.ringOf(node)
      const theta = Math.atan2(y, x)
      sx = r * Math.cos(theta)
      sy = r * Math.sin(theta)
    } else {
      const bx = this.axisBand(node, 'x')
      const by = this.axisBand(node, 'y')
      sx = Math.min(Math.max(x, bx.lo), bx.hi)
      sy = Math.min(Math.max(y, by.lo), by.hi)
    }
    node.x = sx + (this.rng() - 0.5) * 10
    node.y = sy + (this.rng() - 0.5) * 10
    node.vx = 0
    node.vy = 0
  }
}
