// Force-directed simulation engine.
// Implements GRAPH_VIEW.md § Layout: Force-Directed Simulation.

import type { GraphNode, GraphEdge, Graph, NodeType } from './model'

export interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

export interface ForceParams {
  // Charge strengths (repulsion, negative values) — one per node type.
  // L1: namespace. L2: worker. L3: workflow, activity, nexusService.
  chargeNamespace: number
  chargeWorker: number
  chargeWorkflow: number
  chargeActivity: number
  chargeNexusService: number

  // Spring constants (k) per edge category.
  // Containment (parent ↔ child):
  linkNsToWorker: number          // Namespace ↔ Worker
  linkWorkerToWorkflow: number    // Worker ↔ Workflow
  linkWorkerToActivity: number    // Worker ↔ Activity
  linkWorkerToNexus: number       // Worker ↔ NexusService
  // Dependency (caller → callee):
  linkNsToNs: number               // Namespace ↔ Namespace
  linkWorkerToWorker: number       // Worker ↔ Worker
  linkWorkflowToWorkflow: number   // Workflow ↔ Workflow
  linkWorkflowToActivity: number   // Workflow ↔ Activity
  linkActivityToActivity: number   // Activity ↔ Activity

  // Rest distances per edge category (mirror the link strengths above).
  distNsToWorker: number
  distWorkerToWorkflow: number
  distWorkerToActivity: number
  distWorkerToNexus: number
  distNsToNs: number
  distWorkerToWorker: number
  distWorkflowToWorkflow: number
  distWorkflowToActivity: number
  distActivityToActivity: number

  // Hierarchical gravity. The graph has an inherent vertical hierarchy
  // (namespace → worker → definition) so gravity is split into two axes:
  //
  //   X axis — every node is pulled toward x = 0. One global strength.
  //   Y axis — each node type has a "rest band" [min, max]; the node
  //            experiences zero Y force inside its band and is pulled toward
  //            the nearest band edge when outside it. One global strength.
  //
  // This produces a layered layout (NS at top, L3 at bottom) that anchors
  // world coordinates rather than letting the centre drift.
  gravityX: number
  gravityY: number
  bandYMinNamespace: number
  bandYMaxNamespace: number
  bandYMinWorker: number
  bandYMaxWorker: number
  bandYMinWorkflow: number
  bandYMaxWorkflow: number
  bandYMinActivity: number
  bandYMaxActivity: number
  bandYMinNexusService: number
  bandYMaxNexusService: number

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

// Defaults reflect a hand-tuned starting point captured from interactive use:
// gentle gradient of repulsion across the hierarchy (L1 strongest, L3 weakest),
// looser springs at the top of the tree (NS↔NS) and tighter springs deeper
// (Wf↔Wf), and a sub-quadratic charge falloff so neighbours stay legible while
// distant nodes still get pushed apart.
export const DEFAULT_PARAMS: ForceParams = {
  // Charges (all negative = repulsion).
  chargeNamespace: -450,
  chargeWorker: -150,
  chargeWorkflow: -50,
  chargeActivity: -50,
  chargeNexusService: -50,

  // Spring constants. Higher up the tree → weaker springs (the structure
  // breathes); deeper in the tree → stiffer springs (siblings stay close).
  linkNsToNs: 0.05,
  linkNsToWorker: 0.20,
  linkWorkerToWorker: 0.40,
  linkWorkerToWorkflow: 0.60,
  linkWorkerToActivity: 0.60,
  linkWorkerToNexus: 0.60,
  linkWorkflowToWorkflow: 0.75,
  linkWorkflowToActivity: 0.75,
  linkActivityToActivity: 0.75,

  // Rest distances follow the same shape: bigger at the top, smaller at L3.
  distNsToNs: 450,
  distNsToWorker: 250,
  distWorkerToWorker: 200,
  distWorkerToWorkflow: 110,
  distWorkerToActivity: 110,
  distWorkerToNexus: 110,
  distWorkflowToWorkflow: 70,
  distWorkflowToActivity: 70,
  distActivityToActivity: 70,

  // Hierarchical gravity. Default Y bands stack the hierarchy top-to-bottom
  // (smaller Y = higher on screen): NS up top, Worker just below, all three
  // L3 types share a single deep band so they read as a single layer unless
  // the user separates them.
  gravityX: 0.04,
  gravityY: 0.06,
  bandYMinNamespace: -400,
  bandYMaxNamespace: -250,
  bandYMinWorker: -150,
  bandYMaxWorker: -50,
  bandYMinWorkflow: 100,
  bandYMaxWorkflow: 250,
  bandYMinActivity: 100,
  bandYMaxActivity: 250,
  bandYMinNexusService: 100,
  bandYMaxNexusService: 250,

  alphaDecay: 0.005,
  alphaMin: 0.001,
  velocityDecay: 0.4,

  chargeSoftening: 900,
  pushMultiplier: 1.0,
  pullMultiplier: 1.0,
  distanceMultiplier: 1.0,
  chargeExponent: 1.2,
  linkExponent: 1.0,
}

export function chargeForType(params: ForceParams, nodeType: NodeType): number {
  switch (nodeType) {
    case 'namespace': return params.chargeNamespace
    case 'worker': return params.chargeWorker
    case 'workflow': return params.chargeWorkflow
    case 'activity': return params.chargeActivity
    case 'nexusService': return params.chargeNexusService
  }
}

export interface YBand {
  yMin: number
  yMax: number
}

export function bandForType(params: ForceParams, nodeType: NodeType): YBand {
  switch (nodeType) {
    case 'namespace':
      return { yMin: params.bandYMinNamespace, yMax: params.bandYMaxNamespace }
    case 'worker':
      return { yMin: params.bandYMinWorker, yMax: params.bandYMaxWorker }
    case 'workflow':
      return { yMin: params.bandYMinWorkflow, yMax: params.bandYMaxWorkflow }
    case 'activity':
      return { yMin: params.bandYMinActivity, yMax: params.bandYMaxActivity }
    case 'nexusService':
      return { yMin: params.bandYMinNexusService, yMax: params.bandYMaxNexusService }
  }
}

export const ALL_NODE_TYPES: NodeType[] = [
  'namespace', 'worker', 'workflow', 'activity', 'nexusService',
]

interface EdgeCategory {
  strength: number
  distance: number
}

// Categorize an edge by its endpoint node types. Containment edges always
// have a Worker on one side; dependency edges live within a single level.
// L3↔L3 dependency edges are split by the (workflow, activity) pair: nexus
// calls resolve to their backing workflow during build, so nexusService nodes
// never appear as a dependency endpoint.
export function edgeCategory(params: ForceParams, edge: GraphEdge): EdgeCategory {
  const src = edge.sourceNodeType
  const tgt = edge.targetNodeType

  if (edge.edgeType === 'containment') {
    // L3 → Worker (build.ts always emits L3 as source for these edges).
    if (src === 'workflow' || tgt === 'workflow') {
      return { strength: params.linkWorkerToWorkflow, distance: params.distWorkerToWorkflow }
    }
    if (src === 'activity' || tgt === 'activity') {
      return { strength: params.linkWorkerToActivity, distance: params.distWorkerToActivity }
    }
    if (src === 'nexusService' || tgt === 'nexusService') {
      return { strength: params.linkWorkerToNexus, distance: params.distWorkerToNexus }
    }
    // Worker → Namespace
    return { strength: params.linkNsToWorker, distance: params.distNsToWorker }
  }

  // Dependency / nexusDependency
  if (src === 'namespace' || tgt === 'namespace') {
    return { strength: params.linkNsToNs, distance: params.distNsToNs }
  }
  if (src === 'worker' || tgt === 'worker') {
    return { strength: params.linkWorkerToWorker, distance: params.distWorkerToWorker }
  }
  // L3↔L3: differentiate Wf↔Wf, Wf↔Act, Act↔Act.
  if (src === 'workflow' && tgt === 'workflow') {
    return { strength: params.linkWorkflowToWorkflow, distance: params.distWorkflowToWorkflow }
  }
  if (src === 'activity' && tgt === 'activity') {
    return { strength: params.linkActivityToActivity, distance: params.distActivityToActivity }
  }
  // Mixed Wf/Act in either direction.
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
    for (const node of graph.nodes.values()) {
      const band = bandForType(this.params, node.nodeType)
      const yCenter = (band.yMin + band.yMax) / 2
      const yJitter = Math.max(20, (band.yMax - band.yMin) / 2)
      const sim: SimNode = {
        ...node,
        x: (Math.random() - 0.5) * 300,
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

  tick(visibleIds?: Set<string>): void {
    if (this.alpha < this.params.alphaMin) return

    const active = visibleIds
      ? this.nodes.filter(n => visibleIds.has(n.id))
      : this.nodes

    const activeEdges = visibleIds
      ? this.edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
      : this.edges

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

      if (!source.pinned) { source.vx += fx; source.vy += fy }
      if (!target.pinned) { target.vx -= fx; target.vy -= fy }
    }

    // Hierarchical gravity. X is anchored to 0 and Y is anchored to a per-type
    // band (zero force inside the band). This anchors world coordinates rather
    // than letting the centre of mass drift, which removes the need for the
    // canvas-side COM compensation that older versions used.
    const gx = this.params.gravityX
    const gy = this.params.gravityY
    for (const node of active) {
      if (node.pinned) continue
      node.vx -= node.x * this.alpha * gx
      const band = bandForType(this.params, node.nodeType)
      let target: number | null = null
      if (node.y < band.yMin) target = band.yMin
      else if (node.y > band.yMax) target = band.yMax
      if (target !== null) {
        node.vy -= (node.y - target) * this.alpha * gy
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
