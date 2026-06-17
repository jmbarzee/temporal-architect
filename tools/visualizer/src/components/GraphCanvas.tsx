// Canvas-based graph renderer with mouse interaction.
// Implements GRAPH_VIEW.md § Visual Encoding, § Viewport Controls, § Interaction States.

import React from 'react'
import type { GraphEdge, NodeType } from '../graph/model'
import type { ForceParams, SimNode } from '../graph/simulation'
import { ALL_NODE_TYPES, bandForType, chargeForType, coreRadiusForType, edgeCategory, RADIAL_R_MIN, RADIAL_R_MAX } from '../graph/simulation'
import type { Viewport } from '../graph/viewport'
import { fitToView, screenToWorld, worldToScreen, zoomAt } from '../graph/viewport'
import { definitionFor, nodeSizeMul, type NodeScaleParams } from '../graph/node-types'
import type { ForceSection } from './GraphControlPanel'

// Edge styles indexed by semantic role. The nexus family carries the pink
// palette through every leg of a call:
//   - opContainment (operation → service): deep service pink, dashed
//   - epComposition (operation → endpoint): deep endpoint rose, dashed —
//     the operation's "second parent" (an endpoint that routes calls to
//     the (namespace, queue) where this operation is deployed)
//   - workflowDep   (workflow → workflow): workflow purple
//   - nexusCall     (workflow ↔ operation, spliced caller → backing): light pink
//   - dependencyNsToNs / dependencyWkToWk: named greys for the two coarsened cases
//   - dependencyDefault: fallback grey for all other dependency edges
//   - containment: subtle slate dotted, default for non-nexus containment edges
const EDGE_STYLE = {
  containment:        { color: '#94A3B8', alpha: 0.35, dash: [3, 4], width: 1 },
  opContainment:      { color: '#DB2777', alpha: 0.55, dash: [3, 4], width: 1.2 }, // op → service
  epComposition:      { color: '#9F1239', alpha: 0.55, dash: [3, 4], width: 1.2 }, // op → endpoint
  dependencyNsToNs:   { color: '#475569', alpha: 0.85, dash: [], width: 1.8 },     // ns → ns
  dependencyWkToWk:   { color: '#64748B', alpha: 0.75, dash: [], width: 1.6 },     // worker → worker
  workflowDep:        { color: '#8B7EC8', alpha: 0.70, dash: [], width: 1.4 },     // workflow → workflow
  workflowToActivity: { color: '#4A8BC2', alpha: 0.70, dash: [], width: 1.4 },     // workflow → activity
  dependencyDefault:  { color: '#94A3B8', alpha: 0.50, dash: [], width: 1.3 },     // all other deps
  nexusCall:          { color: '#F472B6', alpha: 0.85, dash: [], width: 1.5 },     // workflow ↔ operation, or spliced
} as const

const FOCUS_RING_COLOR = '#4A90D9'
const SELECTION_RING_COLOR = '#FFFFFF'
const DIM_ALPHA = 0.2

const ICON_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const LABEL_FONT_PX = 11
// Slight translucency on node labels so they don't read as the only bright
// text on the dark canvas and edges remain visible through them.
const LABEL_ALPHA = 0.78

// Label truncation: names up to LABEL_MAX_CHARS are shown in full; anything
// longer is shortened to LABEL_TRUNC_CHARS characters plus an ellipsis (so a
// truncated label always shows at least LABEL_TRUNC_CHARS characters).
const LABEL_MAX_CHARS = 15
const LABEL_TRUNC_CHARS = 12
function labelText(name: string): string {
  return name.length > LABEL_MAX_CHARS ? name.slice(0, LABEL_TRUNC_CHARS) + '\u2026' : name
}

// Build the node-label font string at a given pixel size. Semibold (600) so
// labels read against the canvas background and over edges without needing a
// halo/outline.
function labelFont(px: number): string {
  return `600 ${px.toFixed(1)}px ${ICON_FONT_FAMILY}`
}


// Read a CSS custom property with a fallback, resolved against a specific
// element. We resolve against the canvas (not `document.documentElement`)
// because the dark theme is applied via a `.vscode-dark` class on `<body>`,
// which is *below* `<html>` — reading from the root would always yield the
// light value and leave labels near-invisible on the dark VS Code background.
// The canvas is a descendant of the themed element, so it inherits the right
// value in either theme.
function cssVar(el: Element | null, name: string, fallback: string): string {
  const target = el ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!target) return fallback
  const v = getComputedStyle(target).getPropertyValue(name).trim()
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
    // op ↔ endpoint composition: visualized like opContainment (dashed,
    // nexus-family) but in the endpoint's deeper rose so the eye can tell
    // the two parents apart at a glance.
    if (
      (src.nodeType === 'nexusOperation' && tgt.nodeType === 'nexusEndpoint') ||
      (src.nodeType === 'nexusEndpoint' && tgt.nodeType === 'nexusOperation')
    ) {
      return EDGE_STYLE.epComposition
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
  if (
    (src.nodeType === 'workflow' && tgt.nodeType === 'activity') ||
    (src.nodeType === 'activity' && tgt.nodeType === 'workflow')
  ) {
    return EDGE_STYLE.workflowToActivity
  }
  // The two coarsened dependency cases: namespace↔namespace and worker↔worker.
  // These are the only non-nexus, non-workflow/activity dependency types that
  // warrant a distinct style; everything else gets the neutral default.
  if (src.nodeType === 'namespace' || tgt.nodeType === 'namespace') {
    return EDGE_STYLE.dependencyNsToNs
  }
  if (src.nodeType === 'worker' || tgt.nodeType === 'worker') {
    return EDGE_STYLE.dependencyWkToWk
  }
  return EDGE_STYLE.dependencyDefault
}
const ARROWHEAD_SIZE = 8
const CULL_MARGIN = 100

// Zoom elision thresholds
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
  // Right-click on a node — emits the node id and the page-relative
  // coordinates of the cursor so the parent can render a floating
  // context menu at that location.
  onNodeContextMenu?: (nodeId: string, clientX: number, clientY: number) => void
  highlightedNodes: Set<string> | null
  highlightedEdges: Set<string> | null
  hoveredNodeId: string | null
  selectedNodeId: string | null
  focusedNodeId: string | null
  searchMatchIds: Set<string> | null
  running: boolean
  forceParams: ForceParams
  activeSection: ForceSection
  activeChargeType: NodeType | null
  activeGravityType: NodeType | null
  activePullEdge: string | null
  nodeScale: NodeScaleParams
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
  forceParams: ForceParams
  activeSection: ForceSection
  activeChargeType: NodeType | null
  activeGravityType: NodeType | null
  activePullEdge: string | null
  nodeScale: NodeScaleParams
  running: boolean
  // Set of node ids where the same underlying definition appears more than
  // once in the visible set (different workers). Drawn with a colored halo.
  dupNodeIds: Set<string>
  // The definitionKey of the currently hovered or selected node, when that
  // node belongs to a duplicate group. All visible nodes sharing this key
  // receive the duplicate halo. Null when no dup node is active.
  activeDupDefKey: string | null
}

export function GraphCanvas({
  nodes, edges, viewport, onViewportChange,
  onNodeDragStart, onNodeDragMove, onNodeDragEnd,
  onDoubleClickNode, onHoverNode, onSelectNode, onNodeContextMenu,
  highlightedNodes, highlightedEdges,
  hoveredNodeId, selectedNodeId, focusedNodeId, searchMatchIds,
  running, forceParams, activeSection, activeChargeType,
  activeGravityType, activePullEdge, nodeScale,
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

  // IDs of nodes whose definition appears more than once in the visible set.
  // Computed from the visible `nodes` prop so the halo tracks the current filter.
  const dupNodeIds = React.useMemo(() => {
    const countByDefKey = new Map<string, number>()
    for (const n of nodes) countByDefKey.set(n.definitionKey, (countByDefKey.get(n.definitionKey) ?? 0) + 1)
    const result = new Set<string>()
    for (const n of nodes) {
      if ((countByDefKey.get(n.definitionKey) ?? 0) > 1) result.add(n.id)
    }
    return result
  }, [nodes])

  // The definitionKey of the currently active (hovered or selected) node,
  // when that node belongs to a duplicate group. Used by the draw loop to
  // light up all sister copies with the duplicate halo, not just the active
  // node itself.
  const activeDupDefKey = React.useMemo(() => {
    const activeId = hoveredNodeId ?? selectedNodeId
    if (!activeId) return null
    const activeNode = nodeMap.get(activeId)
    if (!activeNode || !dupNodeIds.has(activeId)) return null
    return activeNode.definitionKey
  }, [hoveredNodeId, selectedNodeId, nodeMap, dupNodeIds])

  // --- Ref-based draw data (updated every render, read by draw loop) ---
  const drawData = React.useRef<DrawData>({
    nodes, edges, nodeMap, viewport, highlightedNodes, highlightedEdges,
    hoveredNodeId, selectedNodeId, focusedNodeId, searchMatchIds,
    forceParams, activeSection, activeChargeType, activeGravityType, activePullEdge, nodeScale, running,
    dupNodeIds, activeDupDefKey,
  })
  drawData.current = {
    nodes, edges, nodeMap, viewport, highlightedNodes, highlightedEdges,
    hoveredNodeId, selectedNodeId, focusedNodeId, searchMatchIds,
    forceParams, activeSection, activeChargeType, activeGravityType, activePullEdge, nodeScale, running,
    dupNodeIds, activeDupDefKey,
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
      // Match the on-screen size: screen radius is def.r × nodeSizeMul(scale);
      // convert to world units by dividing by scale, plus a small slop.
      const r = (definitionFor(n.nodeType).size.r * nodeSizeMul(viewport.scale, nodeScale)) / viewport.scale + 4
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 <= r * r) return n
    }
    return null
  }, [nodes, viewport, nodeScale])

  // Mouse handlers
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 0.85
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

  // Right-click on a node → open the floating context menu in the parent.
  // We suppress the browser menu only when a node is hit; clicking the
  // bare canvas still surfaces the default menu (useful for browser tools).
  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    if (!onNodeContextMenu) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const node = hitTest(sx, sy)
    if (node) {
      e.preventDefault()
      onNodeContextMenu(node.id, e.clientX, e.clientY)
    }
  }, [hitTest, onNodeContextMenu])

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
      // Dedicated, high-contrast label colour (darker than --color-text in
      // light themes, brighter in dark) so node names pop off the background.
      const labelColor = cssVar(canvas, '--color-graph-label', '#0f172a')
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
        // An edge is search-dimmed if a search is active and either
        // endpoint isn't a match — keeps the visible chain readable
        // without showing edges to dimmed nodes.
        const edgeSearchDimmed = d.searchMatchIds !== null &&
          (!d.searchMatchIds.has(edge.sourceId) || !d.searchMatchIds.has(edge.targetId))
        // Highlights override the per-style alpha so the active subgraph
        // pops; dim non-highlighted/non-matching edges down to DIM_ALPHA.
        ctx.globalAlpha = hasHighlight
          ? (edgeHighlighted ? 1 : DIM_ALPHA)
          : (edgeSearchDimmed ? DIM_ALPHA : baseAlpha)

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
          // Stop the arrowhead at the target's on-screen edge (screen radius =
          // def.r × nodeSizeMul(scale)) so it tracks the zoom-scaled node body.
          const tgtR = definitionFor(tgt.nodeType).size.r * nodeSizeMul(vp.scale, d.nodeScale)
          const offset = tgtR + 2
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
      // Solving F = pushMul·|q| / (d² + soft)^exp = T for d gives
      //   d = sqrt((pushMul·|q| / T)^(1/exp) − soft)
      // which is real only when the threshold is reachable for that node's
      // charge. As a result, stronger charges show larger rings (more reach),
      // and the weakest types may render only the outermost ring — exactly
      // the visual the user intuits when they tune a per-type charge.
      //
      // `soft` is now per-type: a single node's field uses its own effective
      // core radius (rEff = coreRadiusMultiplier × coreRadius[type])², the
      // self-pair case of the simulation's per-pair softening.
      //
      // Rings are hover-only: the persistent toggle was removed, so they show
      // only while the PUSH section (or a charge token) is hovered.
      const FORCE_THRESHOLDS = [0.2, 0.5, 1.5]
      if (pushActive) {
        const exp = d.forceParams.chargeExponent
        const pushMul = d.forceParams.pushMultiplier
        const crMul = d.forceParams.coreRadiusMultiplier
        const typeFilter = d.activeChargeType

        for (const node of d.nodes) {
          const [sx, sy] = worldToScreen(vp, node.x, node.y)
          const maxRing = 2000
          if (sx + maxRing < 0 || sx - maxRing > w ||
            sy + maxRing < 0 || sy - maxRing > h) continue

          const highlighted = typeFilter === null || node.nodeType === typeFilter
          const baseAlpha = highlighted ? 0.28 : 0.05
          const stepAlpha = highlighted ? 0.06 : 0.015

          const color = definitionFor(node.nodeType).color.fill
          ctx.strokeStyle = color

          const effectiveCharge = Math.abs(chargeForType(d.forceParams, node.nodeType)) * pushMul
          if (effectiveCharge <= 0) continue

          const rEff = crMul * coreRadiusForType(d.forceParams, node.nodeType)
          const soft = rEff * rEff

          // Collect every reachable ring radius. Outer rings (lower threshold
          // T, larger d, weaker force) draw fainter than inner rings — this
          // preserves the "field fades with distance" reading.
          const ringRadii: number[] = []
          for (let ti = 0; ti < FORCE_THRESHOLDS.length; ti++) {
            const T = FORCE_THRESHOLDS[ti]
            const ratio = effectiveCharge / T
            const inner = Math.pow(ratio, 1 / Math.max(exp, 0.01)) - soft
            if (inner <= 0) continue
            const dd = Math.sqrt(inner)
            const r = dd * vp.scale
            if (r < 2 || r > 2000) continue
            ringRadii.push(r)
          }

          if (ringRadii.length === 0) continue

          // Outline rings only — no per-node disc fill. Filling each field
          // washed the screen into a solid colour where many nodes overlap;
          // the ring outlines alone read as "reach" without stacking opacity.
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

      // PULL: edge tension. When a specific edge category is being tuned in
      // the spring map (activePullEdge), highlight only that category — drawn
      // as a border (a tension-coloured casing with the edge's own colour
      // redrawn on top) so the edge's identity colour stays clear. Otherwise
      // (section hover, no specific token) colour all edges by tension.
      const activePullKey = d.activePullEdge
      if (pullActive || activePullKey) {
        const distMul = d.forceParams.distanceMultiplier
        // Tension palette drawn from the app's own colours (theme-aware) so the
        // highlight reads as part of the visualizer, not a generic stoplight:
        // amber warning = stretched, cool activity-blue = compressed, calm
        // timer-teal = near rest.
        const tensionStretch = cssVar(canvas, '--color-warning', '#d97706')
        const tensionCompress = cssVar(canvas, '--color-activity', '#7CB9E8')
        const tensionRest = cssVar(canvas, '--color-timer', '#7EC8B8')
        for (const edge of d.edges) {
          const src = d.nodeMap.get(edge.sourceId)
          const tgt = d.nodeMap.get(edge.targetId)
          if (!src || !tgt) continue

          const cat = edgeCategory(d.forceParams, edge)
          if (activePullKey && cat.key !== activePullKey) continue

          const [sx, sy] = worldToScreen(vp, src.x, src.y)
          const [tx, ty] = worldToScreen(vp, tgt.x, tgt.y)
          if (Math.max(sx, tx) < -CULL_MARGIN || Math.min(sx, tx) > w + CULL_MARGIN ||
            Math.max(sy, ty) < -CULL_MARGIN || Math.min(sy, ty) > h + CULL_MARGIN) continue

          const restDist = cat.distance * distMul
          const dx = tgt.x - src.x
          const dy = tgt.y - src.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const ratio = dist / Math.max(restDist, 0.1)

          let tensionColor: string
          if (ratio > 1.15) {
            tensionColor = tensionStretch
          } else if (ratio < 0.85) {
            tensionColor = tensionCompress
          } else {
            tensionColor = tensionRest
          }

          if (activePullKey) {
            // Border: a tension-coloured casing wider than the edge, then the
            // edge's own colour redrawn on top at full opacity.
            const style = edgeStyleFor(edge, src, tgt)
            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.lineTo(tx, ty)
            ctx.strokeStyle = tensionColor
            ctx.globalAlpha = 0.9
            ctx.lineWidth = style.width + 5
            ctx.setLineDash([])
            ctx.stroke()

            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.lineTo(tx, ty)
            ctx.strokeStyle = style.color
            ctx.globalAlpha = 1
            ctx.lineWidth = style.width
            ctx.setLineDash([...style.dash])
            ctx.stroke()
            ctx.setLineDash([])
            continue
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
            ctx.strokeStyle = tensionRest
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

      // GRAVITY: band rest regions. Drawn only when band gravity is active, and
      // shaped by the mode:
      //   cartesian — per-type Y stripes (median-centred to match the force) +
      //               a global X band.
      //   radial    — concentric rings at each tier's target radius about the
      //               world origin.
      if (gravityActive && d.forceParams.bandEnabled) {
        // Node types present in the visible set (their band centres drive both
        // the cartesian median and the radial ring mapping).
        const present: NodeType[] = []
        const seenTypes = new Set<NodeType>()
        for (const n of d.nodes) {
          if (seenTypes.has(n.nodeType)) continue
          seenTypes.add(n.nodeType)
          present.push(n.nodeType)
        }
        const centerOf = (t: NodeType) => {
          const b = bandForType(d.forceParams, t)
          return (b.yMin + b.yMax) / 2
        }

        if (d.forceParams.gravityMode === 'radial') {
          const centers = present.map(centerOf)
          const lo = centers.length ? Math.min(...centers) : 0
          const span = (centers.length ? Math.max(...centers) : 0) - lo || 1
          const [ox, oy] = worldToScreen(vp, 0, 0)
          for (const t of present) {
            const targetR = RADIAL_R_MIN + ((centerOf(t) - lo) / span) * (RADIAL_R_MAX - RADIAL_R_MIN)
            const isActive = d.activeGravityType === t
            const isDimmed = d.activeGravityType !== null && !isActive
            ctx.strokeStyle = definitionFor(t).color.fill
            ctx.globalAlpha = isActive ? 0.6 : isDimmed ? 0.1 : 0.28
            ctx.lineWidth = isActive ? 1.5 : 1
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.arc(ox, oy, targetR * vp.scale, 0, Math.PI * 2)
            ctx.stroke()
          }
        } else {
          // Median band centre over the visible types (matches applyBandGravity).
          const sorted = present.map(centerOf).sort((a, b) => a - b)
          const m = sorted.length
          const median = m ? (m % 2 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2) : 0

          for (const t of ALL_NODE_TYPES) {
            const band = bandForType(d.forceParams, t)
            const [, sy1] = worldToScreen(vp, 0, band.yMin - median)
            const [, sy2] = worldToScreen(vp, 0, band.yMax - median)
            if (sy2 < 0 || sy1 > h) continue

            const isActive = d.activeGravityType === t
            const isDimmed = d.activeGravityType !== null && !isActive

            const nodeColor = definitionFor(t).color.fill
            ctx.fillStyle = nodeColor
            ctx.globalAlpha = isActive ? 0.20 : isDimmed ? 0.04 : 0.10
            ctx.fillRect(0, sy1, w, sy2 - sy1)

            ctx.strokeStyle = nodeColor
            ctx.globalAlpha = isActive ? 0.55 : isDimmed ? 0.08 : 0.22
            ctx.lineWidth = isActive ? 1.5 : 1
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.moveTo(0, sy1); ctx.lineTo(w, sy1)
            ctx.moveTo(0, sy2); ctx.lineTo(w, sy2)
            ctx.stroke()
          }

          // X band: dashed verticals at xMin and xMax with a faint fill.
          const [sxMin] = worldToScreen(vp, d.forceParams.bandXMin, 0)
          const [sxMax] = worldToScreen(vp, d.forceParams.bandXMax, 0)
          if (sxMin < w + CULL_MARGIN && sxMax > -CULL_MARGIN) {
            ctx.strokeStyle = '#8B7EC8'
            ctx.globalAlpha = 0.5
            ctx.lineWidth = 1.5
            ctx.setLineDash([6, 6])
            ctx.beginPath()
            ctx.moveTo(sxMin, 0); ctx.lineTo(sxMin, h)
            ctx.moveTo(sxMax, 0); ctx.lineTo(sxMax, h)
            ctx.stroke()
            ctx.fillStyle = '#8B7EC8'
            ctx.globalAlpha = 0.05
            ctx.fillRect(sxMin, 0, sxMax - sxMin, h)
            ctx.setLineDash([])
          }
        }

        ctx.globalAlpha = 1
      }

      // Draw nodes
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Node + label size multiplier for the current zoom (clamped, tunable).
      const mul = nodeSizeMul(vp.scale, d.nodeScale)

      // Bounding boxes of labels already placed this frame, for collision
      // avoidance (see the label block below). Reset every frame.
      const labelBoxes: { x: number; y: number; w: number; h: number }[] = []

      // Screen-space circle for every node, so a label can also avoid
      // overlapping any node body (not just other labels). Precomputed because a
      // label may collide with a node drawn later in the same loop.
      const nodeCircles = d.nodes.map(n => {
        const [nx, ny] = worldToScreen(vp, n.x, n.y)
        return { x: nx, y: ny, r: definitionFor(n.nodeType).size.r * mul }
      })

      for (const node of d.nodes) {
        const [sx, sy] = worldToScreen(vp, node.x, node.y)
        const def = definitionFor(node.nodeType)
        const r = def.size.r * mul
        const hw = r  // nodes are circles: half-width = half-height = r

        if (sx + hw < -CULL_MARGIN || sx - hw > w + CULL_MARGIN ||
          sy + hw < -CULL_MARGIN || sy - hw > h + CULL_MARGIN) continue

        const nodeHighlighted = d.highlightedNodes?.has(node.id) ?? false
        const searchDimmed = d.searchMatchIds !== null && !d.searchMatchIds.has(node.id)
        const nodeDimmed = (hasHighlight && !nodeHighlighted) || searchDimmed
        ctx.globalAlpha = nodeDimmed ? DIM_ALPHA : 1

        const fill   = def.color.fill
        const border = def.color.border
        const icon   = def.icon

        // Filled body + crisp border. The border is ~3 stops darker than the
        // fill; 1.25px at the lowest zoom keeps the outline visible without
        // turning small nodes into bullseyes.
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.lineWidth = Math.max(1, Math.min(2, vp.scale * 1.25))
        ctx.strokeStyle = border
        ctx.stroke()

        // Icon glyph at the node centre (single unicode char). Only drawn
        // once we're above the label-elision scale — at very low zoom the
        // icon bleeds into the fill anyway and just adds noise.
        if (vp.scale >= LABEL_ELIDE_SCALE && icon) {
          ctx.save()
          ctx.font = `${def.size.iconSize * mul}px ${ICON_FONT_FAMILY}`
          ctx.fillStyle = '#FFFFFF'
          ctx.globalAlpha = (nodeDimmed ? DIM_ALPHA : 1) * 0.92
          ctx.fillText(icon, sx, sy + 0.5)
          ctx.restore()
        }

        // Orphan indicator — dropped at very low zoom (decorative noise at that scale)
        if (node.orphan && vp.scale >= DETAIL_REDUCE_SCALE) {
          ctx.save()
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = fill
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // No search-match ring. Per spec § Search Behavior, search is
        // expressed as opacity only (full vs. DIM_ALPHA above) — the
        // ring vocabulary is reserved for other decoration.

        // Duplicate halo — colored ring in the node's own fill color drawn on
        // every visible copy of a definition whenever ANY of those copies is
        // hovered or selected. The halo always renders at full color (alpha
        // 0.55) — it deliberately ignores nodeDimmed so it pops even when the
        // rest of the node is faded by the highlight system.
        //
        // Sits at r + 5 (same gap from the node edge as the default
        // selection ring) and uses a slightly thinner stroke so the two rings
        // read as distinct even when they appear together.
        const dupHaloActive = d.activeDupDefKey !== null &&
          node.definitionKey === d.activeDupDefKey &&
          vp.scale >= DETAIL_REDUCE_SCALE
        if (dupHaloActive) {
          ctx.save()
          ctx.strokeStyle = fill
          ctx.lineWidth = 2
          ctx.setLineDash([])
          ctx.globalAlpha = 0.55
          ctx.beginPath()
          ctx.arc(sx, sy, r + 5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Selection ring — white solid ring. Expands to r + 10 when the
        // duplicate halo is also active, keeping the two rings clearly apart.
        if (node.id === d.selectedNodeId) {
          const selR = dupHaloActive ? r + 10 : r + 5
          ctx.save()
          ctx.strokeStyle = SELECTION_RING_COLOR
          ctx.lineWidth = 2.5
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(sx, sy, selR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Focus ring — dropped at very low zoom (dashes too small to read).
        // Sits at r + 9 so it clears the duplicate halo at r + 7.
        if (node.id === d.focusedNodeId && vp.scale >= DETAIL_REDUCE_SCALE) {
          ctx.save()
          ctx.strokeStyle = FOCUS_RING_COLOR
          ctx.lineWidth = 2
          ctx.setLineDash([2, 2])
          ctx.beginPath()
          ctx.arc(sx, sy, r + 9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        ctx.globalAlpha = 1

        // Label — node name only; all other detail lives in the hover box.
        // Elided at low zoom; always shown for the hovered/selected node.
        // Collision avoidance: a name is drawn only if its box overlaps neither
        // an already-placed label nor any node body this frame (active nodes
        // always win). Greedy in node order — which is stable — so the set of
        // shown labels doesn't flicker once the layout settles. O(n²) worst
        // case, fine at this scale.
        const isActiveNode = node.id === d.hoveredNodeId || node.id === d.selectedNodeId
        if (vp.scale >= LABEL_ELIDE_SCALE || isActiveNode) {
          // Active nodes (hovered/selected) keep a readable floor size even when
          // zoomed out, since they're deliberately surfaced; others scale freely.
          const labelPx = LABEL_FONT_PX * (isActiveNode ? Math.max(mul, 1) : mul)
          const labelY = sy + r + 4 + labelPx * 0.7
          ctx.font = labelFont(labelPx)
          const text = labelText(node.name)
          const tw = ctx.measureText(text).width
          const box = { x: sx - tw / 2 - 2, y: labelY - labelPx / 2 - 1, w: tw + 4, h: labelPx + 2 }
          const hitsLabel = labelBoxes.some(b =>
            box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)
          // Box-vs-circle: closest point on the label box to each node centre.
          const hitsNode = !hitsLabel && nodeCircles.some(c => {
            const cx = Math.max(box.x, Math.min(c.x, box.x + box.w))
            const cy = Math.max(box.y, Math.min(c.y, box.y + box.h))
            return (c.x - cx) ** 2 + (c.y - cy) ** 2 < c.r * c.r
          })
          if (isActiveNode || (!hitsLabel && !hitsNode)) {
            labelBoxes.push(box)
            // Softened + slightly translucent so names aren't the only bright
            // text on the dark canvas and edges stay visible through them.
            // Dimmed labels already encode their fade in the colour itself.
            ctx.globalAlpha = nodeDimmed ? 1 : LABEL_ALPHA
            ctx.fillStyle = nodeDimmed ? labelDimColor : labelColor
            ctx.fillText(text, sx, labelY)
            ctx.globalAlpha = 1
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
        onContextMenu={handleContextMenu}
      />
    </div>
  )
}
