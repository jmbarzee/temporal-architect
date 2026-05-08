// Canvas-based graph renderer with mouse interaction.
// Implements GRAPH_VIEW.md § Visual Encoding, § Viewport Controls, § Interaction States.

import React from 'react'
import type { SimNode, ForceParams } from '../graph/simulation'
import { edgeCategory, chargeForType, bandForType, ALL_NODE_TYPES } from '../graph/simulation'
import type { ForceSection } from './GraphControlPanel'
import type { GraphEdge, NodeType } from '../graph/model'
import type { Viewport } from '../graph/viewport'
import { worldToScreen, screenToWorld, zoomAt, fitToView } from '../graph/viewport'
import { THEME } from '../theme/temporal-theme'

// Per-node-type style: fill colour, border colour, and icon glyph. Mirrors
// the --color-{type} / --color-{type}-border CSS variables in styles/index.css
// so tree-view chips and canvas nodes read as the same palette. Icon glyphs
// are sourced from the central THEME so the canvas stays in lock-step with
// the tree view's badge icons.
//
// Why duplicate the CSS values here instead of reading them at runtime?
// Canvas 2D needs concrete colour strings; reading getComputedStyle every
// frame would be wasted work, and the values rarely change (theme switch is
// the only driver). When the CSS is edited these constants must follow.
interface NodeStyle {
  fill: string
  border: string
  icon: string
}

const NODE_STYLES: Record<NodeType, NodeStyle> = {
  namespace:      { fill: '#475569', border: '#1E293B', icon: THEME.namespace.icon },
  worker:         { fill: '#94A3B8', border: '#475569', icon: THEME.worker.icon },
  workflow:       { fill: '#8B7EC8', border: '#5D4F95', icon: THEME.workflow.icon },
  activity:       { fill: '#7CB9E8', border: '#4A8BC2', icon: THEME.activity.icon },
  nexusService:   { fill: '#DB2777', border: '#831843', icon: THEME.nexusService.icon },
  nexusOperation: { fill: '#F9A8D4', border: '#BE185D', icon: THEME.nexusOperation.icon },
}

// Edges are categorised by structural role and tone-graded by level. The
// nexus family carries the pink palette through every leg of a call:
//   - opContainment (operation → service): deep service pink, dashed —
//     "this operation is owned by this service".
//   - workflowDep   (workflow → workflow): workflow purple — "this is a
//     workflow making a call".
//   - nexusCall     (workflow ↔ operation, both directions, including the
//     spliced caller → backing edge that survives when operations are
//     hidden): light operation pink — "this hop crosses the nexus call
//     surface".
//   - dependencyL{1,2,3,4}: plain greys, stratified by level.
//   - containment: subtle slate dotted, the default for parent/child edges
//     that aren't part of the nexus family.
const EDGE_STYLE = {
  containment:    { color: '#94A3B8', alpha: 0.35, dash: [3, 4], width: 1 },
  opContainment:  { color: '#DB2777', alpha: 0.55, dash: [3, 4], width: 1.2 }, // op → service
  dependencyL1:   { color: '#475569', alpha: 0.85, dash: [],     width: 1.8 }, // ns → ns
  dependencyL2:   { color: '#64748B', alpha: 0.75, dash: [],     width: 1.6 }, // worker → worker
  workflowDep:    { color: '#8B7EC8', alpha: 0.70, dash: [],     width: 1.4 }, // workflow → workflow
  dependencyL3:   { color: '#94A3B8', alpha: 0.55, dash: [],     width: 1.4 }, // generic L3 (e.g. activity → workflow)
  dependencyL4:   { color: '#94A3B8', alpha: 0.40, dash: [],     width: 1.2 }, // ends at activity (L4 leaf)
  nexusCall:      { color: '#F472B6', alpha: 0.85, dash: [],     width: 1.5 }, // workflow ↔ operation, or spliced
} as const

const FOCUS_RING_COLOR = '#4A90D9'
const SELECTION_RING_COLOR = '#8B7EC8'
const SEARCH_MATCH_COLOR = '#F59E0B'
const DIM_ALPHA = 0.2

// Node sizes by level — all nodes render as circles; w/h = 2r for hit testing
// and culling. L1 and L2 share a size because they're both "container" tiers
// (namespace contains workers; workers and services host the L3 layer);
// L3 and L4 step down to make the leaves visually subordinate.
const NODE_SIZES: Record<number, { w: number; h: number; r: number; iconSize: number }> = {
  1: { w: 40, h: 40, r: 20, iconSize: 18 },
  2: { w: 40, h: 40, r: 20, iconSize: 18 },
  3: { w: 22, h: 22, r: 11, iconSize: 12 },
  4: { w: 16, h: 16, r:  8, iconSize: 10 },
}

const LABEL_FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const ICON_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

// Read a CSS custom property off the document root with a fallback. Used to
// keep canvas-drawn text in step with the surrounding DOM theme — the body
// inherits `--color-text`, so labels feel out of place if we hard-code a
// dark slate that turns invisible on the dark VS Code background.
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// Pick the right entry from EDGE_STYLE for a given edge.
//
// Order matters: the nexus family is checked first so it wins over any
// generic dependency style. Op → Service containment is the only
// containment edge that isn't slate; everything else slate-dotted. Workflow
// → Workflow gets the workflow purple to make the call backbone visible
// inside a tangle of greys. Spliced caller → backing edges are detected by
// surviving `nexusEndpoint` metadata, so they keep the nexus colour even
// once the operation node is filtered out.
function edgeStyleFor(edge: GraphEdge, src: SimNode, tgt: SimNode): typeof EDGE_STYLE[keyof typeof EDGE_STYLE] {
  if (edge.edgeType === 'containment') {
    if (src.nodeType === 'nexusOperation' && tgt.nodeType === 'nexusService') {
      return EDGE_STYLE.opContainment
    }
    return EDGE_STYLE.containment
  }
  // Both directions of the workflow ↔ operation hop, plus spliced
  // caller → backing edges that retain the endpoint metadata.
  if (
    src.nodeType === 'nexusOperation' || tgt.nodeType === 'nexusOperation' ||
    edge.nexusEndpoint != null
  ) {
    return EDGE_STYLE.nexusCall
  }
  if (src.nodeType === 'workflow' && tgt.nodeType === 'workflow') {
    return EDGE_STYLE.workflowDep
  }
  const minLevel = Math.min(src.level, tgt.level)
  if (minLevel === 1) return EDGE_STYLE.dependencyL1
  if (minLevel === 2) return EDGE_STYLE.dependencyL2
  if (tgt.level === 4 || src.level === 4) return EDGE_STYLE.dependencyL4
  return EDGE_STYLE.dependencyL3
}
const ARROWHEAD_SIZE = 8
const CULL_MARGIN = 100

// Zoom elision thresholds
const SUMMARY_ELIDE_SCALE = 0.5   // hide summary badges below this scale
const LABEL_ELIDE_SCALE = 0.25    // hide name labels below this scale (except hovered/selected)
const DETAIL_REDUCE_SCALE = 0.1   // drop decorative rings below this scale

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
  hoveredNodeId: string | null
  selectedNodeId: string | null
  focusedNodeId: string | null
  searchMatchIds: Set<string> | null
  running: boolean
  showForceFields: boolean
  forceParams: ForceParams
  activeSection: ForceSection
  activeChargeType: NodeType | null
  activeGravityType: NodeType | null
  nodeSummaries: Map<string, string>
}

// All data the draw function needs, stored in a ref to avoid effect teardown
interface DrawData {
  nodes: SimNode[]
  edges: GraphEdge[]
  nodeMap: Map<string, SimNode>
  viewport: Viewport
  highlightedNodes: Set<string> | null
  highlightedEdges: Set<string> | null
  hoveredNodeId: string | null
  selectedNodeId: string | null
  focusedNodeId: string | null
  searchMatchIds: Set<string> | null
  showForceFields: boolean
  forceParams: ForceParams
  activeSection: ForceSection
  activeChargeType: NodeType | null
  activeGravityType: NodeType | null
  nodeSummaries: Map<string, string>
  running: boolean
}

export function GraphCanvas({
  nodes, edges, viewport, onViewportChange,
  onNodeDragStart, onNodeDragMove, onNodeDragEnd,
  onDoubleClickNode, onHoverNode, onSelectNode,
  highlightedNodes, highlightedEdges,
  hoveredNodeId, selectedNodeId, focusedNodeId, searchMatchIds,
  running, showForceFields, forceParams, activeSection, activeChargeType,
  activeGravityType, nodeSummaries,
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
    hoveredNodeId, selectedNodeId, focusedNodeId, searchMatchIds, showForceFields,
    forceParams, activeSection, activeChargeType, activeGravityType, nodeSummaries, running,
  })
  drawData.current = {
    nodes, edges, nodeMap, viewport, highlightedNodes, highlightedEdges,
    hoveredNodeId, selectedNodeId, focusedNodeId, searchMatchIds, showForceFields,
    forceParams, activeSection, activeChargeType, activeGravityType, nodeSummaries, running,
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

  // Hit test: find node under screen coordinates (circular distance check).
  const hitTest = React.useCallback((sx: number, sy: number): SimNode | null => {
    const [wx, wy] = screenToWorld(viewport, sx, sy)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const r = NODE_SIZES[n.level].r / viewport.scale + 4
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 <= r * r) return n
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

      // Resolve theme-tracking colours every frame. Cheap (CSS lookup +
      // string trim per draw) and guarantees the canvas text follows a
      // theme switch without needing a full effect teardown.
      const labelColor = cssVar('--color-text', '#1e293b')
      const labelMutedColor = cssVar('--color-text-muted', '#64748b')
      // Dim variant keeps the same hue, just at low alpha. We synthesise it
      // by appending an alpha to the resolved hex when possible; otherwise
      // fall back to the existing rgba grey.
      const labelDimColor = labelColor.startsWith('#') && labelColor.length === 7
        ? labelColor + '33'  // ~20% alpha
        : 'rgba(100,116,139,0.2)'

      // World coordinates are anchored by hierarchical gravity, so the canvas
      // can project directly through the user's viewport — no per-frame
      // re-centering offset is needed.
      const vp = d.viewport

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Draw edges
      for (const edge of d.edges) {
        const src = d.nodeMap.get(edge.sourceId)
        const tgt = d.nodeMap.get(edge.targetId)
        if (!src || !tgt) continue

        const [sx, sy] = worldToScreen(vp, src.x, src.y)
        const [tx, ty] = worldToScreen(vp, tgt.x, tgt.y)

        if (Math.max(sx, tx) < -CULL_MARGIN || Math.min(sx, tx) > w + CULL_MARGIN ||
            Math.max(sy, ty) < -CULL_MARGIN || Math.min(sy, ty) > h + CULL_MARGIN) continue

        const edgeHighlighted = d.highlightedEdges?.has(edge.id) ?? false
        const style = edgeStyleFor(edge, src, tgt)
        const baseAlpha = style.alpha
        // Highlights override the per-style alpha so the active subgraph
        // pops; dim non-highlighted edges down to DIM_ALPHA.
        ctx.globalAlpha = hasHighlight
          ? (edgeHighlighted ? 1 : DIM_ALPHA)
          : baseAlpha

        ctx.beginPath()
        ctx.setLineDash([...style.dash])
        ctx.strokeStyle = style.color
        ctx.lineWidth = style.width
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])

        // Arrowhead for dependency edges (containment is hierarchical, no
        // direction is interesting to show).
        if (edge.edgeType !== 'containment') {
          const angle = Math.atan2(ty - sy, tx - sx)
          const nodeSize = NODE_SIZES[tgt.level]
          const offset = (nodeSize.w / 2) * vp.scale + 2
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
          ctx.fillStyle = style.color
          ctx.fill()
        }

        ctx.globalAlpha = 1
      }

      // --- Force field visualizations ---
      const pushActive = d.activeSection === 'push'
      const pullActive = d.activeSection === 'pull'
      const gravityActive = d.activeSection === 'gravity'

      // PUSH: charge field rings.
      //
      // Rings are placed at distances where the force on a unit test particle
      // crosses absolute thresholds (FORCE_THRESHOLDS, in raw force units).
      // Solving F = pushMul·|q| / (d² + soft)^(exp/2) = T for d gives
      //   d = sqrt((pushMul·|q| / T)^(2/exp) − soft)
      // which is real only when the threshold is reachable for that node's
      // charge. As a result, stronger charges show larger rings (more reach),
      // and the weakest types may render only the outermost ring — exactly
      // the visual the user intuits when they tune a per-type charge.
      const FORCE_THRESHOLDS = [0.2, 0.5, 1.5]
      if (d.showForceFields || pushActive) {
        const soft = d.forceParams.chargeSoftening
        const exp = d.forceParams.chargeExponent
        const pushMul = d.forceParams.pushMultiplier
        const typeFilter = pushActive ? d.activeChargeType : null

        for (const node of d.nodes) {
          const [sx, sy] = worldToScreen(vp, node.x, node.y)
          const maxRing = 2000
          if (sx + maxRing < 0 || sx - maxRing > w ||
              sy + maxRing < 0 || sy - maxRing > h) continue

          const typeMatch = typeFilter === null || node.nodeType === typeFilter
          const highlighted = pushActive && typeMatch
          const dimmed = pushActive && !typeMatch
          const baseAlpha = highlighted ? 0.24 : dimmed ? 0.04 : 0.10
          const stepAlpha = highlighted ? 0.05 : dimmed ? 0.01 : 0.025

          const color = NODE_STYLES[node.nodeType]?.fill ?? '#999'
          ctx.strokeStyle = color

          const effectiveCharge = Math.abs(chargeForType(d.forceParams, node.nodeType)) * pushMul
          if (effectiveCharge <= 0) continue

          // First pass: collect every reachable ring radius. We need them up
          // front so we can fill out to the outermost reachable distance
          // before stroking the rings on top — matching the "fill + edges"
          // idiom used by the gravity bands.
          const ringRadii: number[] = []
          for (let ti = 0; ti < FORCE_THRESHOLDS.length; ti++) {
            const T = FORCE_THRESHOLDS[ti]
            const ratio = effectiveCharge / T
            const inner = Math.pow(ratio, 2 / Math.max(exp, 0.01)) - soft
            if (inner <= 0) continue
            const dd = Math.sqrt(inner)
            const r = dd * vp.scale
            if (r < 2 || r > 2000) continue
            ringRadii.push(r)
          }

          if (ringRadii.length === 0) continue

          // Faint disc fill out to the outermost reachable ring. Per-node fill
          // alpha is intentionally low so that overlapping nodes don't blow out
          // contrast — the visual cue is colour, not brightness.
          ctx.fillStyle = color
          ctx.globalAlpha = highlighted ? 0.14 : dimmed ? 0.02 : 0.05
          ctx.beginPath()
          ctx.arc(sx, sy, ringRadii[0], 0, Math.PI * 2)
          ctx.fill()

          // Outline rings on top. Outer rings (lower threshold T, larger d,
          // weaker force) draw fainter than inner rings — preserves the
          // "field fades with distance" reading.
          ctx.strokeStyle = color
          for (let ri = 0; ri < ringRadii.length; ri++) {
            const r = ringRadii[ri]
            const ringIdxFromInner = ringRadii.length - 1 - ri
            ctx.beginPath()
            ctx.arc(sx, sy, r, 0, Math.PI * 2)
            ctx.globalAlpha = baseAlpha + ringIdxFromInner * stepAlpha
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

          const [sx, sy] = worldToScreen(vp, src.x, src.y)
          const [tx, ty] = worldToScreen(vp, tgt.x, tgt.y)
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
          const restScreen = restDist * vp.scale
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

      // GRAVITY: per-type Y bands + a global X band.
      //
      // Both axes are drawn the same way — a faint stripe with brighter
      // edges marks the rest band, where there is zero force. Outside the
      // stripe a node is pulled toward the nearest edge. With X as a band
      // (rather than a single anchor at x = 0) the layout has room to
      // breathe horizontally without the centre of mass collapsing.
      if (gravityActive) {
        const [sxMin] = worldToScreen(vp, d.forceParams.bandXMin, 0)
        const [sxMax] = worldToScreen(vp, d.forceParams.bandXMax, 0)

        // Y bands first (they stack the hierarchy and sit behind the X band).
        for (const t of ALL_NODE_TYPES) {
          const band = bandForType(d.forceParams, t)
          const [, sy1] = worldToScreen(vp, 0, band.yMin)
          const [, sy2] = worldToScreen(vp, 0, band.yMax)
          if (sy2 < 0 || sy1 > h) continue

          const isActive = d.activeGravityType === t
          const isDimmed = d.activeGravityType !== null && !isActive

          ctx.fillStyle = NODE_STYLES[t]?.fill ?? '#999'
          ctx.globalAlpha = isActive ? 0.20 : isDimmed ? 0.04 : 0.10
          ctx.fillRect(0, sy1, w, sy2 - sy1)

          // Top and bottom edges of the band (subtle), brighter when active.
          ctx.strokeStyle = NODE_STYLES[t]?.fill ?? '#999'
          ctx.globalAlpha = isActive ? 0.55 : isDimmed ? 0.08 : 0.22
          ctx.lineWidth = isActive ? 1.5 : 1
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(0, sy1); ctx.lineTo(w, sy1)
          ctx.moveTo(0, sy2); ctx.lineTo(w, sy2)
          ctx.stroke()
        }

        // X band: dashed verticals at xMin and xMax (matching strength to
        // the dashed convention used previously for the x = 0 anchor).
        const xBandVisible = sxMin < w + CULL_MARGIN && sxMax > -CULL_MARGIN
        if (xBandVisible) {
          ctx.strokeStyle = '#8B7EC8'
          ctx.globalAlpha = 0.5
          ctx.lineWidth = 1.5
          ctx.setLineDash([6, 6])
          ctx.beginPath()
          ctx.moveTo(sxMin, 0); ctx.lineTo(sxMin, h)
          ctx.moveTo(sxMax, 0); ctx.lineTo(sxMax, h)
          ctx.stroke()
          // Faint band fill between the two edges so the rest region reads
          // as a stripe rather than two unrelated lines.
          ctx.fillStyle = '#8B7EC8'
          ctx.globalAlpha = 0.05
          ctx.fillRect(sxMin, 0, sxMax - sxMin, h)
          ctx.setLineDash([])
        }

        ctx.globalAlpha = 1
      }

      // Draw nodes
      ctx.font = LABEL_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (const node of d.nodes) {
        const [sx, sy] = worldToScreen(vp, node.x, node.y)
        const s = NODE_SIZES[node.level]
        const hw = s.w / 2
        const hh = s.h / 2

        if (sx + hw < -CULL_MARGIN || sx - hw > w + CULL_MARGIN ||
            sy + hh < -CULL_MARGIN || sy - hh > h + CULL_MARGIN) continue

        const nodeHighlighted = d.highlightedNodes?.has(node.id) ?? false
        ctx.globalAlpha = hasHighlight && !nodeHighlighted ? DIM_ALPHA : 1

        const style = NODE_STYLES[node.nodeType] ?? { fill: '#999', border: '#444', icon: '?' }

        // Filled body + crisp border. The border is ~3 stops darker than the
        // fill; 1.25px at the lowest zoom keeps the outline visible without
        // turning small nodes into bullseyes.
        ctx.beginPath()
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
        ctx.fillStyle = style.fill
        ctx.fill()
        ctx.lineWidth = Math.max(1, Math.min(2, vp.scale * 1.25))
        ctx.strokeStyle = style.border
        ctx.stroke()

        // Icon glyph at the node centre (single unicode char). Only drawn
        // once we're above the label-elision scale — at very low zoom the
        // icon bleeds into the fill anyway and just adds noise.
        if (vp.scale >= LABEL_ELIDE_SCALE && style.icon) {
          ctx.save()
          ctx.font = `${s.iconSize}px ${ICON_FONT_FAMILY}`
          ctx.fillStyle = '#FFFFFF'
          ctx.globalAlpha = (hasHighlight && !nodeHighlighted ? DIM_ALPHA : 1) * 0.92
          ctx.fillText(style.icon, sx, sy + 0.5)
          ctx.restore()
        }

        // Orphan indicator — dropped at very low zoom (decorative noise at that scale)
        if (node.orphan && vp.scale >= DETAIL_REDUCE_SCALE) {
          ctx.save()
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = style.fill
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, s.r + 4, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Search match ring
        if (d.searchMatchIds?.has(node.id)) {
          ctx.save()
          ctx.strokeStyle = SEARCH_MATCH_COLOR
          ctx.lineWidth = 2
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(sx, sy, s.r + 4, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Selection ring
        if (node.id === d.selectedNodeId) {
          ctx.save()
          ctx.strokeStyle = SELECTION_RING_COLOR
          ctx.lineWidth = 2.5
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(sx, sy, s.r + 5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Focus ring — dropped at very low zoom (dashes too small to read)
        if (node.id === d.focusedNodeId && vp.scale >= DETAIL_REDUCE_SCALE) {
          ctx.save()
          ctx.strokeStyle = FOCUS_RING_COLOR
          ctx.lineWidth = 2
          ctx.setLineDash([2, 2])
          ctx.beginPath()
          ctx.arc(sx, sy, s.r + 7, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        ctx.globalAlpha = 1

        // Labels — elided at low zoom; always shown for hovered/selected node
        const maxLabelW = Math.max(s.r * 4, 48)
        const labelY = sy + s.r + 12
        const isActiveNode = node.id === d.hoveredNodeId || node.id === d.selectedNodeId
        if (vp.scale >= LABEL_ELIDE_SCALE || isActiveNode) {
          // Theme-aware text colour — picks up `--color-text` so labels are
          // legible in both light and dark VS Code themes.
          ctx.fillStyle = hasHighlight && !nodeHighlighted ? labelDimColor : labelColor
          ctx.fillText(truncateLabel(ctx, node.name, maxLabelW), sx, labelY)

          // Summary — elided before name labels
          if (vp.scale >= SUMMARY_ELIDE_SCALE) {
            const summary = d.nodeSummaries.get(node.id)
            if (summary) {
              ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              ctx.globalAlpha = hasHighlight && !nodeHighlighted ? DIM_ALPHA * 0.55 : 0.55
              ctx.fillStyle = labelMutedColor
              ctx.fillText(summary, sx, labelY + 13)
              ctx.font = LABEL_FONT
            }
          }
        }
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


function truncateLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  for (let i = text.length - 1; i > 0; i--) {
    const truncated = text.slice(0, i) + '\u2026'
    if (ctx.measureText(truncated).width <= maxWidth) return truncated
  }
  return '\u2026'
}
