// Force-directed simulation engine.
// Implements GRAPH_VIEW.md § Layout: Force-Directed Simulation.

import type { GraphNode, GraphEdge, Graph, NodeLevel } from './model'

export interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

export interface ForceParams {
  // 3 charge strengths (repulsion, negative values) — one per level
  chargeL1: number
  chargeL2: number
  chargeL3: number
  // 5 link strengths (attraction) — one per edge category
  linkNsToNs: number       // Namespace↔Namespace dependency
  linkNsToWorker: number   // Namespace↔Worker containment
  linkWorkerToWorker: number // Worker↔Worker dependency
  linkWorkerToL3: number   // Worker↔L3 containment
  linkL3ToL3: number       // L3↔L3 dependency
  // Center force
  centerStrength: number
  // Link rest distances per edge category
  distNsToNs: number
  distNsToWorker: number
  distWorkerToWorker: number
  distWorkerToL3: number
  distL3ToL3: number
}

export const DEFAULT_PARAMS: ForceParams = {
  chargeL1: -400,
  chargeL2: -200,
  chargeL3: -80,
  linkNsToNs: 0.3,
  linkNsToWorker: 0.5,
  linkWorkerToWorker: 0.3,
  linkWorkerToL3: 0.5,
  linkL3ToL3: 0.3,
  centerStrength: 0.01,
  distNsToNs: 200,
  distNsToWorker: 120,
  distWorkerToWorker: 150,
  distWorkerToL3: 80,
  distL3ToL3: 100,
}

function chargeForLevel(params: ForceParams, level: NodeLevel): number {
  switch (level) {
    case 1: return params.chargeL1
    case 2: return params.chargeL2
    case 3: return params.chargeL3
  }
}

interface EdgeCategory {
  strength: number
  distance: number
}

function edgeCategory(params: ForceParams, edge: GraphEdge): EdgeCategory {
  if (edge.edgeType === 'containment') {
    if (edge.sourceLevel === 3 && edge.targetLevel === 2) {
      return { strength: params.linkWorkerToL3, distance: params.distWorkerToL3 }
    }
    return { strength: params.linkNsToWorker, distance: params.distNsToWorker }
  }
  // dependency or nexusDependency
  if (edge.sourceLevel === 1) return { strength: params.linkNsToNs, distance: params.distNsToNs }
  if (edge.sourceLevel === 2) return { strength: params.linkWorkerToWorker, distance: params.distWorkerToWorker }
  return { strength: params.linkL3ToL3, distance: params.distL3ToL3 }
}

export class Simulation {
  nodes: SimNode[]
  edges: GraphEdge[]
  params: ForceParams
  alpha: number
  alphaDecay: number
  alphaMin: number
  velocityDecay: number

  private nodeMap: Map<string, SimNode>

  constructor(graph: Graph, params?: Partial<ForceParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params }
    this.alpha = 1.0
    this.alphaDecay = 0.005
    this.alphaMin = 0.001
    this.velocityDecay = 0.6

    // Initialize SimNodes with random positions around center
    this.nodes = []
    this.nodeMap = new Map()
    for (const node of graph.nodes.values()) {
      const sim: SimNode = {
        ...node,
        x: (Math.random() - 0.5) * 300,
        y: (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        pinned: false,
      }
      this.nodes.push(sim)
      this.nodeMap.set(sim.id, sim)
    }

    // Seed children at parent positions
    for (const node of this.nodes) {
      if (node.parentId) {
        const parent = this.nodeMap.get(node.parentId)
        if (parent) {
          node.x = parent.x + (Math.random() - 0.5) * 20
          node.y = parent.y + (Math.random() - 0.5) * 20
        }
      }
    }

    this.edges = graph.edges
  }

  getNode(id: string): SimNode | undefined {
    return this.nodeMap.get(id)
  }

  tick(visibleIds?: Set<string>): void {
    if (this.alpha < this.alphaMin) return

    const active = visibleIds
      ? this.nodes.filter(n => visibleIds.has(n.id))
      : this.nodes

    const activeEdges = visibleIds
      ? this.edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
      : this.edges

    // Charge force (repulsion between all visible node pairs)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist2 = dx * dx + dy * dy
        if (dist2 < 1) { dist2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5 }
        const dist = Math.sqrt(dist2)
        const chargeA = chargeForLevel(this.params, a.level)
        const chargeB = chargeForLevel(this.params, b.level)
        const strength = (chargeA + chargeB) / 2
        const force = this.alpha * strength / dist2
        const fx = force * (dx / dist)
        const fy = force * (dy / dist)
        if (!a.pinned) { a.vx -= fx; a.vy -= fy }
        if (!b.pinned) { b.vx += fx; b.vy += fy }
      }
    }

    // Link force (attraction between connected nodes)
    for (const edge of activeEdges) {
      const source = this.nodeMap.get(edge.sourceId)
      const target = this.nodeMap.get(edge.targetId)
      if (!source || !target) continue

      let dx = target.x - source.x
      let dy = target.y - source.y
      let dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.1) { dist = 0.1; dx = Math.random() - 0.5; dy = Math.random() - 0.5 }

      const cat = edgeCategory(this.params, edge)
      const displacement = dist - cat.distance
      const force = this.alpha * cat.strength * displacement / dist
      const fx = force * dx
      const fy = force * dy

      if (!source.pinned) { source.vx += fx; source.vy += fy }
      if (!target.pinned) { target.vx -= fx; target.vy -= fy }
    }

    // Center force
    for (const node of active) {
      if (!node.pinned) {
        node.vx -= node.x * this.alpha * this.params.centerStrength
        node.vy -= node.y * this.alpha * this.params.centerStrength
      }
    }

    // Apply velocity and damping
    for (const node of active) {
      if (!node.pinned) {
        node.vx *= this.velocityDecay
        node.vy *= this.velocityDecay
        node.x += node.vx
        node.y += node.vy
      }
    }

    // Cool
    this.alpha = Math.max(this.alpha - this.alphaDecay, 0)
  }

  reheat(alpha = 0.5): void {
    this.alpha = alpha
  }

  isStable(): boolean {
    return this.alpha < this.alphaMin
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

  // Seed a node at a given position (used when new nodes appear during level transition)
  seedAt(id: string, x: number, y: number): void {
    const node = this.nodeMap.get(id)
    if (node) {
      node.x = x + (Math.random() - 0.5) * 10
      node.y = y + (Math.random() - 0.5) * 10
      node.vx = 0
      node.vy = 0
    }
  }
}
