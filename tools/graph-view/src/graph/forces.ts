// Force computations for the directed-graph layout, split by category.
//
// Each `apply*` function mutates the velocities of the active nodes for ONE
// force, scaled by the simulation's current alpha, and takes only its own
// category's parameter slice (ChargeParams / LinkParams / GravityParams) — so a
// force literally cannot read params outside itself. The full ForceParams
// object structurally satisfies each slice, so the Simulation passes `this.params`
// unchanged. Behaviour is identical to the previous inline implementation; this
// is a structural extraction.
//
// This module imports only *types* from ./simulation, so there is no runtime
// import cycle: `simulation -> forces` is the only value dependency.

import type { AxisId, AxisValue } from './axis'
import { isIdentityMapping } from './axis'
import type { GraphEdge } from './model'
import { relationOf } from './model'
import type { ChargeParams, LinkParams, GravityParams, SimNode, PairTuning, PushPhysics, BandRange, LayoutTuning } from './simulation'
import type { ScalarAxis, ScalarSpan } from './scalar'
import { normalized } from './scalar'
import { isScalarTuning } from './scalar'
import type { ReadableGraph } from './model'
import type { Taxonomy } from './taxonomy'
import type { DimensionalMapping } from './axis'
import type { EdgeTypeId, ResolvedEdgeType, SpringPhysics } from './shapes'
import type { Relation } from './axis'
import type { Rng } from './rng'

/** The minimum a force needs of a node in order to look up its physics. */
export type PhysicsSubject = { dimensions: Readonly<Record<AxisId, AxisValue>> }

// ── Per-value / per-edge accessors ──────────────────────────────────────────
// Each force reads its per-value/per-edge numbers from the keyed param maps via
// these thin helpers, taking only its own category slice.
//
// **Every one of them defaults.** Today the key space is closed and a miss is
// impossible; the whole point of the surrounding work is to open it, and the
// three accessors fail three *different* silent ways when it does: charge
// returns `undefined`, core radius returns `NaN` (its `Math.max` floor swallows
// the miss, and the NaN reaches velocity two lines later), and the band
// dereferences `undefined` and throws outright. Guarding them is cheap; finding
// a NaN that entered the layout four frames ago is not.

// Minimum effective core radius. A value dragged to 0 would otherwise drop the
// pair softening toward zero and reintroduce the close-range force singularity
// the softening exists to prevent, so we floor every read at this value.
export const CORE_RADIUS_MIN = 2

/**
 * Physics for a value the param maps do not declare.
 *
 * **Read this before assuming it is inert — it is not.** The charge model
 * couples a pair by the AVERAGE of the two endpoints' charges, so a zero here
 * still repels every neighbour at half that neighbour's charge; and a band
 * contributes its centre to `bandCenters`, so a point band on the origin pulls
 * the median that the whole stack is re-centred on. One node carrying an
 * undeclared value therefore perturbs the layout of every declared one.
 *
 * That is a deliberate trade for now: these numbers keep an undeclared value
 * *finite and bounded* — which is the guard's actual job, and the thing whose
 * absence produces a NaN four frames later or a hard throw — without inventing
 * a "non-participant" concept in the physics. Making absent values true
 * non-participants is a change to the force model, and is not made here. The
 * effect on neighbours is under golden, so the trade cannot drift silently.
 */
export const ABSENT_VALUE_PHYSICS = {
  charge: 0,
  coreRadius: CORE_RADIUS_MIN,
  /** On either axis: a point band at the axis's centre. */
  band: { min: 0, max: 0 },
} as const

// ── Resolved physics ──────────────────────────────────────────────────────────
//
// `AxisTuning` is sparse (only what the user changed) and the kernels are hot
// (four reads per pair, O(n²)). So the tables are resolved ONCE per
// (params, taxonomy) into dense per-bucket maps here, and the kernels read
// those. Resolution is the only place the taxonomy's declared physics is
// consulted for the forces, and it never runs inside a loop.

/** A per-bucket table, resolved from one axis's tuning and the taxonomy. */
export interface ResolvedAxis<T> {
  readonly mapping: DimensionalMapping
  readonly byBucket: ReadonlyMap<string, T>
}

/** A layout axis backed by a scalar: the scalar itself, and where its 0 and 1 rest. */
export interface ResolvedScalarAxis {
  readonly scalar: ScalarAxis
  readonly span: ScalarSpan
}

/** A layout axis as the kernels see it: per-bucket bands, or a scalar over a span. */
export type ResolvedLayoutAxis = ResolvedAxis<BandRange> | ResolvedScalarAxis

export const isScalarAxis = (a: ResolvedLayoutAxis): a is ResolvedScalarAxis => 'scalar' in a

/** The mapped half of a layout axis; loud where a caller expects buckets and meets a scalar. */
export function mappedAxis(a: ResolvedLayoutAxis): ResolvedAxis<BandRange> {
  if (isScalarAxis(a)) throw new Error(`expected a mapped axis, got scalar ${JSON.stringify(a.scalar.id)}`)
  return a
}

/** What the layout frame needs of a node: its dimensions, and its id for a scalar's score. */
export type LayoutSubject = PhysicsSubject & { id: string }

export interface ResolvedPhysics {
  push: ResolvedAxis<PushPhysics>
  /** The two layout axes — the same shape, resolved the same way; either may be a scalar. */
  bandX: ResolvedLayoutAxis
  bandY: ResolvedLayoutAxis
  spring: ResolvedSprings
}

/** The bucket a node falls in on an axis, or undefined when it carries no value there. */
export function bucketOf(on: { readonly mapping: DimensionalMapping }, node: PhysicsSubject): string | undefined {
  return on.mapping.bucketFor(node.dimensions[on.mapping.dimension])?.id
}

/**
 * A bucket's declared physics is the fold of its values' declared physics.
 *
 * Mean for charge and core radius, union for the band — both order-independent,
 * so a host reordering a bucket's values for readability moves nothing. With the
 * identity mapping every bucket has one value and the fold is the value.
 */
function declaredPush(taxonomy: Taxonomy, values: readonly AxisValue[]): PushPhysics {
  let charge = 0, coreRadius = 0
  for (const v of values) {
    const ph = taxonomy.styleOf(v).physics
    charge += ph.charge; coreRadius += ph.coreRadius
  }
  const n = Math.max(values.length, 1)
  return { charge: charge / n, coreRadius: coreRadius / n }
}

function declaredBand(taxonomy: Taxonomy, values: readonly AxisValue[], axis: 'x' | 'y'): BandRange {
  let min = Infinity, max = -Infinity
  for (const v of values) {
    const b = taxonomy.styleOf(v).physics.band[axis]
    min = Math.min(min, b.min); max = Math.max(max, b.max)
  }
  return values.length === 0 ? { ...ABSENT_VALUE_PHYSICS.band } : { min, max }
}

/**
 * The span a scalar axis has until the user drags an end: the declared bands'
 * extent on that axis (the same fold as `declaredBand`, over every declared
 * value) centred on the origin, so the layout keeps its scale when an axis
 * switches kind — and read like a chart: 1 at the top (screen y grows
 * downward) and at the right.
 */
export function defaultSpan(taxonomy: Taxonomy, axis: 'x' | 'y'): ScalarSpan {
  const extent = declaredBand(taxonomy, taxonomy.styleValues, axis)
  const half = (extent.max - extent.min) / 2
  return axis === 'y' ? { zero: half, one: -half } : { zero: -half, one: half }
}

function resolveAxis<T>(
  mapping: DimensionalMapping,
  overrides: ReadonlyMap<string, T>,
  declared: (values: readonly AxisValue[]) => T,
): ResolvedAxis<T> {
  const byBucket = new Map<string, T>()
  for (const bucket of mapping.buckets) {
    byBucket.set(bucket.id, overrides.get(bucket.id) ?? declared(bucket.values))
  }
  return { mapping, byBucket }
}

export function resolvePhysics(params: ChargeParams & GravityParams & LinkParams, taxonomy: Taxonomy): ResolvedPhysics {
  // Declared physics belong to the style axis's values. A bucket on any other
  // axis — a file, a kind — is not a style key, so it starts from the host's
  // TYPICAL declared physics (the same fold, over every declared value) rather
  // than from a lookup that would miss to the fallback style, once per bucket,
  // with a warning about placeholder styling that is not even true.
  const style = taxonomy.styleAxis()
  const pushFor = (m: DimensionalMapping) => m.dimension === style
    ? (values: readonly AxisValue[]) => declaredPush(taxonomy, values)
    : () => declaredPush(taxonomy, taxonomy.styleValues)
  const bandOn = (m: DimensionalMapping, axis: 'x' | 'y') => m.dimension === style
    ? (values: readonly AxisValue[]) => declaredBand(taxonomy, values, axis)
    : () => declaredBand(taxonomy, taxonomy.styleValues, axis)
  const layout = (t: LayoutTuning, axis: 'x' | 'y'): ResolvedLayoutAxis => {
    if (!isScalarTuning(t)) return resolveAxis(t.mapping, t.overrides, bandOn(t.mapping, axis))
    const scalar = taxonomy.scalars.find(sc => sc.id === t.scalar)
    // Loud: a tuning naming a scalar the taxonomy does not know is a host bug.
    // The view never holds one — it reads params retuned for the taxonomy
    // (`retunedFor` falls the axis back on a swap), so this is unreachable
    // from the UI and fires only for a host that built the tuning by hand.
    if (!scalar) throw new Error(`layout axis names scalar ${JSON.stringify(t.scalar)}, which the taxonomy does not declare`)
    return { scalar, span: t.span ?? defaultSpan(taxonomy, axis) }
  }
  return {
    push: resolveAxis(params.pair.mapping, params.pair.push, pushFor(params.pair.mapping)),
    bandX: layout(params.bandX, 'x'),
    bandY: layout(params.bandY, 'y'),
    spring: resolveSprings(params.pair, taxonomy),
  }
}

// ── Per-node accessors over the resolved tables ───────────────────────────────

export function chargeFor(push: ResolvedAxis<PushPhysics>, node: PhysicsSubject): number {
  const b = bucketOf(push, node)
  return (b === undefined ? undefined : push.byBucket.get(b)?.charge) ?? ABSENT_VALUE_PHYSICS.charge
}

export function coreRadiusFor(push: ResolvedAxis<PushPhysics>, node: PhysicsSubject): number {
  const b = bucketOf(push, node)
  return Math.max(
    (b === undefined ? undefined : push.byBucket.get(b)?.coreRadius) ?? ABSENT_VALUE_PHYSICS.coreRadius,
    CORE_RADIUS_MIN,
  )
}

/** One bucket's push physics, for a control surface that iterates buckets. */
export function pushForKey(push: ResolvedAxis<PushPhysics>, bucketId: string): PushPhysics {
  return push.byBucket.get(bucketId) ?? { charge: ABSENT_VALUE_PHYSICS.charge, coreRadius: ABSENT_VALUE_PHYSICS.coreRadius }
}

/** One bucket's rest band as declared/tuned, for a control surface that edits it. */
export function bandRangeFor(band: ResolvedAxis<BandRange>, bucketId: string): BandRange {
  return band.byBucket.get(bucketId) ?? { ...ABSENT_VALUE_PHYSICS.band }
}

/** The rest band for a bucket, or the absent band for no bucket. Control surfaces iterate buckets; forces take nodes. */
export function bandForKey(band: ResolvedAxis<BandRange>, bucketId: string | undefined): BandRange {
  return (bucketId === undefined ? undefined : band.byBucket.get(bucketId)) ?? ABSENT_VALUE_PHYSICS.band
}

export function bandFor(band: ResolvedAxis<BandRange>, node: PhysicsSubject): BandRange {
  return bandForKey(band, bucketOf(band, node))
}

/**
 * The buckets some node of `nodes` falls in, in first-encounter order — the
 * set the band force re-centres on, the radial mapping rings, and the overlay
 * draws (present, never all declared). A node with no value on the axis
 * is in no bucket: it has no band, joins no median, and sits at the axis's
 * centre.
 */
export function presentBuckets<T>(nodes: Iterable<PhysicsSubject>, axis: ResolvedAxis<T>): string[] {
  const seen = new Set<string>()
  for (const n of nodes) {
    const key = bucketOf(axis, n)
    if (key !== undefined) seen.add(key)
  }
  return [...seen]
}

const centerOf = (b: BandRange) => (b.min + b.max) / 2

/**
 * One band centre per bucket present, in first-encounter order. The collection
 * step — not the median — is where the dedup happens, and a dedup that silently
 * degenerated to one entry per node would be invisible in every downstream
 * number except this array's length. Deliberately NOT deduplicated by centre
 * value: several buckets may share a band.
 */
export function bandCenters(nodes: Iterable<PhysicsSubject>, axis: ResolvedAxis<BandRange>): number[] {
  return presentBuckets(nodes, axis).map(key => centerOf(bandForKey(axis, key)))
}

/**
 * Median of the present band centres. Subtracting it keeps the band stack
 * symmetric about the origin on that axis, so both axes share the origin with
 * center gravity. (Editing one band can move the median and so shift the
 * rest; the stack stays centred, which is the property worth keeping.)
 */
export function medianBandCenter(nodes: Iterable<PhysicsSubject>, axis: ResolvedAxis<BandRange>): number {
  const centers = bandCenters(nodes, axis).sort((a, b) => a - b)
  const m = centers.length
  if (m === 0) return 0
  return m % 2 ? centers[(m - 1) / 2] : (centers[m / 2 - 1] + centers[m / 2]) / 2
}

/**
 * Radial mode: each present bucket's band centre maps to a target radius —
 * smallest centre innermost — over the fixed ring span. Buckets with equal
 * centres share a ring; a node in no bucket has no ring and feels no pull.
 */
export function ringRadii(nodes: Iterable<PhysicsSubject>, axis: ResolvedAxis<BandRange>): Map<string, number> {
  const buckets = presentBuckets(nodes, axis)
  const centers = buckets.map(key => centerOf(bandForKey(axis, key)))
  const lo = centers.length ? Math.min(...centers) : 0
  const span = (centers.length ? Math.max(...centers) : 0) - lo || 1
  return new Map(buckets.map((key, i) => [key, RADIAL_R_MIN + ((centers[i] - lo) / span) * (RADIAL_R_MAX - RADIAL_R_MIN)]))
}

/**
 * The frame the band forces act in, computed over the simulation's WHOLE node
 * set: for a mapped axis the median centre (and, on Y, the ring per bucket);
 * for a scalar axis every node's score. One frame for seeding, the force and
 * the overlay, so they agree by construction — a frame over the visible subset
 * would move with every filter toggle and disagree with the seed. It answers
 * two questions per node: where it rests on an axis, and which ring it belongs
 * on.
 */
export interface LayoutFrame {
  readonly centerX: number
  readonly centerY: number
  /** Ring radius per Y bucket (mapped Y only; a scalar Y rings per node). */
  readonly rings: ReadonlyMap<string, number>
  /** A node's rest interval on an axis — a re-centred band, a scalar's point, or the centre itself for a node with no value there. */
  rest(axis: 'x' | 'y', node: LayoutSubject): { lo: number; hi: number }
  /** A node's ring radius in radial mode: its bucket's ring, its scalar's, or the centre (0) for a node with no value on Y. */
  ringOf(node: LayoutSubject): number
}

const AT_CENTRE = { lo: 0, hi: 0 }

// A scalar's answer, checked once per frame: every value finite and in [0, 1].
// Loud, because a value outside the contract would become a rest point or a
// ring radius and nothing downstream could tell it from a real one.
function checkedScores(scalar: ScalarAxis, graph: ReadableGraph): Map<string, number> {
  const raw = scalar.compute(graph)
  for (const [id, s] of raw) {
    if (!Number.isFinite(s)) throw new Error(`scalar ${JSON.stringify(scalar.id)} answered ${String(s)} for node ${JSON.stringify(id)}; a scalar answers a finite number`)
  }
  const scores = scalar.normalize === 'none' ? raw : normalized(raw)
  for (const [id, s] of scores) {
    if (!(Number.isFinite(s) && s >= 0 && s <= 1)) {
      throw new Error(`scalar ${JSON.stringify(scalar.id)} answered ${String(s)} for node ${JSON.stringify(id)}; a scalar answers in [0, 1]`)
    }
  }
  return scores
}

export function layoutFrame(graph: ReadableGraph, resolved: ResolvedPhysics): LayoutFrame {
  const all = [...graph.nodes]
  const centerFor = (a: ResolvedLayoutAxis) => (isScalarAxis(a) ? 0 : medianBandCenter(all, a))
  const scoresFor = (a: ResolvedLayoutAxis) => (isScalarAxis(a) ? checkedScores(a.scalar, graph) : undefined)
  const centerX = centerFor(resolved.bandX)
  const centerY = centerFor(resolved.bandY)
  const scoresX = scoresFor(resolved.bandX)
  const scoresY = scoresFor(resolved.bandY)
  const rings = isScalarAxis(resolved.bandY) ? new Map<string, number>() : ringRadii(all, resolved.bandY)
  const restOn = (a: ResolvedLayoutAxis, center: number, scores: Map<string, number> | undefined, node: LayoutSubject) => {
    if (isScalarAxis(a)) {
      const s = scores?.get(node.id)
      if (s === undefined) return AT_CENTRE
      const p = a.span.zero + s * (a.span.one - a.span.zero)
      return { lo: p, hi: p }
    }
    const bucket = bucketOf(a, node)
    const band = bucket === undefined ? undefined : a.byBucket.get(bucket)
    return band === undefined ? AT_CENTRE : { lo: band.min - center, hi: band.max - center }
  }
  return {
    centerX, centerY, rings,
    rest: (axis, node) => axis === 'x' ? restOn(resolved.bandX, centerX, scoresX, node) : restOn(resolved.bandY, centerY, scoresY, node),
    ringOf: node => {
      if (isScalarAxis(resolved.bandY)) {
        // The same rule as `ringRadii`: the low end of Y is the innermost
        // ring — here the span's low end, whichever of 0 and 1 that is.
        if (scoresY?.get(node.id) === undefined) return 0
        const rest = restOn(resolved.bandY, centerY, scoresY, node)
        const { zero, one } = resolved.bandY.span
        const lo = Math.min(zero, one)
        const extent = Math.abs(one - zero) || 1
        return RADIAL_R_MIN + ((rest.lo - lo) / extent) * (RADIAL_R_MAX - RADIAL_R_MIN)
      }
      const bucket = bucketOf(resolved.bandY, node)
      return (bucket === undefined ? undefined : rings.get(bucket)) ?? 0
    },
  }
}

/** Whether any band axis is pulling, mode-aware: in radial only Y acts. */
export function bandAxesActing(params: GravityParams): boolean {
  return params.radial ? params.gravityY > 0 : params.gravityX > 0 || params.gravityY > 0
}

export function topologicalActing(params: GravityParams): boolean {
  return params.topologicalEnabled && params.gravityTopological > 0
}

/**
 * One stripe of the overlay: a band on an axis and every present bucket that
 * shares it — or, for a scalar axis, the whole span as one gradient:
 * no buckets to name, and `gradient` says which end is 0 and which is 1.
 */
export interface BandStripe {
  readonly lo: number
  readonly hi: number
  readonly buckets: readonly string[]
  readonly gradient?: ScalarSpan
}

/** One ring of the radial overlay: a radius, and every present Y bucket that maps to it. */
export interface BandRing {
  readonly radius: number
  readonly buckets: readonly string[]
}

/**
 * The band overlay as data: what the canvas draws, decided here so a golden can
 * read it. Stripes only while that axis acts in cartesian; rings
 * only while Y acts in radial — the same predicates the tick uses, so the
 * overlay never shows a force that does nothing. `colors` is the view's: one
 * per bucket, keyed by bucket id.
 */
export interface BandOverlay {
  readonly acting: boolean
  readonly x: readonly BandStripe[]
  readonly y: readonly BandStripe[]
  readonly rings: readonly BandRing[]
  readonly colors: ReadonlyMap<string, string>
}

export function bandOverlay(
  nodes: Iterable<PhysicsSubject>,
  params: GravityParams,
  resolved: ResolvedPhysics,
  frame: LayoutFrame,
  /** A bucket's colour, or undefined for a bucket with none — the canvas then draws its one neutral. */
  colorOf: (axis: ResolvedAxis<BandRange>, bucket: string) => string | undefined,
): BandOverlay {
  const all = [...nodes]
  const acting = bandAxesActing(params)
  const colors = new Map<string, string>()
  const withColors = (axis: ResolvedAxis<BandRange>, stripes: BandStripe[]) => {
    for (const st of stripes) for (const b of st.buckets) if (!colors.has(b)) { const c = colorOf(axis, b); if (c !== undefined) colors.set(b, c) }
    return stripes
  }
  if (!acting) return { acting, x: [], y: [], rings: [], colors }
  if (params.radial) {
    // A scalar Y rings per node — continuous, so nothing discrete to draw.
    if (isScalarAxis(resolved.bandY)) return { acting, x: [], y: [], rings: [], colors }
    const byRadius = new Map<number, string[]>()
    for (const [bucket, radius] of frame.rings) {
      const list = byRadius.get(radius)
      if (list) list.push(bucket)
      else byRadius.set(radius, [bucket])
      if (!colors.has(bucket)) { const c = colorOf(resolved.bandY, bucket); if (c !== undefined) colors.set(bucket, c) }
    }
    return { acting, x: [], y: [], rings: [...byRadius].map(([radius, buckets]) => ({ radius, buckets })), colors }
  }
  const stripesOn = (a: ResolvedLayoutAxis, center: number): BandStripe[] =>
    isScalarAxis(a)
      ? [{ lo: Math.min(a.span.zero, a.span.one), hi: Math.max(a.span.zero, a.span.one), buckets: [], gradient: a.span }]
      : withColors(a, bandStripes(all, a, center))
  return {
    acting,
    x: params.gravityX > 0 ? stripesOn(resolved.bandX, frame.centerX) : [],
    y: params.gravityY > 0 ? stripesOn(resolved.bandY, frame.centerY) : [],
    rings: [],
    colors,
  }
}

/**
 * The overlay's stripes on one axis, as data: one per distinct band among the
 * buckets present, re-centred on the frame. Buckets that share a band share a
 * stripe (the default X window, two tiers on one Y band), so the overlay's
 * density reads as bands rather than bucket counts. Pure, so a golden can read
 * it.
 */
export function bandStripes(nodes: Iterable<PhysicsSubject>, axis: ResolvedAxis<BandRange>, center: number): BandStripe[] {
  const byBand = new Map<string, { lo: number; hi: number; buckets: string[] }>()
  for (const bucket of presentBuckets(nodes, axis)) {
    const b = bandForKey(axis, bucket)
    const key = `${b.min}:${b.max}`
    const prev = byBand.get(key)
    if (prev) prev.buckets.push(bucket)
    else byBand.set(key, { lo: b.min - center, hi: b.max - center, buckets: [bucket] })
  }
  return [...byBand.values()]
}

// ── Resolved springs ──────────────────────────────────────────────────────────

/**
 * The spring for an edge whose endpoint the mapping does not bucket — the edge
 * counterpart of ABSENT_VALUE_PHYSICS. Zero stiffness: the edge exerts no pull,
 * which is the only honest answer when nothing says how strongly it should, and
 * it keeps the kernel finite where `undefined` would write NaN into both
 * endpoints on the first tick.
 */
export const ABSENT_EDGE_PHYSICS: SpringPhysics = { strength: 0, distance: 0 }

/**
 * What a control token needs of a spring category: its identity, its two
 * endpoint buckets, its kind and its words. A declared edge type satisfies it;
 * a pair category synthesises it — and neither needs physics or a stroke here
 * (physics is `physicsFor`, and a pair is a spring, never a stroke).
 */
export type EdgeCategoryDescription = Pick<ResolvedEdgeType, 'id' | 'label' | 'sourceValue' | 'targetValue' | 'relation' | 'tooltip'>

/**
 * What a category starts from when nothing declared a spring for it: the mean
 * of the host's declared springs, so a bucket on a foreign axis is tuned from
 * this domain's scale rather than from a number out of another's. A host that
 * declares no springs gets the absent spring, which is inert.
 */
export function typicalSpring(taxonomy: Taxonomy): SpringPhysics {
  const declared = taxonomy.edgeTypes
  if (declared.length === 0) return ABSENT_EDGE_PHYSICS
  let strength = 0, distance = 0
  for (const e of declared) { strength += e.physics.strength; distance += e.physics.distance }
  return { strength: strength / declared.length, distance: distance / declared.length }
}

/**
 * The pair rule's category id: the relation and the unordered bucket pair,
 * encoded so a bucket id containing any separator cannot collide with another
 * pair. Ids are keys, never labels; `describe` turns one back into something a
 * token can show.
 */
function pairId(relation: Relation, a: string, b: string): EdgeTypeId {
  return JSON.stringify(a <= b ? [relation, a, b] : [relation, b, a])
}

function parsePairId(id: EdgeTypeId): [Relation, string, string] | undefined {
  try {
    const t: unknown = JSON.parse(id)
    if (Array.isArray(t) && t.length === 3 && (t[0] === 'containment' || t[0] === 'dependency') &&
      typeof t[1] === 'string' && typeof t[2] === 'string') return [t[0], t[1], t[2]]
  } catch { /* not a pair id */ }
  return undefined
}

/**
 * The spring table, resolved from the pair tuning and the taxonomy.
 *
 * Two classifiers can fill it, and which one is decided here, once, not per
 * edge. On the style axis bucketed by identity, the host's declared table and
 * its prioritized rule apply verbatim: the hand-tuned springs, and a
 * precedence no pair rule reproduces — two of its categories share endpoint
 * values and differ only on the edge's own dispatch. On any other
 * (axis, mapping) the library's pair rule applies: one category per unordered
 * bucket pair per relation, each the host's typical spring until tuned. The
 * pair rule enumerates nothing: a category exists when an edge falls in it,
 * which is what a control surface shows and what the token ceiling counts.
 */
export interface ResolvedSprings {
  readonly mapping: DimensionalMapping
  /**
   * The category of an edge from its endpoints' bucket ids, or undefined when
   * an endpoint is unbucketed, or — on the style axis — when no declared type
   * runs between the edge's endpoint values and the taxonomy's `classifyEdge`
   * names none; such an edge is sprung as typical and drawn neutral.
   */
  classify(edge: GraphEdge, src: string | undefined, tgt: string | undefined): EdgeTypeId | undefined
  /** Effective physics: the override where one exists, else the declared or typical spring. */
  physicsFor(id: EdgeTypeId): SpringPhysics
  /** What a control surface shows for a category — the declared entry, or one synthesized from a pair id. */
  describe(id: EdgeTypeId): EdgeCategoryDescription | undefined
}

export function resolveSprings(pair: PairTuning, taxonomy: Taxonomy): ResolvedSprings {
  const { mapping, spring: overrides } = pair
  if (mapping.dimension === taxonomy.styleAxis() && isIdentityMapping(mapping)) {
    const table = new Map(taxonomy.edgeTypes.map(e => [e.id, e]))
    return {
      mapping,
      // An edge no declared type claims has no category here: it draws neutral
      // and is sprung as typical, and `validateGraph` has named it.
      classify: (edge, src, tgt) => {
        const id = taxonomy.classifyEdge(edge, src, tgt)
        return id !== undefined && table.has(id) ? id : undefined
      },
      physicsFor: id => overrides.get(id) ?? table.get(id)?.physics ?? ABSENT_EDGE_PHYSICS,
      describe: id => table.get(id),
    }
  }
  const typical = typicalSpring(taxonomy)
  const buckets = new Map(mapping.buckets.map(b => [b.id, b]))
  return {
    mapping,
    classify: (edge, src, tgt) =>
      src === undefined || tgt === undefined ? undefined : pairId(relationOf(edge), src, tgt),
    physicsFor: id => overrides.get(id) ?? typical,
    describe: id => {
      const parsed = parsePairId(id)
      if (!parsed) return undefined
      const [relation, a, b] = parsed
      const A = buckets.get(a)
      const B = buckets.get(b)
      if (!A || !B) return undefined
      return {
        id,
        label: `${A.abbreviation}↔${B.abbreviation}`,
        sourceValue: a,
        targetValue: b,
        relation,
        physics: typical,
        tooltip: `${A.label} ↔ ${B.label} ${relation}`,
      }
    },
  }
}

/** The spring an edge is under: its category, if it has one, and the effective physics. */
export interface EdgeCategory {
  strength: number
  distance: number
  /**
   * The category id — what the canvas's active-edge highlight matches to a
   * spring-map token — or undefined for an edge with an unbucketed endpoint.
   */
  key: EdgeTypeId | undefined
}

export function springFor(spring: ResolvedSprings, edge: GraphEdge, src: PhysicsSubject, tgt: PhysicsSubject): EdgeCategory {
  const key = spring.classify(edge, bucketOf(spring, src), bucketOf(spring, tgt))
  const ph = key === undefined ? ABSENT_EDGE_PHYSICS : spring.physicsFor(key)
  return { strength: ph.strength, distance: ph.distance, key }
}

/**
 * The categories some edge of the graph falls in — one token each. Under the
 * pair rule this is the only enumeration there is; under the declared table it
 * is the subset the graph actually uses. O(edges), no table built.
 */
export function presentSpringCategories(
  spring: ResolvedSprings,
  edges: Iterable<GraphEdge>,
  nodeOf: (id: string) => PhysicsSubject | undefined,
): Set<EdgeTypeId> {
  const present = new Set<EdgeTypeId>()
  for (const edge of edges) {
    const src = nodeOf(edge.sourceId)
    const tgt = nodeOf(edge.targetId)
    if (!src || !tgt) continue
    const key = springFor(spring, edge, src, tgt).key
    if (key !== undefined) present.add(key)
  }
  return present
}

// ── Coordinate adapter ────────────────────────────────────────────────────────
//
// Polar conversion about the world origin, with a guard near r = 0 where the
// angle is undefined and a radial force would otherwise spike. Not used by the
// forces here, which work in cartesian coordinates; provided so a radial force
// can express targets in (r, theta) and convert back to (x, y) accelerations.
export function toPolar(x: number, y: number): { r: number; theta: number } {
  const r = Math.hypot(x, y)
  if (r < 1e-6) return { r: 0, theta: 0 }
  return { r, theta: Math.atan2(y, x) }
}

export function fromPolar(r: number, theta: number): { x: number; y: number } {
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

// ── Forces ───────────────────────────────────────────────────────────────────

// Charge force: repulsion between every visible node pair.
//   force = pushMultiplier * strength / (dist² + softening)^chargeExponent
// The softening prevents the close-range singularity; it is per-pair: the
// squared average of the two endpoints' effective core radii
// (rEff = coreRadiusMultiplier × coreRadius[type]). The exponent acts on the
// squared distance directly (no /2) — chargeExponent 1 = inverse-square.
export function applyChargeForce(
  active: SimNode[],
  params: ChargeParams,
  resolved: ResolvedPhysics,
  alpha: number,
  rng: Rng,
): void {
  const crMul = params.coreRadiusMultiplier
  const pushMul = params.pushMultiplier
  const chargeExp = params.chargeExponent
  // Per-node physics once, O(n), before the O(n²) pair loop reads it: each
  // accessor is a dimension read and two map lookups, and the loop below would
  // otherwise make four of those per pair.
  const n = active.length
  const charge = new Float64Array(n)
  const rEff = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    charge[i] = chargeFor(resolved.push, active[i])
    rEff[i] = crMul * coreRadiusFor(resolved.push, active[i])
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = active[i]
      const b = active[j]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let dist2 = dx * dx + dy * dy
      // Coincident nodes: pick a true random unit vector and reset dist²
      // consistently, so the unit direction stays unit and we don't pump a
      // huge force into a degenerate frame.
      if (dist2 < 0.01) {
        const angle = rng() * Math.PI * 2
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        dist2 = 1
      }
      const rawDist = Math.sqrt(dist2)
      // Per-pair softening from the endpoints' core radii.
      const rAvg = (rEff[i] + rEff[j]) / 2
      const softening = rAvg * rAvg
      const strength = (charge[i] + charge[j]) / 2
      // Negate: strength is negative (convention), but force must be positive
      // for repulsion. The exponent acts on (dist² + softening) directly.
      const force = -(alpha * pushMul * strength / Math.pow(dist2 + softening, chargeExp))
      const fx = force * (dx / rawDist)
      const fy = force * (dy / rawDist)
      if (!a.pinned) { a.vx -= fx; a.vy -= fy }
      if (!b.pinned) { b.vx += fx; b.vy += fy }
    }
  }
}

// Link force: spring attraction between connected nodes.
//   force = pullMultiplier * strength * sign(disp) * |disp|^linkExponent / dist
// The per-tick degree map (count of incident active edges per node) biases each
// edge's pull between its endpoints in inverse proportion to their degree, so a
// high-degree node anchors and its lighter neighbours orbit — the standard fix
// for stiff-spring oscillation under explicit Euler integration.
export function applyLinkForce(
  activeEdges: readonly GraphEdge[],
  nodeMap: Map<string, SimNode>,
  params: LinkParams,
  categoryOf: (edge: GraphEdge) => EdgeCategory,
  alpha: number,
  rng: Rng,
): void {
  const degree = new Map<string, number>()
  for (const edge of activeEdges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1)
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1)
  }

  const pullMul = params.pullMultiplier
  const linkExp = params.linkExponent
  const distMul = params.distanceMultiplier
  for (const edge of activeEdges) {
    const source = nodeMap.get(edge.sourceId)
    const target = nodeMap.get(edge.targetId)
    if (!source || !target) continue

    let dx = target.x - source.x
    let dy = target.y - source.y
    let dist = Math.sqrt(dx * dx + dy * dy)
    // Coincident endpoints: use a true random unit vector and reset dist to 1,
    // so the 1/dist factor and the (dx,dy) direction stay sane.
    if (dist < 0.1) {
      const angle = rng() * Math.PI * 2
      dx = Math.cos(angle)
      dy = Math.sin(angle)
      dist = 1
    }

    const cat = categoryOf(edge)
    const restDist = cat.distance * distMul
    const disp = dist - restDist
    const absDisp = Math.abs(disp)
    const sign = disp >= 0 ? 1 : -1
    const force = alpha * pullMul * cat.strength * sign * Math.pow(absDisp, linkExp) / dist
    const fx = force * dx
    const fy = force * dy

    const sd = degree.get(edge.sourceId) ?? 1
    const td = degree.get(edge.targetId) ?? 1
    const bias = sd / (sd + td)

    if (!source.pinned) { source.vx += fx * (1 - bias); source.vy += fy * (1 - bias) }
    if (!target.pinned) { target.vx -= fx * bias; target.vy -= fy * bias }
  }
}

// Radius range the bands map onto in radial mode (uppermost tier innermost).
// Exported so the canvas can draw matching ring guides.
export const RADIAL_R_MIN = 60
export const RADIAL_R_MAX = 540

export function applyBandGravity(
  active: SimNode[],
  params: GravityParams,
  frame: LayoutFrame,
  alpha: number,
  rng: Rng,
): void {
  if (params.radial) {
    applyBandGravityRadial(active, params, frame, alpha, rng)
    return
  }
  // The same rule on both axes: a strength of zero is an axis switched off.
  if (params.gravityX > 0) pullToRest(active, 'x', frame, params.gravityX, params.gravityBandExp, alpha)
  if (params.gravityY > 0) pullToRest(active, 'y', frame, params.gravityY, params.gravityBandExp, alpha)
}

// Pull every node outside its rest interval on one axis back toward the
// nearest edge of it. The frame answers the interval: a band re-centred on the
// median, a scalar's point, or the centre itself for a node with no value. The
// pull never carries a node past its rest in one tick: a point has no band to
// absorb an overshoot, so an uncapped |d|^exp at exp > 1 bounced nodes across
// it every tick up to the velocity ceiling.
function pullToRest(
  active: SimNode[],
  coord: 'x' | 'y',
  frame: LayoutFrame,
  strength: number,
  exp: number,
  alpha: number,
): void {
  const velocity = coord === 'x' ? 'vx' : 'vy'
  for (const node of active) {
    if (node.pinned) continue
    const { lo, hi } = frame.rest(coord, node)
    const p = node[coord]
    let target: number | null = null
    if (p < lo) target = lo
    else if (p > hi) target = hi
    if (target !== null) {
      node[velocity] -= bandForce(p - target, exp, alpha * strength)
    }
  }
}

// Restoring impulse for the band springs: magnitude |d|^exp × scale, signed
// toward the rest (exp = 1 is the linear/Hooke spring; exp > 1 is soft just
// outside the band and stiff far out), and never more than |d| itself — the
// pull reaches the rest, not beyond it. Shared by both axes and the ring pull.
function bandForce(d: number, exp: number, scale: number): number {
  return Math.sign(d) * Math.min(Math.pow(Math.abs(d), exp) * scale, Math.abs(d))
}

// Radial band gravity: the Y axis's present band centres map to target radii
// (smallest centre innermost) and each node's distance from the origin is
// pulled toward its bucket's ring. Charge distributes nodes around the ring; X
// has no meaning here and is ignored.
function applyBandGravityRadial(
  active: SimNode[],
  params: GravityParams,
  frame: LayoutFrame,
  alpha: number,
  rng: Rng,
): void {
  const gy = params.gravityY
  for (const node of active) {
    if (node.pinned) continue
    const targetR = frame.ringOf(node)
    const r = Math.hypot(node.x, node.y)
    if (r < 1e-6) {
      // No defined direction at the origin — give a tiny outward kick so the
      // ring pull has something to act on next tick. A node whose ring IS the
      // origin (no value on Y) is at rest there.
      if (targetR > 0) {
        node.vx += (rng() - 0.5)
        node.vy += (rng() - 0.5)
      }
      continue
    }
    const f = bandForce(r - targetR, params.gravityBandExp, alpha * gy)
    node.vx -= (node.x / r) * f
    node.vy -= (node.y / r) * f
  }
}

// Topological gravity. A single-sided inward pull whose strength scales with a
// node's downstream-depth score, drawing the orchestrators atop deep call chains
// toward the focal point while leaving leaves (score 0) untouched —
// charge handles spreading those outward. Origin-relative, so it is independent
// of the band layout. In the cartesian interpretation the focal point is "up",
// toward the top of the world; in radial mode (focal = origin) it is the centre.
const TOPOLOGICAL_FOCAL_Y = -350

export function applyTopologicalGravity(
  active: SimNode[],
  params: GravityParams,
  alpha: number,
  scores?: Map<string, number>,
): void {
  const gt = params.gravityTopological
  if (gt <= 0 || !scores) return
  const exp = params.gravityTopologicalExp
  const radial = params.radial
  for (const node of active) {
    if (node.pinned) continue
    const score = scores.get(node.id) ?? 0
    if (score <= 0) continue
    // Shape the depth score so the deepest roots dominate (score^exp keeps the
    // deepest root at full pull while mid/low scores fall off fast). Leaves
    // (score 0) feel nothing — charge spreads those outward.
    const weight = Math.pow(score, exp)
    if (radial) {
      // Focal point is the origin: well-connected nodes pulled inward.
      node.vx -= node.x * alpha * gt * weight
      node.vy -= node.y * alpha * gt * weight
    } else {
      // Focal point is "up" toward the top of the world.
      node.vy -= (node.y - TOPOLOGICAL_FOCAL_Y) * alpha * gt * weight
    }
  }
}

// Center gravity. A radial pull toward the world origin — the standard cohesion
// force for force-directed charts. It is the baseline anchor when neither band
// nor topological gravity is shaping the layout; off (strength 0) by default.
export function applyCenterGravity(active: SimNode[], params: GravityParams, alpha: number): void {
  const gc = params.gravityCenter
  if (gc <= 0) return
  for (const node of active) {
    if (node.pinned) continue
    node.vx -= node.x * alpha * gc
    node.vy -= node.y * alpha * gc
  }
}
