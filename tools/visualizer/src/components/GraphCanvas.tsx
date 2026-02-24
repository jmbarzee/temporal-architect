// Canvas-based graph renderer with mouse interaction.
// Implements GRAPH_VIEW.md § Visual Encoding, § Viewport Controls, § Interaction States.

import React from 'react'
import type { SimNode, ForceParams } from '../graph/simulation'
import { edgeCategory } from '../graph/simulation'
import type { ForceSection } from './GraphControlPanel'
import type { GraphEdge } from '../graph/model'
import type { Viewport } from '../graph/viewport'
import { worldToScreen, screenToWorld, zoomAt, fitToView } from '../graph/viewport'

// Colors matching the tree view theme (light mode defaults)
const NODE_COLORS: Record<string, string> = {
  namespace: '#7E8CA0',
  worker: '#94A3B8',
  workflow: '#8B7EC8',
  activity: '#7CB9E8',
  nexusService: '#EC4899',
}

const NEXUS_EDGE_COLOR = '#EC4899'
const DEPENDENCY_EDGE_COLOR = '#94A3B8'
const CONTAINMENT_EDGE_COLOR = '#CBD5E1'
const FOCUS_RING_COLOR = '#4A90D9'
const SELECTION_RING_COLOR = '#8B7EC8'
const SEARCH_MATCH_COLOR = '#F59E0B'
const DIM_ALPHA = 0.2

// Node sizes by level
const NODE_SIZES: Record<number, { w: number; h: number; r: number }> = {
  1: { w: 80, h: 40, r: 12 },
  2: { w: 60, h: 30, r: 4 },
  3: { w: 20, h: 20, r: 10 },
}

const LABEL_FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const ARROWHEAD_SIZE = 8
const CULL_MARGIN = 100

interface GraphCanvasProps {
  nodes: SimNode[]
  edges: GraphEdge[]
  viewport: Viewport
  onViewportChange: (vp: Viewport) => void
  onNodeDragStart: (id: string, wx: number, wy: number) => void
  onNodeDragMove: (wx: number, wy: number) => void
  onNodeDragEnd: () => void
  onDoubleClickNode: (id: string) => void
  onHoverNode: (id: string | null) => void
  onSelectNode: (id: string | null) => void
  highlightedNodes: Set<string> | null
  highlightedEdges: Set<string> | null
  selectedNodeId: string | null
  focusedNodeId: string | null
  searchMatchIds: Set<string> | null
  running: boolean
  showForceFields: boolean
  forceParams: ForceParams
  activeSection: ForceSection
  activeChargeLevel: number | null
}

// All data the draw function needs, stored in a ref to avoid effect teardown
interface DrawData {
  nodes: SimNode[]
  edges: GraphEdge[]
  nodeMap: Map<string, SimNode>
  viewport: Viewport
  highlightedNodes: Set<string> | null
  highlightedEdges: Set<string> | null
  selectedNodeId: string | null
  focusedNodeId: string | null
  searchMatchIds: Set<string> | null
  showForceFields: boolean
  forceParams: ForceParams
  activeSection: ForceSection
  activeChargeLevel: number | null
  running: boolean
}

export function GraphCanvas({
  nodes, edges, viewport, onViewportChange,
  onNodeDragStart, onNodeDragMove, onNodeDragEnd,
  onDoubleClickNode, onHoverNode, onSelectNode,
  highlightedNodes, highlightedEdges,
  selectedNodeId, focusedNodeId, searchMatchIds,
  running, showForceFields, forceParams, activeSection, activeChargeLevel,
}: GraphCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  const dragState = React.useRef<{
    type: 'pan' | 'node'
    startVp?: Viewport
    sx: number
    sy: number
    moved: boolean
  } | null>(null)

  // Build node lookup for edge rendering
  const nodeMap = React.useMemo(() => {
    const m = new Map<string, SimNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // --- Ref-based draw data (updated every render, read by draw loop) ---
  const drawData = React.useRef<DrawData>({
    nodes, edges, nodeMap, viewport, highlightedNodes, highlightedEdges,
    selectedNodeId, focusedNodeId, searchMatchIds, showForceFields,
    forceParams, activeSection, activeChargeLevel, running,
  })
  drawData.current = {
    nodes, edges, nodeMap, viewport, highlightedNodes, highlightedEdges,
    selectedNodeId, focusedNodeId, searchMatchIds, showForceFields,
    forceParams, activeSection, activeChargeLevel, running,
  }

  // Resize observer
  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Hit test: find node under screen coordinates
  const hitTest = React.useCallback((sx: number, sy: number): SimNode | null => {
    const [wx, wy] = screenToWorld(viewport, sx, sy)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const s = NODE_SIZES[n.level]
      const hw = (s.w / 2) / viewport.scale + 4
      const hh = (s.h / 2) / viewport.scale + 4
      if (Math.abs(wx - n.x) <= hw && Math.abs(wy - n.y) <= hh) return n
    }
    return null
  }, [nodes, viewport])

  // Mouse handlers
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    onViewportChange(zoomAt(viewport, sx, sy, factor))
  }, [viewport, onViewportChange])

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const node = hitTest(sx, sy)

    if (node) {
      dragState.current = { type: 'node', sx, sy, moved: false }
      const [wx, wy] = screenToWorld(viewport, sx, sy)
      onNodeDragStart(node.id, wx, wy)
    } else {
      dragState.current = { type: 'pan', startVp: { ...viewport }, sx, sy, moved: false }
    }
    canvasRef.current?.setPointerCapture(e.pointerId)
  }, [viewport, hitTest, onNodeDragStart])

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    if (!dragState.current) {
      // Hover detection
      const node = hitTest(cx, cy)
      onHoverNode(node?.id ?? null)
      return
    }

    dragState.current.moved = true

    if (dragState.current.type === 'pan' && dragState.current.startVp) {
      const dx = cx - dragState.current.sx
      const dy = cy - dragState.current.sy
      onViewportChange({
        ...dragState.current.startVp,
        x: dragState.current.startVp.x + dx,
        y: dragState.current.startVp.y + dy,
      })
    } else if (dragState.current.type === 'node') {
      const [wx, wy] = screenToWorld(viewport, cx, cy)
      onNodeDragMove(wx, wy)
    }
  }, [viewport, hitTest, onViewportChange, onNodeDragMove, onHoverNode])

  const handlePointerUp = React.useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (ds?.type === 'node') {
      onNodeDragEnd()
      // Click (no drag) on node → select
      if (!ds.moved) {
        const rect = canvasRef.current!.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const node = hitTest(sx, sy)
        if (node) onSelectNode(node.id)
      }
    } else if (ds?.type === 'pan' && !ds.moved) {
      // Click on background → deselect
      onSelectNode(null)
    }
    dragState.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }, [onNodeDragEnd, onSelectNode, hitTest])

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const node = hitTest(sx, sy)
    if (node) {
      onDoubleClickNode(node.id)
    } else {
      onViewportChange(fitToView(nodes, size.w, size.h))
    }
  }, [hitTest, nodes, size, onViewportChange, onDoubleClickNode])

  // --- Render loop ---
  // Uses a ref for all draw data so the effect only tears down on size change.
  // A dirty flag triggers single-frame redraws when paused.
  const dirtyRef = React.useRef(true)

  // Mark dirty on any visual change (runs every render, but just sets a flag)
  React.useEffect(() => { dirtyRef.current = true })

  // Main draw effect — only depends on size (canvas allocation)
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Allocate canvas bitmap once per resize
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr

    let loopId = 0
    let active = true

    const drawFrame = () => {
      const d = drawData.current
      const { w, h } = size
      const hasHighlight = d.highlightedNodes !== null && d.highlightedNodes.size > 0

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Draw edges
      for (const edge of d.edges) {
        const src = d.nodeMap.get(edge.sourceId)
        const tgt = d.nodeMap.get(edge.targetId)
        if (!src || !tgt) continue

        const [sx, sy] = worldToScreen(d.viewport, src.x, src.y)
        const [tx, ty] = worldToScreen(d.viewport, tgt.x, tgt.y)

        if (Math.max(sx, tx) < -CULL_MARGIN || Math.min(sx, tx) > w + CULL_MARGIN ||
            Math.max(sy, ty) < -CULL_MARGIN || Math.min(sy, ty) > h + CULL_MARGIN) continue

        const edgeHighlighted = d.highlightedEdges?.has(edge.id) ?? false
        ctx.globalAlpha = hasHighlight && !edgeHighlighted ? DIM_ALPHA : 1

        ctx.beginPath()
        if (edge.edgeType === 'containment') {
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = CONTAINMENT_EDGE_COLOR
          ctx.lineWidth = 1
        } else if (edge.edgeType === 'nexusDependency') {
          ctx.setLineDash([])
          ctx.strokeStyle = NEXUS_EDGE_COLOR
          ctx.lineWidth = 1.5
        } else {
          ctx.setLineDash([])
          ctx.strokeStyle = DEPENDENCY_EDGE_COLOR
          ctx.lineWidth = 1.5
        }
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])

        // Arrowhead for dependency edges
        if (edge.edgeType !== 'containment') {
          const angle = Math.atan2(ty - sy, tx - sx)
          const nodeSize = NODE_SIZES[tgt.level]
          const offset = (nodeSize.w / 2) * d.viewport.scale + 2
          const ax = tx - Math.cos(angle) * offset
          const ay = ty - Math.sin(angle) * offset
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(
            ax - ARROWHEAD_SIZE * Math.cos(angle - Math.PI / 6),
            ay - ARROWHEAD_SIZE * Math.sin(angle - Math.PI / 6),
          )
          ctx.lineTo(
            ax - ARROWHEAD_SIZE * Math.cos(angle + Math.PI / 6),
            ay - ARROWHEAD_SIZE * Math.sin(angle + Math.PI / 6),
          )
          ctx.closePath()
          ctx.fillStyle = edge.edgeType === 'nexusDependency' ? NEXUS_EDGE_COLOR : DEPENDENCY_EDGE_COLOR
          ctx.fill()
        }

        ctx.globalAlpha = 1
      }

      // --- Force field visualizations ---
      const pushActive = d.activeSection === 'push'
      const pullActive = d.activeSection === 'pull'
      const gravityActive = d.activeSection === 'gravity'

      // PUSH: charge field rings
      if (d.showForceFields || pushActive) {
        const soft = d.forceParams.chargeSoftening
        const exp = d.forceParams.chargeExponent
        const halfExp = exp / 2
        const softPow = Math.pow(Math.max(soft, 1), halfExp)
        const thresholds = [0.75, 0.50, 0.25]
        const levelFilter = pushActive ? d.activeChargeLevel : null

        for (const node of d.nodes) {
          const [sx, sy] = worldToScreen(d.viewport, node.x, node.y)
          const maxRing = 400 * d.viewport.scale
          if (sx + maxRing < 0 || sx - maxRing > w ||
              sy + maxRing < 0 || sy - maxRing > h) continue

          const levelMatch = levelFilter === null || node.level === levelFilter
          const highlighted = pushActive && levelMatch
          const dimmed = pushActive && !levelMatch
          const baseAlpha = highlighted ? 0.22 : dimmed ? 0.04 : 0.08
          const stepAlpha = highlighted ? 0.04 : dimmed ? 0.01 : 0.02

          const color = NODE_COLORS[node.nodeType] || '#999'
          ctx.strokeStyle = color

          for (let ti = 0; ti < thresholds.length; ti++) {
            const t = thresholds[ti]
            const inner = Math.pow(softPow / t, 2 / exp) - soft
            if (inner <= 0) continue
            const dd = Math.sqrt(inner)
            const r = dd * d.viewport.scale
            if (r < 2 || r > 2000) continue

            ctx.beginPath()
            ctx.arc(sx, sy, r, 0, Math.PI * 2)
            ctx.globalAlpha = baseAlpha + ti * stepAlpha
            ctx.lineWidth = highlighted ? 1.5 : 1
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }

      // PULL: edge tension coloring
      if (pullActive) {
        const distMul = d.forceParams.distanceMultiplier
        for (const edge of d.edges) {
          const src = d.nodeMap.get(edge.sourceId)
          const tgt = d.nodeMap.get(edge.targetId)
          if (!src || !tgt) continue

          const [sx, sy] = worldToScreen(d.viewport, src.x, src.y)
          const [tx, ty] = worldToScreen(d.viewport, tgt.x, tgt.y)
          if (Math.max(sx, tx) < -CULL_MARGIN || Math.min(sx, tx) > w + CULL_MARGIN ||
              Math.max(sy, ty) < -CULL_MARGIN || Math.min(sy, ty) > h + CULL_MARGIN) continue

          const cat = edgeCategory(d.forceParams, edge)
          const restDist = cat.distance * distMul
          const dx = tgt.x - src.x
          const dy = tgt.y - src.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const ratio = dist / Math.max(restDist, 0.1)

          let tensionColor: string
          if (ratio > 1.15) {
            tensionColor = '#F59E0B'
          } else if (ratio < 0.85) {
            tensionColor = '#3B82F6'
          } else {
            tensionColor = '#22C55E'
          }

          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(tx, ty)
          ctx.strokeStyle = tensionColor
          ctx.globalAlpha = 0.5
          ctx.lineWidth = 3
          ctx.setLineDash([])
          ctx.stroke()

          const angle = Math.atan2(dy, dx)
          const perpX = -Math.sin(angle)
          const perpY = Math.cos(angle)
          const tickLen = 5
          const restScreen = restDist * d.viewport.scale
          if (restScreen > 10 && restScreen < Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) * 2) {
            const mx1 = sx + Math.cos(angle) * restScreen
            const my1 = sy + Math.sin(angle) * restScreen
            ctx.beginPath()
            ctx.moveTo(mx1 - perpX * tickLen, my1 - perpY * tickLen)
            ctx.lineTo(mx1 + perpX * tickLen, my1 + perpY * tickLen)
            ctx.strokeStyle = '#22C55E'
            ctx.globalAlpha = 0.7
            ctx.lineWidth = 1.5
            ctx.stroke()
            const mx2 = tx - Math.cos(angle) * restScreen
            const my2 = ty - Math.sin(angle) * restScreen
            ctx.beginPath()
            ctx.moveTo(mx2 - perpX * tickLen, my2 - perpY * tickLen)
            ctx.lineTo(mx2 + perpX * tickLen, my2 + perpY * tickLen)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
        ctx.setLineDash([])
      }

      // GRAVITY: center-of-mass crosshair
      if (gravityActive && d.nodes.length > 0) {
        let comX = 0, comY = 0
        for (const node of d.nodes) { comX += node.x; comY += node.y }
        comX /= d.nodes.length; comY /= d.nodes.length
        const [cx, cy] = worldToScreen(d.viewport, comX, comY)

        const crossSize = 12
        ctx.strokeStyle = '#8B7EC8'
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(cx - crossSize, cy); ctx.lineTo(cx + crossSize, cy)
        ctx.moveTo(cx, cy - crossSize); ctx.lineTo(cx, cy + crossSize)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(cx, cy, crossSize * 0.7, 0, Math.PI * 2)
        ctx.stroke()

        ctx.globalAlpha = 0.08
        ctx.lineWidth = 1
        ctx.setLineDash([3, 6])
        for (const node of d.nodes) {
          const [sx, sy] = worldToScreen(d.viewport, node.x, node.y)
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(cx, cy)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }

      // Draw nodes
      ctx.font = LABEL_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (const node of d.nodes) {
        const [sx, sy] = worldToScreen(d.viewport, node.x, node.y)
        const s = NODE_SIZES[node.level]
        const hw = s.w / 2
        const hh = s.h / 2

        if (sx + hw < -CULL_MARGIN || sx - hw > w + CULL_MARGIN ||
            sy + hh < -CULL_MARGIN || sy - hh > h + CULL_MARGIN) continue

        const nodeHighlighted = d.highlightedNodes?.has(node.id) ?? false
        ctx.globalAlpha = hasHighlight && !nodeHighlighted ? DIM_ALPHA : 1

        const color = NODE_COLORS[node.nodeType] || '#999'
        ctx.fillStyle = color

        if (node.level === 3) {
          ctx.beginPath()
          ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
          ctx.fill()
        } else {
          drawRoundedRect(ctx, sx - hw, sy - hh, s.w, s.h, s.r)
          ctx.fill()
        }

        // Orphan indicator
        if (node.orphan) {
          ctx.save()
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          if (node.level === 3) {
            ctx.beginPath()
            ctx.arc(sx, sy, s.r + 3, 0, Math.PI * 2)
            ctx.stroke()
          } else {
            drawRoundedRect(ctx, sx - hw - 3, sy - hh - 3, s.w + 6, s.h + 6, s.r + 2)
            ctx.stroke()
          }
          ctx.restore()
        }

        // Search match ring
        if (d.searchMatchIds?.has(node.id)) {
          ctx.save()
          ctx.strokeStyle = SEARCH_MATCH_COLOR
          ctx.lineWidth = 2
          ctx.setLineDash([])
          if (node.level === 3) {
            ctx.beginPath()
            ctx.arc(sx, sy, s.r + 4, 0, Math.PI * 2)
            ctx.stroke()
          } else {
            drawRoundedRect(ctx, sx - hw - 4, sy - hh - 4, s.w + 8, s.h + 8, s.r + 3)
            ctx.stroke()
          }
          ctx.restore()
        }

        // Selection ring
        if (node.id === d.selectedNodeId) {
          ctx.save()
          ctx.strokeStyle = SELECTION_RING_COLOR
          ctx.lineWidth = 2.5
          ctx.setLineDash([])
          if (node.level === 3) {
            ctx.beginPath()
            ctx.arc(sx, sy, s.r + 5, 0, Math.PI * 2)
            ctx.stroke()
          } else {
            drawRoundedRect(ctx, sx - hw - 5, sy - hh - 5, s.w + 10, s.h + 10, s.r + 4)
            ctx.stroke()
          }
          ctx.restore()
        }

        // Focus ring
        if (node.id === d.focusedNodeId) {
          ctx.save()
          ctx.strokeStyle = FOCUS_RING_COLOR
          ctx.lineWidth = 2
          ctx.setLineDash([2, 2])
          if (node.level === 3) {
            ctx.beginPath()
            ctx.arc(sx, sy, s.r + 7, 0, Math.PI * 2)
            ctx.stroke()
          } else {
            drawRoundedRect(ctx, sx - hw - 7, sy - hh - 7, s.w + 14, s.h + 14, s.r + 5)
            ctx.stroke()
          }
          ctx.restore()
        }

        ctx.globalAlpha = 1

        // Label
        const maxLabelW = node.level === 3 ? 60 : s.w - 8
        const labelY = node.level === 3 ? sy + s.r + 12 : sy
        ctx.fillStyle = hasHighlight && !nodeHighlighted ? 'rgba(51,51,51,0.2)' : '#333'
        const label = truncateLabel(ctx, node.name, maxLabelW)
        ctx.fillText(label, sx, labelY)
      }
    }

    // Animation loop: runs continuously when simulation is running.
    // When paused, a single frame is drawn on demand via the dirty flag.
    const loop = () => {
      if (!active) return
      const isRunning = drawData.current.running
      if (isRunning || dirtyRef.current) {
        dirtyRef.current = false
        drawFrame()
      }
      loopId = requestAnimationFrame(loop)
    }
    loopId = requestAnimationFrame(loop)

    return () => { active = false; cancelAnimationFrame(loopId) }
  }, [size]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="graph-canvas-container">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  )
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function truncateLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  for (let i = text.length - 1; i > 0; i--) {
    const truncated = text.slice(0, i) + '\u2026'
    if (ctx.measureText(truncated).width <= maxWidth) return truncated
  }
  return '\u2026'
}
