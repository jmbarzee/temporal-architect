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

import type { DimensionId, DimensionValue } from './dimension'
import { isIdentityMapping } from './dimension'
import type { GraphEdge } from './model'
import { isContainment } from './model'
import type { ChargeParams, LinkParams, GravityParams, SimNode, AxisTuning, PushPhysics, BandRange } from './simulation'
import type { Ontology } from './ontology'
import type { DimensionalMapping } from './dimension'
import type { EdgeCategoryKind, EdgeTypeDefinition, EdgeTypeId, SpringPhysics } from './taxonomy'
import type { Rng } from './rng'

/** The minimum a force needs of a node in order to look up its physics. */
export type PhysicsSubject = { dimensions: Readonly<Record<DimensionId, DimensionValue>> }

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
 * non-participants is a change to the force model, which belongs with the
 * push/pull rework rather than in a unit whose contract is "no behavior change".
 * See DECISIONS.md D31. The effect on neighbours is under golden, so the
 * trade cannot drift silently.
 */
export const ABSENT_VALUE_PHYSICS = {
  charge: 0,
  coreRadius: CORE_RADIUS_MIN,
  yBand: { min: 0, max: 0 },
} as const

// ── Resolved physics ──────────────────────────────────────────────────────────
//
// `AxisTuning` is sparse (only what the user changed) and the kernels are hot
// (four reads per pair, O(n²)). So the tables are resolved ONCE per
// (params, taxonomy) into dense per-bucket maps here, and the kernels read
// those. Resolution is the only place the taxonomy's declared physics is
// consulted for the forces, and it never runs inside a loop (T25).

/** A per-bucket table, resolved from one axis's tuning and the taxonomy. */
export interface ResolvedAxis<T> {
  readonly mapping: DimensionalMapping
  readonly byBucket: ReadonlyMap<string, T>
}

export interface ResolvedPhysics {
  push: ResolvedAxis<PushPhysics>
  band: ResolvedAxis<BandRange>
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
function declaredPush(ontology: Ontology, values: readonly DimensionValue[]): PushPhysics {
  let charge = 0, coreRadius = 0
  for (const v of values) {
    const ph = ontology.styleForKey(v).physics
    charge += ph.charge; coreRadius += ph.coreRadius
  }
  const n = Math.max(values.length, 1)
  return { charge: charge / n, coreRadius: coreRadius / n }
}

function declaredBand(ontology: Ontology, values: readonly DimensionValue[]): BandRange {
  let min = Infinity, max = -Infinity
  for (const v of values) {
    const b = ontology.styleForKey(v).physics.yBand
    min = Math.min(min, b.min); max = Math.max(max, b.max)
  }
  return values.length === 0 ? { ...ABSENT_VALUE_PHYSICS.yBand } : { min, max }
}

function resolveAxis<T>(
  tuning: AxisTuning<T>,
  declared: (values: readonly DimensionValue[]) => T,
): ResolvedAxis<T> {
  const byBucket = new Map<string, T>()
  for (const bucket of tuning.mapping.buckets) {
    byBucket.set(bucket.id, tuning.overrides.get(bucket.id) ?? declared(bucket.values))
  }
  return { mapping: tuning.mapping, byBucket }
}

export function resolvePhysics(params: ChargeParams & GravityParams & LinkParams, ontology: Ontology): ResolvedPhysics {
  return {
    push: resolveAxis(params.push, values => declaredPush(ontology, values)),
    band: resolveAxis(params.band, values => declaredBand(ontology, values)),
    spring: resolveSprings(params.spring, ontology),
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
  return band.byBucket.get(bucketId) ?? { ...ABSENT_VALUE_PHYSICS.yBand }
}

export interface YBand {
  yMin: number
  yMax: number
}

/** The rest band for a bucket. Control surfaces iterate buckets; forces take nodes. */
export function bandForKey(band: ResolvedAxis<BandRange>, bucketId: string | undefined): YBand {
  const b = (bucketId === undefined ? undefined : band.byBucket.get(bucketId)) ?? ABSENT_VALUE_PHYSICS.yBand
  return { yMin: b.min, yMax: b.max }
}

export function bandFor(band: ResolvedAxis<BandRange>, node: PhysicsSubject): YBand {
  return bandForKey(band, bucketOf(band, node))
}

// ── Resolved springs ──────────────────────────────────────────────────────────

/**
 * One default spring for a category nothing declared and nobody tuned — the
 * pair rule's starting point, mid-range on the control surface's axes.
 */
export const DEFAULT_SPRING: SpringPhysics = { strength: 1, distance: 450 }

/**
 * The spring for an edge whose endpoint the mapping does not bucket — the edge
 * counterpart of ABSENT_VALUE_PHYSICS. Zero stiffness: the edge exerts no pull,
 * which is the only honest answer when nothing says how strongly it should, and
 * it keeps the kernel finite where `undefined` would write NaN into both
 * endpoints on the first tick.
 */
export const ABSENT_EDGE_PHYSICS: SpringPhysics = { strength: 0, distance: 0 }

/**
 * The spring table, resolved from one axis's tuning and the taxonomy.
 *
 * Two classifiers can fill it, and which one is decided here, once, not per
 * edge. On the style axis bucketed by identity, the host's declared table and
 * its prioritized rule apply verbatim (D2): the hand-tuned springs, and a
 * precedence no pair rule reproduces — two of its categories share endpoint
 * values and differ only on the edge's own dispatch (T14). On any other
 * (axis, mapping) the library's pair rule applies: one
 * category per unordered bucket pair per relation, each `DEFAULT_SPRING` until
 * tuned. `categories.length` is the token count the 24-ceiling bounds.
 */
export interface ResolvedSprings {
  readonly mapping: DimensionalMapping
  /** Every category in control-panel order, carrying its DECLARED physics. */
  readonly categories: readonly EdgeTypeDefinition[]
  /** Effective physics per category: the override where one exists, else the declared. */
  readonly byCategory: ReadonlyMap<EdgeTypeId, SpringPhysics>
  /** The category of an edge, from its endpoints' bucket ids. */
  readonly classify: (edge: GraphEdge, src: string | undefined, tgt: string | undefined) => EdgeTypeId
}

function pairId(relation: EdgeCategoryKind, a: string | undefined, b: string | undefined): EdgeTypeId {
  const [lo, hi] = (a ?? '') <= (b ?? '') ? [a, b] : [b, a]
  return `${relation}|${lo ?? '-'}|${hi ?? '-'}`
}

const RELATIONS: readonly EdgeCategoryKind[] = ['containment', 'dependency']

/** The pair rule's categories: relation-major, then bucket declaration order. */
function pairCategories(mapping: DimensionalMapping): EdgeTypeDefinition[] {
  const out: EdgeTypeDefinition[] = []
  const { buckets } = mapping
  for (const relation of RELATIONS) {
    for (let i = 0; i < buckets.length; i++) {
      for (let j = i; j < buckets.length; j++) {
        const a = buckets[i], b = buckets[j]
        out.push({
          id: pairId(relation, a.id, b.id),
          label: `${a.abbreviation}↔${b.abbreviation}`,
          sourceType: a.id,
          targetType: b.id,
          category: relation,
          directional: false,
          physics: DEFAULT_SPRING,
          tooltip: `${a.label} ↔ ${b.label} ${relation}`,
        })
      }
    }
  }
  return out
}

export function resolveSprings(tuning: AxisTuning<SpringPhysics>, ontology: Ontology): ResolvedSprings {
  const { mapping, overrides } = tuning
  const declared = mapping.dimension === ontology.styleAxis() && isIdentityMapping(mapping)
  const categories = declared ? ontology.edgeTypes : pairCategories(mapping)
  const byCategory = new Map<EdgeTypeId, SpringPhysics>()
  for (const c of categories) byCategory.set(c.id, overrides.get(c.id) ?? c.physics)
  const classify = declared
    ? (edge: GraphEdge, src: string | undefined, tgt: string | undefined): EdgeTypeId => {
        const id = ontology.resolveEdgeType(edge, src, tgt)
        // Loud, deliberately: an id the host's rule returns but its table does
        // not declare is a host bug, and it would otherwise surface as an edge
        // with no pull somewhere far from the cause.
        if (!byCategory.has(id)) {
          throw new Error(
            `edge type ${JSON.stringify(id)} is resolved by the taxonomy's rule but has no ` +
            'entry in its edgeTypes; the two must be kept in step.',
          )
        }
        return id
      }
    : (edge: GraphEdge, src: string | undefined, tgt: string | undefined): EdgeTypeId =>
        pairId(isContainment(edge) ? 'containment' : 'dependency', src, tgt)
  return { mapping, categories, byCategory, classify }
}

/** The spring an edge is under: its category, and the effective physics. */
export interface EdgeCategory {
  strength: number
  distance: number
  /** The category id — what the canvas's active-edge highlight matches to a spring-map token. */
  key: EdgeTypeId
}

export function springFor(spring: ResolvedSprings, edge: GraphEdge, src: PhysicsSubject, tgt: PhysicsSubject): EdgeCategory {
  const key = spring.classify(edge, bucketOf(spring, src), bucketOf(spring, tgt))
  const ph = spring.byCategory.get(key) ?? ABSENT_EDGE_PHYSICS
  return { strength: ph.strength, distance: ph.distance, key }
}

/** One category's effective spring, for a control surface that iterates categories. */
export function springForKey(spring: ResolvedSprings, id: EdgeTypeId): SpringPhysics {
  return spring.byCategory.get(id) ?? ABSENT_EDGE_PHYSICS
}

/**
 * The categories some edge of the graph actually falls in. A control surface
 * shows one token per category present, not per category possible: under the
 * pair rule the possible set is every bucket pair, most of which no edge joins.
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
    if (src && tgt) present.add(springFor(spring, edge, src, tgt).key)
  }
  return present
}

// ── Coordinate adapter (for the deferred radial gravity mode, issue 51) ──────
//
// Polar conversion about the world origin, with a guard near r = 0 where the
// angle is undefined and a radial force would otherwise spike. Not used by the
// current cartesian forces; provided so the radial gravity work (issue 51) can
// express targets in (r, theta) and convert back to (x, y) accelerations.
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
  // otherwise make four of those per pair (T25).
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
  activeEdges: GraphEdge[],
  nodeMap: Map<string, SimNode>,
  params: LinkParams,
  spring: ResolvedSprings,
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

    const cat = springFor(spring, edge, source, target)
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

// One band centre per *distinct type present* in `active`, in first-encounter
// order. Exported because the collection step — not the median — is where the
// dedup happens, and a dedup that silently degenerates to one entry per node is
// invisible in every downstream number except this array's length.
//
// Deliberately NOT deduplicated by centre value: several types share a band, so
// the entry count and the distinct-value count differ (7 types, 4 distinct
// centres).
export function bandCenters(active: SimNode[], resolved: ResolvedPhysics): number[] {
  // Deduplicated by VALUE, which is why values are interned strings. A `Set`
  // deduplicates a string by value and an object by identity, so a composite
  // key here would collect one entry per node and move the median the whole
  // stack is re-centred on — with no type error and no crash.
  const seen = new Set<DimensionValue | undefined>()
  const centers: number[] = []
  for (const n of active) {
    const key = bucketOf(resolved.band, n)
    if (seen.has(key)) continue
    seen.add(key)
    const b = bandForKey(resolved.band, key)
    centers.push((b.yMin + b.yMax) / 2)
  }
  return centers
}

// Median of the band centres of the node types present in `active`. Subtracting
// it keeps the band stack symmetric about the origin, so editing or toggling
// bands doesn't shift the whole graph vertically (and it shares the origin with
// center gravity, so swapping forces doesn't lurch the layout).
function medianBandCenter(active: SimNode[], resolved: ResolvedPhysics): number {
  const centers = bandCenters(active, resolved)
  if (centers.length === 0) return 0
  centers.sort((a, b) => a - b)
  const m = centers.length
  return m % 2 ? centers[(m - 1) / 2] : (centers[m / 2 - 1] + centers[m / 2]) / 2
}

// Hierarchical band gravity. Each node type has a rest band that exerts no force
// inside and pulls toward the nearest edge outside. The mode decides geometry:
//   cartesian — the band is a vertical [yMin, yMax] window (the hierarchy reads
//               top-to-bottom); a global X band keeps the spread bounded. The
//               whole stack is re-centred on the origin each tick (median).
//   radial    — the band maps to a distance-from-origin ring (uppermost tier
//               innermost); angular spread is left to charge.
export function applyBandGravity(
  active: SimNode[],
  params: GravityParams,
  resolved: ResolvedPhysics,
  alpha: number,
  rng: Rng,
): void {
  if (params.gravityMode === 'radial') {
    applyBandGravityRadial(active, params, resolved, alpha, rng)
    return
  }

  const gx = params.gravityX
  const gy = params.gravityY
  const exp = params.gravityBandExp
  const xMin = params.bandXMin
  const xMax = params.bandXMax
  const center = medianBandCenter(active, resolved)
  for (const node of active) {
    if (node.pinned) continue
    let xTarget: number | null = null
    if (node.x < xMin) xTarget = xMin
    else if (node.x > xMax) xTarget = xMax
    if (xTarget !== null) {
      node.vx -= bandForce(node.x - xTarget, exp) * alpha * gx
    }
    // Band shifted so the stack is centred on the origin.
    const band = bandFor(resolved.band, node)
    const yMin = band.yMin - center
    const yMax = band.yMax - center
    let yTarget: number | null = null
    if (node.y < yMin) yTarget = yMin
    else if (node.y > yMax) yTarget = yMax
    if (yTarget !== null) {
      node.vy -= bandForce(node.y - yTarget, exp) * alpha * gy
    }
  }
}

// Restoring force for the band springs: magnitude |d|^exp, signed toward the
// band (exp = 1 is the linear/Hooke spring; exp > 1 is soft just outside the
// band and stiff far out). Shared by both axes and the radial ring pull.
function bandForce(d: number, exp: number): number {
  return Math.sign(d) * Math.pow(Math.abs(d), exp)
}

// Radial band gravity: map each present type's band centre to a target radius
// (smallest centre = innermost ring) and pull each node's distance-from-origin
// toward its type's ring. Charge handles distributing nodes around the ring.
function applyBandGravityRadial(
  active: SimNode[],
  params: GravityParams,
  resolved: ResolvedPhysics,
  alpha: number,
  rng: Rng,
): void {
  const gy = params.gravityY
  const center = new Map<DimensionValue | undefined, number>()
  for (const n of active) {
    const key = bucketOf(resolved.band, n)
    if (center.has(key)) continue
    center.set(key, (b => (b.yMin + b.yMax) / 2)(bandForKey(resolved.band, key)))
  }
  if (center.size === 0) return
  const centers = [...center.values()]
  const lo = Math.min(...centers)
  const span = Math.max(...centers) - lo || 1
  for (const node of active) {
    if (node.pinned) continue
    const c = center.get(bucketOf(resolved.band, node))
    if (c === undefined) continue
    const targetR = RADIAL_R_MIN + ((c - lo) / span) * (RADIAL_R_MAX - RADIAL_R_MIN)
    const r = Math.hypot(node.x, node.y)
    if (r < 1e-6) {
      // No defined direction at the origin — give a tiny outward kick so the
      // ring pull has something to act on next tick.
      node.vx += (rng() - 0.5)
      node.vy += (rng() - 0.5)
      continue
    }
    const f = bandForce(r - targetR, params.gravityBandExp)
    node.vx -= (node.x / r) * f * alpha * gy
    node.vy -= (node.y / r) * f * alpha * gy
  }
}

// Topological gravity. A single-sided inward pull whose strength scales with a
// node's downstream-depth score, drawing the orchestrators atop deep call chains
// toward the focal point while leaving leaves (score 0) untouched —
// charge handles spreading those outward. Origin-relative, so it is independent
// of the band layout. In the (current) cartesian interpretation the focal point
// is "up", toward the top of the world; the radial interpretation (focal =
// origin) lands with the radial gravity mode (issue 51).
const TOPOLOGICAL_FOCAL_Y = -350

export function applyTopologicalGravity(
  active: SimNode[],
  params: GravityParams,
  alpha: number,
  scores?: Map<string, number>,
): void {
  const gt = params.gravityDownstream
  if (gt <= 0 || !scores) return
  const exp = params.gravityTopologicalExp
  const radial = params.gravityMode === 'radial'
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
