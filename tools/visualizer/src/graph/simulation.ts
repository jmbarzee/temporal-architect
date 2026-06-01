// Force-directed simulation engine.
// Implements GRAPH_VIEW.md § Layout: Force-Directed Simulation.

import type { GraphNode, GraphEdge, Graph, NodeType } from './model'
import { NODE_TYPE_REGISTRY } from './node-types'

// Re-export so callers that already import ALL_NODE_TYPES from simulation continue to work.
export { ALL_NODE_TYPES } from './node-types'

export interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

export interface ForceParams {
  // Charge strengths (repulsion, negative values) — one per node type.
  // L1: namespace. L1.5: nexusEndpoint. L2: worker, nexusService.
  // L3: workflow, nexusOperation. L4: activity.
  chargeNamespace: number
  chargeNexusEndpoint: number
  chargeWorker: number
  chargeWorkflow: number
  chargeActivity: number
  chargeNexusService: number
  chargeNexusOperation: number

  // Spring constants (k) per edge category.
  // Containment (parent ↔ child):
  linkNsToWorker: number          // Namespace ↔ Worker
  linkWorkerToWorkflow: number    // Worker ↔ Workflow
  linkWorkerToActivity: number    // Worker ↔ Activity
  linkWorkerToNexus: number       // Worker ↔ NexusService
  linkNexusToOperation: number    // NexusService ↔ NexusOperation (intra-L3)
  // Dependency (caller → callee):
  linkNsToNs: number               // Namespace ↔ Namespace
  linkWorkerToWorker: number       // Worker ↔ Worker
  linkWorkflowToWorkflow: number   // Workflow ↔ Workflow
  linkWorkflowToActivity: number   // Workflow ↔ Activity

  // Rest distances per edge category (mirror the link strengths above).
  distNsToWorker: number
  distWorkerToWorkflow: number
  distWorkerToActivity: number
  distWorkerToNexus: number
  distNexusToOperation: number
  distNsToNs: number
  distWorkerToWorker: number
  distWorkflowToWorkflow: number
  distWorkflowToActivity: number

  // Hierarchical gravity. The graph has an inherent vertical hierarchy
  // (namespace → worker → definition) so gravity is split into two axes,
  // both expressed as global rest bands:
  //
  //   X axis — one global band [bandXMin, bandXMax]. Inside the band, no X
  //            force; outside it, a pull toward the nearest edge. The band
  //            is wider than zero so a graph with many top-level nodes can
  //            spread horizontally instead of stacking on x = 0.
  //   Y axis — each node type has its own band [yMin, yMax] for the same
  //            reason — namespaces sit at the top, activities at the
  //            bottom, with deliberate empty stripes in between.
  //
  // This produces a layered layout (NS at top, L4 at bottom) that anchors
  // world coordinates rather than letting the centre drift.
  gravityX: number
  gravityY: number
  // Optional vertical-pull force whose target Y is derived from each node's
  // downstream-reach score (0..1, log-normalized in GraphView). Score = 1
  // targets one band-height above the node's own band — i.e. a high-reach
  // workflow drifts upward into the worker band. Default 0 (off); enabling
  // it deliberately fights the per-type Y bands above to surface the call
  // graph's depth structure on top of the structural hierarchy.
  gravityDownstream: number
  bandXMin: number
  bandXMax: number
  bandYMinNamespace: number
  bandYMaxNamespace: number
  bandYMinNexusEndpoint: number
  bandYMaxNexusEndpoint: number
  bandYMinWorker: number
  bandYMaxWorker: number
  bandYMinWorkflow: number
  bandYMaxWorkflow: number
  bandYMinActivity: number
  bandYMaxActivity: number
  bandYMinNexusService: number
  bandYMaxNexusService: number
  bandYMinNexusOperation: number
  bandYMaxNexusOperation: number

  // Simulation dynamics
  alphaDecay: number
  alphaMin: number
  velocityDecay: number

  // Stability controls
  chargeSoftening: number  // added to dist² in charge calc — prevents singularity at close range

  // Category multipliers — master knobs that scale all forces in a group
  pushMultiplier: number     // scales all charge (repulsion) forces
  pullMultiplier: number     // scales all link (attraction) forces
  distanceMultiplier: number // scales all rest distances

  // Force shape — exponents
  chargeExponent: number   // power of distance in charge falloff (2 = inverse-square)
  linkExponent: number     // power of displacement in spring force (1 = linear/Hooke)
}

// Defaults are a hand-tuned baseline captured from interactive use across
// the topic library and the example workflows. The model is intentionally
// charge-dominant: repulsion does most of the layout work, the per-type Y
// bands hold the hierarchy, and the link springs act as short tethers
// rather than rigid rods. Concretely:
//
//   - pushMultiplier 2.6 + chargeExponent 1.4 + chargeSoftening 450
//     produce strong, sharply-decaying repulsion that prevents node
//     overlap and naturally fans siblings apart.
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
export const DEFAULT_PARAMS: ForceParams = {
  // Charges (all negative = repulsion). Tuned to a roughly 8:3:1 gradient
  // L1:L2:L3, with services and operations slightly stronger than their
  // peer types so they stay clearly anchored to their bands. Endpoints
  // sit on the nexus ladder between namespace and service: visually
  // above workers (in their own band), but with weaker repulsion than
  // workers since they're routing aliases rather than orchestration
  // hosts — they shouldn't push other top-level nodes around as hard
  // as workers do.
  chargeNamespace:      NODE_TYPE_REGISTRY.namespace.physics.charge,
  chargeNexusEndpoint:  NODE_TYPE_REGISTRY.nexusEndpoint.physics.charge,
  chargeWorker:         NODE_TYPE_REGISTRY.worker.physics.charge,
  chargeNexusService:   NODE_TYPE_REGISTRY.nexusService.physics.charge,
  chargeWorkflow:       NODE_TYPE_REGISTRY.workflow.physics.charge,
  chargeNexusOperation: NODE_TYPE_REGISTRY.nexusOperation.physics.charge,
  chargeActivity:       NODE_TYPE_REGISTRY.activity.physics.charge,

  // Spring strengths. With pullMultiplier at 0.6 and distanceMultiplier at
  // 0.1 every spring is a *light tether* — these k's mostly determine the
  // ranking of which connections snap closest, not the absolute pull.
  linkNsToNs:             0.05,
  linkNsToWorker:         0.20,
  linkWorkerToWorker:     0.40,
  linkWorkerToWorkflow:   0.60,
  linkWorkerToActivity:   0.30,
  linkWorkerToNexus:      0.40,
  linkNexusToOperation:   0.65,
  linkWorkflowToWorkflow: 0.75,
  linkWorkflowToActivity: 0.45,

  // Rest distances. These are pre-multiplier values; the panel's `dist`
  // master multiplies them at simulation time (currently 0.1, so the
  // effective rest length of a Wk↔Wf edge is 18 world units, etc.). The
  // spread between rows still matters — it sets the *ordering* of which
  // edges are willing to stretch furthest, not the absolute length.
  distNsToNs:             340,
  distNsToWorker:         250,
  distWorkerToWorker:     200,
  distWorkerToWorkflow:   180,
  distWorkerToActivity:   280,
  distWorkerToNexus:      180,
  distNexusToOperation:   140,
  distWorkflowToWorkflow: 120,
  distWorkflowToActivity:  90,

  // Hierarchical gravity. Y bands carry the vertical structure of the
  // layout — strong (gravityY = 0.145) and overlapping at the edges so
  // adjacent tiers can soften their boundary instead of forming a hard
  // stripe. The X band is asymmetric (0..380) because the canvas's
  // initial fit-to-view re-centres anyway; what matters is the band
  // width, which is generous enough to let wide fan-outs spread laterally.
  gravityX: 0.05,
  gravityY: 0.145,
  // Off by default — the experiment lives behind a slider. When non-zero,
  // every node with a positive downstream score gets an additional vy pull
  // toward `bandMin - score * bandHeight`, layered additively on top of the
  // per-type Y-band gravity above.
  gravityDownstream: 0,
  bandXMin:    0,
  bandXMax:  380,
  bandYMinNamespace:      NODE_TYPE_REGISTRY.namespace.physics.yBand.min,
  bandYMaxNamespace:      NODE_TYPE_REGISTRY.namespace.physics.yBand.max,
  bandYMinNexusEndpoint:  NODE_TYPE_REGISTRY.nexusEndpoint.physics.yBand.min,
  bandYMaxNexusEndpoint:  NODE_TYPE_REGISTRY.nexusEndpoint.physics.yBand.max,
  bandYMinWorker:         NODE_TYPE_REGISTRY.worker.physics.yBand.min,
  bandYMaxWorker:         NODE_TYPE_REGISTRY.worker.physics.yBand.max,
  bandYMinNexusService:   NODE_TYPE_REGISTRY.nexusService.physics.yBand.min,
  bandYMaxNexusService:   NODE_TYPE_REGISTRY.nexusService.physics.yBand.max,
  bandYMinNexusOperation: NODE_TYPE_REGISTRY.nexusOperation.physics.yBand.min,
  bandYMaxNexusOperation: NODE_TYPE_REGISTRY.nexusOperation.physics.yBand.max,
  bandYMinWorkflow:       NODE_TYPE_REGISTRY.workflow.physics.yBand.min,
  bandYMaxWorkflow:       NODE_TYPE_REGISTRY.workflow.physics.yBand.max,
  bandYMinActivity:       NODE_TYPE_REGISTRY.activity.physics.yBand.min,
  bandYMaxActivity:       NODE_TYPE_REGISTRY.activity.physics.yBand.max,

  // Dynamics. alphaMin is well below the d3 default (0.001) so the
  // simulation continues into its slow-cooling tail — layouts read as
  // "settled" rather than freezing while springs are still measurably
  // active. friction and cooling are stock.
  alphaDecay:    0.005,
  alphaMin:      0.0001,
  velocityDecay: 0.4,

  chargeSoftening:    450,
  pushMultiplier:     2.6,
  pullMultiplier:     0.6,
  distanceMultiplier: 0.1,
  chargeExponent:     1.4,
  linkExponent:       1.0,
}

// Lookup records that map each NodeType to its corresponding ForceParams field.
// Using Record<NodeType, keyof ForceParams> (rather than a switch) means the
// TypeScript compiler enforces exhaustiveness for both the NodeType union and
// the ForceParams keys — a new node type without an entry here is a build error.
export const CHARGE_KEY: Record<NodeType, keyof ForceParams> = {
  namespace:      'chargeNamespace',
  nexusEndpoint:  'chargeNexusEndpoint',
  worker:         'chargeWorker',
  nexusService:   'chargeNexusService',
  workflow:       'chargeWorkflow',
  nexusOperation: 'chargeNexusOperation',
  activity:       'chargeActivity',
}

export const BAND_MIN_KEY: Record<NodeType, keyof ForceParams> = {
  namespace:      'bandYMinNamespace',
  nexusEndpoint:  'bandYMinNexusEndpoint',
  worker:         'bandYMinWorker',
  nexusService:   'bandYMinNexusService',
  workflow:       'bandYMinWorkflow',
  nexusOperation: 'bandYMinNexusOperation',
  activity:       'bandYMinActivity',
}

export const BAND_MAX_KEY: Record<NodeType, keyof ForceParams> = {
  namespace:      'bandYMaxNamespace',
  nexusEndpoint:  'bandYMaxNexusEndpoint',
  worker:         'bandYMaxWorker',
  nexusService:   'bandYMaxNexusService',
  workflow:       'bandYMaxWorkflow',
  nexusOperation: 'bandYMaxNexusOperation',
  activity:       'bandYMaxActivity',
}

export function chargeForType(params: ForceParams, nodeType: NodeType): number {
  return params[CHARGE_KEY[nodeType]] as number
}

export interface YBand {
  yMin: number
  yMax: number
}

export function bandForType(params: ForceParams, nodeType: NodeType): YBand {
  return {
    yMin: params[BAND_MIN_KEY[nodeType]] as number,
    yMax: params[BAND_MAX_KEY[nodeType]] as number,
  }
}

interface EdgeCategory {
  strength: number
  distance: number
}

// Categorize an edge by its endpoint node types. Containment edges typically
// have a Worker (L2) on one side, but with services living at L2 and
// operations at L3 there are two intra/cross-level cases that need their
// own springs: Worker ↔ Service (L2↔L2 hosting) and Service ↔ Operation
// (L3↔L2 nesting). Dependency edges live within or across levels and
// stratify by the endpoint types so deep call chains get gentler springs.
// NexusOperation behaves like a workflow for dependency springs — it sits
// on the call path and clusters with workflows.
export function edgeCategory(params: ForceParams, edge: GraphEdge): EdgeCategory {
  const src = edge.sourceNodeType
  const tgt = edge.targetNodeType

  if (edge.edgeType === 'containment') {
    // NexusService ↔ NexusOperation (operations live one tier under their
    // service — L3 child anchored to the L2 service that owns it).
    // Same spring applies to the derived NexusOperation ↔ NexusEndpoint
    // composition edges (op's second "parent" — the endpoint that fronts it).
    // The relationship strength is comparable: both encode "this operation
    // is structurally anchored to this nexus-family node", and reusing the
    // spring keeps the slider count down.
    if ((src === 'nexusOperation' && tgt === 'nexusService') ||
        (src === 'nexusService' && tgt === 'nexusOperation') ||
        (src === 'nexusOperation' && tgt === 'nexusEndpoint') ||
        (src === 'nexusEndpoint' && tgt === 'nexusOperation')) {
      return { strength: params.linkNexusToOperation, distance: params.distNexusToOperation }
    }
    // Worker ↔ NexusService (peer L2 nodes; service is hosted on a worker).
    if ((src === 'nexusService' && tgt === 'worker') ||
        (src === 'worker' && tgt === 'nexusService')) {
      return { strength: params.linkWorkerToNexus, distance: params.distWorkerToNexus }
    }
    // L3/L4 → Worker (build.ts always emits the child as source).
    if (src === 'workflow' || tgt === 'workflow') {
      return { strength: params.linkWorkerToWorkflow, distance: params.distWorkerToWorkflow }
    }
    if (src === 'activity' || tgt === 'activity') {
      return { strength: params.linkWorkerToActivity, distance: params.distWorkerToActivity }
    }
    // Worker → Namespace (and the analogous Endpoint → Namespace edge —
    // endpoints sit at L1.5 but their only containment is to a namespace
    // parent, structurally equivalent to the worker → namespace edge).
    return { strength: params.linkNsToWorker, distance: params.distNsToWorker }
  }

  // Dependency
  if (src === 'namespace' || tgt === 'namespace') {
    return { strength: params.linkNsToNs, distance: params.distNsToNs }
  }
  if (src === 'worker' || tgt === 'worker') {
    return { strength: params.linkWorkerToWorker, distance: params.distWorkerToWorker }
  }
  // L3↔L3: collapse nexusOperation to "workflow-equivalent" (it sits on the
  // call path between caller and callee), then differentiate Wf↔Wf and Wf↔Act.
  // Act↔Act dependency edges do not exist — activities cannot call activities.
  const lsrc = src === 'nexusOperation' ? 'workflow' : src
  const ltgt = tgt === 'nexusOperation' ? 'workflow' : tgt
  if (lsrc === 'workflow' && ltgt === 'workflow') {
    return { strength: params.linkWorkflowToWorkflow, distance: params.distWorkflowToWorkflow }
  }
  // Wf↔Act (in either direction) — the only L3/L4 dependency edge type.
  return { strength: params.linkWorkflowToActivity, distance: params.distWorkflowToActivity }
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

export class Simulation {
  nodes: SimNode[]
  edges: GraphEdge[]
  params: ForceParams
  alpha: number

  private nodeMap: Map<string, SimNode>

  constructor(graph: Graph, params?: Partial<ForceParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params }
    this.alpha = 1.0

    // Initialize SimNodes inside their Y bands so the first tick doesn't have
    // to violently relocate them to the hierarchy. X is jittered around 0
    // (the X anchor); Y is jittered within the band centre.
    this.nodes = []
    this.nodeMap = new Map()
    const xCenter = (this.params.bandXMin + this.params.bandXMax) / 2
    const xJitter = Math.max(40, (this.params.bandXMax - this.params.bandXMin) * 0.7)
    for (const node of graph.nodes.values()) {
      const band = bandForType(this.params, node.nodeType)
      const yCenter = (band.yMin + band.yMax) / 2
      const yJitter = Math.max(20, (band.yMax - band.yMin) / 2)
      const sim: SimNode = {
        ...node,
        x: xCenter + (Math.random() - 0.5) * xJitter,
        y: yCenter + (Math.random() - 0.5) * yJitter,
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
          node.x = parent.x + (Math.random() - 0.5) * 20
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

    // Per-tick node degree (count of incident active edges). Used below to
    // scale each edge's contribution to its endpoints by relative degree:
    // a worker with N children would otherwise accumulate N spring forces
    // per tick and overshoot equilibrium, oscillating between two positions
    // every frame (visible as a transparent / ghosted node when looking at
    // the canvas at 60 fps). The d3-force-link "bias" formulation gives
    // each high-degree endpoint a proportionally small share so the sum
    // across its edges stays comparable to a single edge — the heavy node
    // anchors, the lighter node orbits.
    const degree = new Map<string, number>()
    for (const edge of activeEdges) {
      degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1)
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1)
    }

    // Charge force (repulsion between all visible node pairs)
    // force = pushMultiplier * strength / effectiveDist^chargeExponent
    // effectiveDist = sqrt(dist² + softening)  — prevents singularity
    const softening = this.params.chargeSoftening
    const pushMul = this.params.pushMultiplier
    const chargeExp = this.params.chargeExponent
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist2 = dx * dx + dy * dy
        // Coincident nodes: pick a true random unit vector and reset dist²
        // consistently. The previous formulation set dx,dy to random values in
        // [-0.5, 0.5] but left dist² unchanged, so dx/rawDist (intended to be
        // a unit vector) was ~5× too large and pumped huge forces into a
        // degenerate frame, kicking off cascade explosions.
        if (dist2 < 0.01) {
          const angle = Math.random() * Math.PI * 2
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist2 = 1
        }
        const rawDist = Math.sqrt(dist2)
        const effectiveDist = Math.sqrt(dist2 + softening)
        const chargeA = chargeForType(this.params, a.nodeType)
        const chargeB = chargeForType(this.params, b.nodeType)
        const strength = (chargeA + chargeB) / 2
        // Negate: strength is negative (convention), but force must be positive for repulsion
        const force = -(this.alpha * pushMul * strength / Math.pow(effectiveDist, chargeExp))
        const fx = force * (dx / rawDist)
        const fy = force * (dy / rawDist)
        if (!a.pinned) { a.vx -= fx; a.vy -= fy }
        if (!b.pinned) { b.vx += fx; b.vy += fy }
      }
    }

    // Link force (attraction between connected nodes)
    // force = pullMultiplier * strength * sign(disp) * |disp|^linkExponent / dist
    const pullMul = this.params.pullMultiplier
    const linkExp = this.params.linkExponent
    const distMul = this.params.distanceMultiplier
    for (const edge of activeEdges) {
      const source = this.nodeMap.get(edge.sourceId)
      const target = this.nodeMap.get(edge.targetId)
      if (!source || !target) continue

      let dx = target.x - source.x
      let dy = target.y - source.y
      let dist = Math.sqrt(dx * dx + dy * dy)
      // Coincident endpoints: use a true random unit vector and reset dist
      // to its magnitude (1). The previous form left dist clamped at 0.1
      // while randomizing dx,dy in [-0.5, 0.5], so the spring formula's
      // 1/dist factor multiplied force by 10× *and* the (dx,dy) "direction"
      // was up to 5× too large — together pumping ~50× the intended force
      // into a single tick, the kernel of the cascade explosion.
      if (dist < 0.1) {
        const angle = Math.random() * Math.PI * 2
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        dist = 1
      }

      const cat = edgeCategory(this.params, edge)
      const restDist = cat.distance * distMul
      const disp = dist - restDist
      const absDisp = Math.abs(disp)
      const sign = disp >= 0 ? 1 : -1
      const force = this.alpha * pullMul * cat.strength * sign * Math.pow(absDisp, linkExp) / dist
      const fx = force * dx
      const fy = force * dy

      // Degree bias: split the edge's pull between endpoints in inverse
      // proportion to their degree (= heavy nodes barely move, light nodes
      // do most of the orbiting). This is the standard fix for stiff-spring
      // oscillation under explicit Euler integration when one endpoint has
      // many incident edges.
      const sd = degree.get(edge.sourceId) ?? 1
      const td = degree.get(edge.targetId) ?? 1
      const bias = sd / (sd + td)

      if (!source.pinned) { source.vx += fx * (1 - bias); source.vy += fy * (1 - bias) }
      if (!target.pinned) { target.vx -= fx * bias; target.vy -= fy * bias }
    }

    // Hierarchical gravity. Both axes are anchored to a band with no force
    // inside and a pull toward the nearest edge outside — Y is per-type
    // (vertical hierarchy of node levels), X is global (just keeps things
    // from drifting off-screen). Anchoring world coordinates this way
    // removes the need for any canvas-side COM compensation.
    const gx = this.params.gravityX
    const gy = this.params.gravityY
    const xMin = this.params.bandXMin
    const xMax = this.params.bandXMax
    for (const node of active) {
      if (node.pinned) continue
      let xTarget: number | null = null
      if (node.x < xMin) xTarget = xMin
      else if (node.x > xMax) xTarget = xMax
      if (xTarget !== null) {
        node.vx -= (node.x - xTarget) * this.alpha * gx
      }
      const band = bandForType(this.params, node.nodeType)
      let yTarget: number | null = null
      if (node.y < band.yMin) yTarget = band.yMin
      else if (node.y > band.yMax) yTarget = band.yMax
      if (yTarget !== null) {
        node.vy -= (node.y - yTarget) * this.alpha * gy
      }
    }

    // Downstream-Y gravity. Optional, off by default. Pulls each node toward
    // a target Y derived from its downstream-reach score, with high-reach
    // nodes (workflows / nexusOperations near the root of the call graph)
    // floating upward into the tier above their own band.
    //
    // targetY = bandMin - score * bandHeight
    //   score = 0 → top edge of own band → no displacement
    //   score = 1 → one band-height above own band → lifted into next tier
    //
    // Layered additively on top of the per-type band gravity above; we
    // deliberately do NOT reconcile the two — equilibrium depends on the
    // ratio of `gravityDownstream` to `gravityY`, and that's the experiment.
    const gd = this.params.gravityDownstream
    if (gd > 0 && downstreamScores) {
      for (const node of active) {
        if (node.pinned) continue
        const score = downstreamScores.get(node.id) ?? 0
        if (score <= 0) continue
        const band = bandForType(this.params, node.nodeType)
        const targetY = band.yMin - score * (band.yMax - band.yMin)
        node.vy -= (node.y - targetY) * this.alpha * gd
      }
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

    // Cool
    this.alpha = Math.max(this.alpha - this.params.alphaDecay, 0)
  }

  reheat(alpha = 0.5): void {
    this.alpha = alpha
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
  }

  // Seed a node at a given position (used when new nodes appear during a
  // level-toggle transition). X follows the seed point; Y snaps into the
  // node's own band so the hierarchy is honoured immediately.
  seedAt(id: string, x: number, y: number): void {
    const node = this.nodeMap.get(id)
    if (!node) return
    const band = bandForType(this.params, node.nodeType)
    const yClamped = Math.min(Math.max(y, band.yMin), band.yMax)
    node.x = x + (Math.random() - 0.5) * 10
    node.y = yClamped + (Math.random() - 0.5) * 10
    node.vx = 0
    node.vy = 0
  }
}
