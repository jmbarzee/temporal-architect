// Force-directed simulation engine.
// Implements GRAPH_VIEW.md § Layout: Force-Directed Simulation.

import type { GraphNode, GraphEdge, Graph } from './model'
import { NODE_TYPE_REGISTRY } from './node-types'
import {
  applyChargeForce,
  applyLinkForce,
  applyBandGravity,
  applyDownstreamGravity,
  bandForType,
} from './forces'

// Re-export so callers that already import ALL_NODE_TYPES from simulation continue to work.
export { ALL_NODE_TYPES } from './node-types'

// The force helpers now live in ./forces; re-export them so existing consumers
// (GraphCanvas, GraphControlPanel, ChargeControls) keep importing them here.
export {
  CHARGE_KEY,
  BAND_MIN_KEY,
  BAND_MAX_KEY,
  CORE_RADIUS_KEY,
  CORE_RADIUS_MIN,
  chargeForType,
  coreRadiusForType,
  bandForType,
  edgeCategory,
} from './forces'
export type { YBand } from './forces'

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

// PUSH — repulsion. Per-type charge strength and core radius, the masters that
// scale them, and the charge falloff exponent.
export interface ChargeParams {
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

  // Core radius (charge softening, expressed as a length) — one per node type.
  // Per pair, the softening added to dist² is the squared average of the two
  // endpoints' effective core radii (rEff = coreRadiusMultiplier × coreRadius).
  // A larger core radius spreads a type's repulsion over a wider, gentler
  // plateau near the centre instead of a sharp spike; it is the per-type
  // successor to the old global `chargeSoftening`.
  coreRadiusNamespace: number
  coreRadiusNexusEndpoint: number
  coreRadiusWorker: number
  coreRadiusWorkflow: number
  coreRadiusActivity: number
  coreRadiusNexusService: number
  coreRadiusNexusOperation: number

  pushMultiplier: number       // scales all charge (repulsion) forces
  coreRadiusMultiplier: number // scales all per-type core radii (charge softening)
  chargeExponent: number       // power of (dist² + softening) in charge falloff (1 = inverse-square)
}

// PULL — spring attraction. Per-edge-category stiffness (k) and rest length,
// the masters that scale them, and the displacement exponent.
export interface LinkParams {
  // Spring constants (k) per edge category.
  // Containment (parent ↔ child):
  linkNsToWorker: number          // Namespace ↔ Worker
  linkWorkerToWorkflow: number    // Worker ↔ Workflow
  linkWorkerToActivity: number    // Worker ↔ Activity
  linkWorkerToNexus: number       // Worker ↔ NexusService
  linkNexusToOperation: number    // NexusService ↔ NexusOperation (intra-L3)
  linkEndpointToNamespace: number // NexusEndpoint ↔ Namespace (nexus containment)
  linkEndpointToOperation: number // NexusEndpoint ↔ NexusOperation (endpoint fronts op)
  // Dependency (caller → callee):
  linkNsToNs: number               // Namespace ↔ Namespace
  linkWorkerToWorker: number       // Worker ↔ Worker
  linkWorkflowToWorkflow: number   // Workflow ↔ Workflow
  linkWorkflowToActivity: number   // Workflow ↔ Activity
  linkWorkflowToOperation: number  // Workflow → NexusOperation (the nexus call)
  linkOperationToWorkflow: number  // NexusOperation → Workflow (backing / sync-op call)
  linkOperationToActivity: number  // NexusOperation ↔ Activity (sync-op body call)

  // Rest distances per edge category (mirror the link strengths above).
  distNsToWorker: number
  distWorkerToWorkflow: number
  distWorkerToActivity: number
  distWorkerToNexus: number
  distNexusToOperation: number
  distEndpointToNamespace: number
  distEndpointToOperation: number
  distNsToNs: number
  distWorkerToWorker: number
  distWorkflowToWorkflow: number
  distWorkflowToActivity: number
  distWorkflowToOperation: number
  distOperationToWorkflow: number
  distOperationToActivity: number

  pullMultiplier: number     // scales all link (attraction) forces
  distanceMultiplier: number // scales all rest distances
  linkExponent: number       // power of displacement in spring force (1 = linear/Hooke)
}

// GRAVITY — hierarchical anchoring. The graph has an inherent vertical hierarchy
// (namespace → worker → definition), so gravity is split into two axes expressed
// as rest bands: a global X band [bandXMin, bandXMax] (no force inside, pull
// toward the nearest edge outside) and a per-type Y band [yMin, yMax]. This
// anchors world coordinates (NS at top, L4 at bottom) rather than letting the
// centre drift, removing the need for canvas-side COM compensation. Plus the
// optional downstream-reach vertical pull.
export interface GravityParams {
  gravityX: number
  gravityY: number
  // Optional vertical-pull force whose target Y is derived from each node's
  // downstream-reach score (0..1, log-normalized in GraphView). Score = 1
  // targets one band-height above the node's own band — i.e. a high-reach
  // workflow drifts upward into the worker band. Default 0 (off).
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
export const DEFAULT_PARAMS: ForceParams = {
  // Charges (all negative = repulsion). Per-type defaults captured from an
  // interactive tuning session on the PUSH charge map: the container/host
  // tiers (endpoint, namespace, worker, service) carry the heaviest repulsion
  // so top-level nodes fan well apart, dropping off through the orchestrator
  // tier (operation, workflow) down to activities. Sourced from the registry
  // alongside each type's core radius.
  chargeNamespace:      NODE_TYPE_REGISTRY.namespace.physics.charge,
  chargeNexusEndpoint:  NODE_TYPE_REGISTRY.nexusEndpoint.physics.charge,
  chargeWorker:         NODE_TYPE_REGISTRY.worker.physics.charge,
  chargeNexusService:   NODE_TYPE_REGISTRY.nexusService.physics.charge,
  chargeWorkflow:       NODE_TYPE_REGISTRY.workflow.physics.charge,
  chargeNexusOperation: NODE_TYPE_REGISTRY.nexusOperation.physics.charge,
  chargeActivity:       NODE_TYPE_REGISTRY.activity.physics.charge,

  // Core radii (charge softening as a length). Per-type defaults captured
  // from an interactive tuning session on the PUSH charge map (sourced from
  // the registry alongside each type's charge).
  coreRadiusNamespace:      NODE_TYPE_REGISTRY.namespace.physics.coreRadius,
  coreRadiusNexusEndpoint:  NODE_TYPE_REGISTRY.nexusEndpoint.physics.coreRadius,
  coreRadiusWorker:         NODE_TYPE_REGISTRY.worker.physics.coreRadius,
  coreRadiusNexusService:   NODE_TYPE_REGISTRY.nexusService.physics.coreRadius,
  coreRadiusWorkflow:       NODE_TYPE_REGISTRY.workflow.physics.coreRadius,
  coreRadiusNexusOperation: NODE_TYPE_REGISTRY.nexusOperation.physics.coreRadius,
  coreRadiusActivity:       NODE_TYPE_REGISTRY.activity.physics.coreRadius,

  // Spring strengths (k = stiffness). These are the spring-map default token
  // positions on the stiffness axis — hand-placed via the control panel.
  linkNsToNs:             0.25,
  linkNsToWorker:         0.30,
  linkWorkerToWorker:     0.30,
  linkWorkerToWorkflow:   0.55,
  linkWorkerToActivity:   0.35,
  linkWorkerToNexus:      1.25,
  linkNexusToOperation:   1.40,
  linkWorkflowToWorkflow: 0.50,
  linkWorkflowToActivity: 1.90,
  linkEndpointToNamespace: 1.00,
  linkEndpointToOperation: 1.50,
  linkWorkflowToOperation: 1.50,
  linkOperationToWorkflow: 1.55,
  linkOperationToActivity: 1.40,

  // Rest distances (length). Spring-map default token positions on the length
  // axis — hand-placed via the control panel. The panel's `length ×` master
  // multiplies these at simulation time.
  distNsToNs:             870,
  distNsToWorker:         800,
  distWorkerToWorker:     720,
  distWorkerToWorkflow:   190,
  distWorkerToActivity:   210,
  distWorkerToNexus:      430,
  distNexusToOperation:   600,
  distWorkflowToWorkflow: 420,
  distWorkflowToActivity:  40,
  distEndpointToNamespace: 690,
  distEndpointToOperation: 470,
  distWorkflowToOperation: 330,
  distOperationToWorkflow: 360,
  distOperationToActivity: 300,

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

  pushMultiplier:       0.4,
  pullMultiplier:       0.6,
  distanceMultiplier:   0.1,
  coreRadiusMultiplier: 1.0,
  chargeExponent:       0.7,  // acts on (dist² + softening); = old 1.4 with the /2 folded in
  linkExponent:         1.0,
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

    // Forces — each scaled by the current alpha, mutating node velocities.
    // (Implemented in ./forces, one function per category.)
    applyChargeForce(active, this.params, this.alpha)
    applyLinkForce(activeEdges, this.nodeMap, this.params, this.alpha)
    applyBandGravity(active, this.params, this.alpha)
    applyDownstreamGravity(active, this.params, this.alpha, downstreamScores)

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

  // Raise alpha to at least `target` without ever cooling a hotter sim.
  // This is the physics primitive behind the control panel's "keep the
  // layout warm while tuning" hook: a parameter edit re-energises the
  // simulation just enough to show its effect, but a still-hot sim is
  // left alone so dragging a slider during settling doesn't dampen it.
  nudge(target = 0.3): void {
    if (this.alpha < target) this.alpha = target
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
