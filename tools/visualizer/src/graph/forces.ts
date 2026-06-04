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

import type { NodeType, GraphEdge } from './model'
import type { ChargeParams, LinkParams, GravityParams, SimNode } from './simulation'

// ── Per-type / per-edge lookups ─────────────────────────────────────────────
//
// Record<NodeType, keyof CategoryParams> (rather than a switch) makes the
// compiler enforce exhaustiveness for both the NodeType union and the param
// keys — a new node type without an entry here is a build error. Keying on the
// category interface (not the full ForceParams) is what lets the helpers below
// take a narrow slice while still indexing safely.

export const CHARGE_KEY: Record<NodeType, keyof ChargeParams> = {
  namespace:      'chargeNamespace',
  nexusEndpoint:  'chargeNexusEndpoint',
  worker:         'chargeWorker',
  nexusService:   'chargeNexusService',
  workflow:       'chargeWorkflow',
  nexusOperation: 'chargeNexusOperation',
  activity:       'chargeActivity',
}

export const BAND_MIN_KEY: Record<NodeType, keyof GravityParams> = {
  namespace:      'bandYMinNamespace',
  nexusEndpoint:  'bandYMinNexusEndpoint',
  worker:         'bandYMinWorker',
  nexusService:   'bandYMinNexusService',
  workflow:       'bandYMinWorkflow',
  nexusOperation: 'bandYMinNexusOperation',
  activity:       'bandYMinActivity',
}

export const BAND_MAX_KEY: Record<NodeType, keyof GravityParams> = {
  namespace:      'bandYMaxNamespace',
  nexusEndpoint:  'bandYMaxNexusEndpoint',
  worker:         'bandYMaxWorker',
  nexusService:   'bandYMaxNexusService',
  workflow:       'bandYMaxWorkflow',
  nexusOperation: 'bandYMaxNexusOperation',
  activity:       'bandYMaxActivity',
}

export const CORE_RADIUS_KEY: Record<NodeType, keyof ChargeParams> = {
  namespace:      'coreRadiusNamespace',
  nexusEndpoint:  'coreRadiusNexusEndpoint',
  worker:         'coreRadiusWorker',
  nexusService:   'coreRadiusNexusService',
  workflow:       'coreRadiusWorkflow',
  nexusOperation: 'coreRadiusNexusOperation',
  activity:       'coreRadiusActivity',
}

export function chargeForType(params: ChargeParams, nodeType: NodeType): number {
  return params[CHARGE_KEY[nodeType]] as number
}

// Minimum effective core radius. A type dragged to 0 would otherwise drop the
// pair softening toward zero and reintroduce the close-range force singularity
// the softening exists to prevent, so we floor every read at this value.
export const CORE_RADIUS_MIN = 2

export function coreRadiusForType(params: ChargeParams, nodeType: NodeType): number {
  return Math.max(params[CORE_RADIUS_KEY[nodeType]] as number, CORE_RADIUS_MIN)
}

export interface YBand {
  yMin: number
  yMax: number
}

export function bandForType(params: GravityParams, nodeType: NodeType): YBand {
  return {
    yMin: params[BAND_MIN_KEY[nodeType]] as number,
    yMax: params[BAND_MAX_KEY[nodeType]] as number,
  }
}

interface EdgeCategory {
  strength: number
  distance: number
  // The k-field key identifying this category — lets callers (e.g. the canvas
  // active-edge highlight) match an edge to the spring-map token tuning it.
  key: keyof LinkParams
}

// Categorize an edge by its endpoint node types. Containment edges typically
// have a Worker (L2) on one side, but with services living at L2 and
// operations at L3 there are two intra/cross-level cases that need their
// own springs: Worker ↔ Service (L2↔L2 hosting) and Service ↔ Operation
// (L3↔L2 nesting). Dependency edges live within or across levels and
// stratify by the endpoint types so deep call chains get gentler springs.
export function edgeCategory(params: LinkParams, edge: GraphEdge): EdgeCategory {
  const src = edge.sourceNodeType
  const tgt = edge.targetNodeType

  // Unordered endpoint-type test, so each branch matches an edge in either
  // direction without spelling out both orderings.
  const has = (a: NodeType, b: NodeType) =>
    (src === a && tgt === b) || (src === b && tgt === a)

  if (edge.edgeType === 'containment') {
    // NexusOperation ↔ NexusEndpoint composition edge (the endpoint that
    // fronts the operation — its second "parent").
    if (has('nexusOperation', 'nexusEndpoint')) {
      return { strength: params.linkEndpointToOperation, distance: params.distEndpointToOperation, key: 'linkEndpointToOperation' }
    }
    // NexusService ↔ NexusOperation (operation nested under its service).
    if (has('nexusOperation', 'nexusService')) {
      return { strength: params.linkNexusToOperation, distance: params.distNexusToOperation, key: 'linkNexusToOperation' }
    }
    // Worker ↔ NexusService (peer L2 nodes; service is hosted on a worker).
    if (has('worker', 'nexusService')) {
      return { strength: params.linkWorkerToNexus, distance: params.distWorkerToNexus, key: 'linkWorkerToNexus' }
    }
    // NexusEndpoint ↔ Namespace (endpoints declared inside a namespace).
    if (has('nexusEndpoint', 'namespace')) {
      return { strength: params.linkEndpointToNamespace, distance: params.distEndpointToNamespace, key: 'linkEndpointToNamespace' }
    }
    // L3/L4 → Worker (build.ts always emits the child as source).
    if (src === 'workflow' || tgt === 'workflow') {
      return { strength: params.linkWorkerToWorkflow, distance: params.distWorkerToWorkflow, key: 'linkWorkerToWorkflow' }
    }
    if (src === 'activity' || tgt === 'activity') {
      return { strength: params.linkWorkerToActivity, distance: params.distWorkerToActivity, key: 'linkWorkerToActivity' }
    }
    // Worker → Namespace.
    return { strength: params.linkNsToWorker, distance: params.distNsToWorker, key: 'linkNsToWorker' }
  }

  // Dependency
  if (src === 'namespace' || tgt === 'namespace') {
    return { strength: params.linkNsToNs, distance: params.distNsToNs, key: 'linkNsToNs' }
  }
  if (src === 'worker' || tgt === 'worker') {
    return { strength: params.linkWorkerToWorker, distance: params.distWorkerToWorker, key: 'linkWorkerToWorker' }
  }
  // L3↔L3 dependency, nexus-aware and direction-sensitive for the
  // workflow/operation pair — the two directions mean different things:
  //   Workflow → Operation : a workflow makes a nexus call.
  //   Operation → Workflow : an operation delegates to a backing workflow
  //                          (async) or calls one from a sync-op body.
  // Operation → Operation (rare) folds into the nexus-call spring.
  if (src === 'workflow' && tgt === 'nexusOperation') {
    return { strength: params.linkWorkflowToOperation, distance: params.distWorkflowToOperation, key: 'linkWorkflowToOperation' }
  }
  if (src === 'nexusOperation' && tgt === 'workflow') {
    return { strength: params.linkOperationToWorkflow, distance: params.distOperationToWorkflow, key: 'linkOperationToWorkflow' }
  }
  if (has('nexusOperation', 'nexusOperation')) {
    return { strength: params.linkWorkflowToOperation, distance: params.distWorkflowToOperation, key: 'linkWorkflowToOperation' }
  }
  if (has('nexusOperation', 'activity')) {
    return { strength: params.linkOperationToActivity, distance: params.distOperationToActivity, key: 'linkOperationToActivity' }
  }
  if (has('workflow', 'workflow')) {
    return { strength: params.linkWorkflowToWorkflow, distance: params.distWorkflowToWorkflow, key: 'linkWorkflowToWorkflow' }
  }
  // Wf↔Act (in either direction) — the remaining L3/L4 dependency edge type.
  return { strength: params.linkWorkflowToActivity, distance: params.distWorkflowToActivity, key: 'linkWorkflowToActivity' }
}

// ── Coordinate adapter (for the upcoming radial gravity mode) ────────────────
//
// Polar conversion about the world origin, with a guard near r = 0 where the
// angle is undefined and a radial force would otherwise spike. Not used by the
// current cartesian forces; provided so the radial gravity work can express
// targets in (r, theta) and convert back to (x, y) accelerations.
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
export function applyChargeForce(active: SimNode[], params: ChargeParams, alpha: number): void {
  const crMul = params.coreRadiusMultiplier
  const pushMul = params.pushMultiplier
  const chargeExp = params.chargeExponent
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let dist2 = dx * dx + dy * dy
      // Coincident nodes: pick a true random unit vector and reset dist²
      // consistently, so the unit direction stays unit and we don't pump a
      // huge force into a degenerate frame.
      if (dist2 < 0.01) {
        const angle = Math.random() * Math.PI * 2
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        dist2 = 1
      }
      const rawDist = Math.sqrt(dist2)
      // Per-pair softening from the endpoints' core radii.
      const rEffA = crMul * coreRadiusForType(params, a.nodeType)
      const rEffB = crMul * coreRadiusForType(params, b.nodeType)
      const rAvg = (rEffA + rEffB) / 2
      const softening = rAvg * rAvg
      const chargeA = chargeForType(params, a.nodeType)
      const chargeB = chargeForType(params, b.nodeType)
      const strength = (chargeA + chargeB) / 2
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
  alpha: number,
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
      const angle = Math.random() * Math.PI * 2
      dx = Math.cos(angle)
      dy = Math.sin(angle)
      dist = 1
    }

    const cat = edgeCategory(params, edge)
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

// Median of the band centres of the node types present in `active`. Subtracting
// it keeps the band stack symmetric about the origin, so editing or toggling
// bands doesn't shift the whole graph vertically (and it shares the origin with
// center gravity, so swapping forces doesn't lurch the layout).
function medianBandCenter(active: SimNode[], params: GravityParams): number {
  const seen = new Set<NodeType>()
  const centers: number[] = []
  for (const n of active) {
    if (seen.has(n.nodeType)) continue
    seen.add(n.nodeType)
    const b = bandForType(params, n.nodeType)
    centers.push((b.yMin + b.yMax) / 2)
  }
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
export function applyBandGravity(active: SimNode[], params: GravityParams, alpha: number): void {
  if (params.gravityMode === 'radial') {
    applyBandGravityRadial(active, params, alpha)
    return
  }

  const gx = params.gravityX
  const gy = params.gravityY
  const exp = params.gravityBandExp
  const xMin = params.bandXMin
  const xMax = params.bandXMax
  const center = medianBandCenter(active, params)
  for (const node of active) {
    if (node.pinned) continue
    let xTarget: number | null = null
    if (node.x < xMin) xTarget = xMin
    else if (node.x > xMax) xTarget = xMax
    if (xTarget !== null) {
      node.vx -= bandForce(node.x - xTarget, exp) * alpha * gx
    }
    // Band shifted so the stack is centred on the origin.
    const band = bandForType(params, node.nodeType)
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
function applyBandGravityRadial(active: SimNode[], params: GravityParams, alpha: number): void {
  const gy = params.gravityY
  const center = new Map<NodeType, number>()
  for (const n of active) {
    if (center.has(n.nodeType)) continue
    const b = bandForType(params, n.nodeType)
    center.set(n.nodeType, (b.yMin + b.yMax) / 2)
  }
  if (center.size === 0) return
  const centers = [...center.values()]
  const lo = Math.min(...centers)
  const span = Math.max(...centers) - lo || 1
  for (const node of active) {
    if (node.pinned) continue
    const c = center.get(node.nodeType)
    if (c === undefined) continue
    const targetR = RADIAL_R_MIN + ((c - lo) / span) * (RADIAL_R_MAX - RADIAL_R_MIN)
    const r = Math.hypot(node.x, node.y)
    if (r < 1e-6) {
      // No defined direction at the origin — give a tiny outward kick so the
      // ring pull has something to act on next tick.
      node.vx += (Math.random() - 0.5)
      node.vy += (Math.random() - 0.5)
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
// origin) lands with the radial gravity mode.
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
