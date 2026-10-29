// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, rendering, and interaction.

import { readableGraph, isContainment } from '../graph/model'
import React from 'react'
import './GraphView.css'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import type { Simulation } from '../graph/simulation'
import { bandOverlay, layoutFrame, resolvePhysics } from '../graph/forces'
import { isIdentityMapping } from '../graph/dimension'
import type { FocusTarget } from '../filter/types'
import { matchesFocus, passesSelection } from '../filter/types'
import type { PresentSets } from './graph-view/present'
import { presentSetsOf } from './graph-view/present'
import type { EdgeStroke } from '../graph/scheme'
import { schemeVars } from '../graph/scheme'
import { useTheme, THEME_CHOICES } from './graph-view/useTheme'
import type { ThemeChoice } from './graph-view/useTheme'
import { axisOptions, layoutAxisOptions, pairTuning, sprungEdges } from '../graph/simulation'
import type { DimensionalMapping } from '../graph/dimension'
import type { Graph, GraphEdge } from '../graph/model'
import { valuesOn } from '../graph/dimension'
import { copyGroups, copyKeyOf } from '../graph/model'
import { DEFAULT_NODE_SCALE, type NodeScaleParams } from '../graph/node-scale'
import { useOntology } from './graph-view/useOntology'
import { worldToScreen } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { GraphCanvas } from './GraphCanvas'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { GraphControlPanel } from './GraphControlPanel'
import { activeGroupsOf, boostGroupsForNodes, type ActiveGroup, type NodeGroup } from '../graph/groups'
import { FilterBar } from './FilterBar'
import { useRecentlyChanged } from './graph-view/useRecentlyChanged'
import { useViewport } from './graph-view/useViewport'
import { useHighlight } from './graph-view/useHighlight'
import { useSimulation } from './graph-view/useSimulation'
import { useVisibleGraph } from './graph-view/useVisibleGraph'
import { useSimulationLoop } from './graph-view/useSimulationLoop'
import { validateGraph, dropInvalid } from '../graph/validate'
import type { GraphDiagnostic } from '../graph/validate'

interface GraphViewProps {
  // Whether this view is the active tab. Both views stay mounted (keep-alive),
  // so the inactive one must not respond to global keyboard shortcuts.
  active: boolean
  /**
   * Where the pane's shortcuts listen. `pane`: the root is focusable and
   * handles the keys that reach it, so a host page keeps Tab and Space for its
   * own controls. `global`: the window, while `active` — for a host whose
   * whole page is this pane. `none`: no shortcuts.
   */
  keyboard?: 'pane' | 'global' | 'none'
  /** The graph, built by the host from whatever it reads. */
  graph: Graph
  /** Chip badge counts per axis and value — the host's reading of its own data. */
  counts: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** The host's findings bars, rendered under the filter chips. */
  findings?: React.ReactNode
  /** Groups to glow, over the whole graph; the view restricts them to the visible set and colours them. */
  groups?: readonly NodeGroup[]
  /** The host's control for its groups (a legend, a modal), rendered inside the pane — which sets `--gv-toolbar-height` on its root so a control can anchor under the bar — and handed the groups as drawn, colours included. */
  groupsControl?: (active: readonly ActiveGroup[]) => React.ReactNode
  /** The host's cross-view action for a node — its label, and what it does with the target — offered in the hover box. */
  crossView?: { label: string; onFocus: (target: FocusTarget) => void }
  /** The pane's theme choice and where a new one goes. */
  theme: ThemeChoice
  onThemeChange: (next: ThemeChoice) => void
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  pins: PinState
  onPinsChange: (next: PinState) => void
  chain: readonly string[]
  onChainChange?: (next: readonly string[]) => void
  searchQuery: string
  searchActive: boolean
  onSearchChange: (query: string, active: boolean) => void
  pendingFocus: FocusTarget | null
  onFocusConsumed: () => void
  overriddenPins: Set<FilterDimension>
  onOverriddenPinsConsumed: () => void
}

// Graph-view filter entries — shared with the Tree view so the two bars agree
// Graph views always show the same chip layout. See VIEW_FILTER_ENTRIES.

export function GraphView({
  active,
  keyboard = 'pane',
  graph: hostGraph,
  counts,
  findings,
  groups,
  groupsControl,
  crossView,
  filter,
  onFilterChange,
  pins,
  onPinsChange,
  chain,
  onChainChange,
  searchQuery,
  searchActive,
  onSearchChange,
  pendingFocus,
  onFocusConsumed,
  overriddenPins,
  onOverriddenPinsConsumed, theme: themeChoice, onThemeChange,
}: GraphViewProps) {
  const ontology = useOntology()
  // Filter state is driven by props from the host shell, and the axes this view
  // filters on are the chain's, in order: an axis the host declared but this
  // view does not show is not filtering here.
  const filterAxes = React.useMemo(
    () => chain.flatMap(id => { const d = ontology.descriptorFor(id); return d ? [d] : [] }),
    [chain, ontology],
  )
  // The host's graph, checked once: every defect named, the edges an
  // error names left out of what is drawn, the list shown under the bar.
  const diagnostics = React.useMemo(() => validateGraph(hostGraph, ontology), [hostGraph, ontology])
  const graph = React.useMemo(() => dropInvalid(hostGraph, diagnostics), [hostGraph, diagnostics])
  // Every node's copies, by the key they share — derived here, once per graph.
  const copies = React.useMemo(() => copyGroups(graph), [graph])

  // --- Core state ---
  // Camera (viewport transform, container ref, fit/center coordination).
  const { viewport, setViewport, containerRef, initialFitDone, pendingCenterRef, fit } = useViewport()
  // The simulation instance + its handlers are owned by useSimulation, and the
  // RAF loop + fps by useSimulationLoop, both called below once `graph` and the
  // visible subgraph are available.

  // Interaction / highlight state (hover, selection, keyboard focus, shift, and
  // the control-panel preview) is owned by useHighlight, called below once the
  // visible subgraph it derives from is available.

  // --- Search ---
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  // The overlay (filter chips, search, the host's findings, the pane's
  // diagnostics, the search results) floats over the full-bleed canvas, and
  // its height is dynamic. It is measured whole, so a host control anchored
  // at `--gv-toolbar-height` sits under everything the overlay shows, the open
  // search results included.
  const toolbarRef = React.useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setToolbarHeight(el.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const recentlyChanged = useRecentlyChanged(filter)

  // What each filter axis can take, read off the graph: the engine declares no
  // value vocabulary, so the bar learns an axis's domain from the nodes.
  const valuesByDimension = React.useMemo(
    () => new Map(ontology.filterDimensions.map(d => [d.id, valuesOn(graph.nodes.values(), d.id)])),
    [graph, ontology],
  )

  // Reset camera/fps coordination on each sim rebuild. Held by useSimulation
  // and invoked from its build effect (selection reset is owned by useHighlight,
  // keyed on `graph`).
  const onSimRebuild = React.useCallback(() => {
    initialFitDone.current = false
  }, [initialFitDone])

  // Simulation spine: the instance, version signal, running flag, forceParams,
  // and every sim-mutating handler.
  const {
    simRef,
    simVersion,
    running, setRunning,
    forceParams,
    getNode: getSimNode,
    onParamChange: handleParamChange,
    onForceAdjust: handleForceAdjust,
    onRelayout: handleRelayout,
    onNodeDragStart: handleNodeDragStart,
    onNodeDragMove: handleNodeDragMove,
    onNodeDragEnd: handleNodeDragEnd,
    onToggleRunning: handleToggleRunning,
  } = useSimulation(graph, onSimRebuild)


  // The dense per-bucket tables the kernels read, resolved once per
  // (params, taxonomy) here and handed to the canvas and every control.
  const resolved = React.useMemo(() => resolvePhysics(forceParams, ontology), [forceParams, ontology])

  // What the push/pull tab offers: every axis this graph admits with its
  // measured token cost, and the spring categories some edge falls in under
  // the current one (the pull tokens). Both read the whole graph, not the
  // visible subset — tuning covers what a filter may reveal next.
  const axes = React.useMemo(() => axisOptions(ontology, graph), [ontology, graph])
  const layoutAxes = React.useMemo(() => layoutAxisOptions(axes, ontology), [axes, ontology])
  // The frame the band forces act in and the overlay the canvas draws, both
  // over the WHOLE graph — the same frame the simulation seeds and ticks in.
  const frame = React.useMemo(() => layoutFrame(readableGraph(graph), resolved), [graph, resolved])
  // The theme the pane draws in: the choice, or the host's for system. The
  // scheme rides inline as custom properties in that theme, and every
  // visible edge's stroke is resolved here once, not per frame.
  const theme = useTheme(containerRef, themeChoice)
  const schemeStyle = React.useMemo(() => schemeVars(ontology, theme) as React.CSSProperties, [ontology, theme])
  const overlay = React.useMemo(() => bandOverlay(graph.nodes.values(), forceParams, resolved, frame,
    (axis, bucket) => axis.mapping.dimension === ontology.styleAxis() && isIdentityMapping(axis.mapping)
      ? ontology.styleForKey(bucket).color[theme].fill
      : undefined), [graph, forceParams, resolved, frame, ontology, theme])

  // A new axis starts both pair forces from the taxonomy's declared physics on
  // its buckets (a tuning keyed by one axis has no reading on another).
  const handleAxisChange = React.useCallback((mapping: DimensionalMapping) => {
    if (mapping.dimension === forceParams.pair.mapping.dimension) return
    handleRelayout({ pair: pairTuning(mapping) })
  }, [forceParams.pair.mapping.dimension, handleRelayout])

  // Render-time node sizing (independent of the simulation). Tunable from the
  // Controls panel (Misc → Node scaling); a pure-render concern, so it doesn't
  // touch ForceParams or reheat the layout.
  const [nodeScale, setNodeScale] = React.useState<NodeScaleParams>(DEFAULT_NODE_SCALE)
  const handleNodeScaleChange = React.useCallback((patch: Partial<NodeScaleParams>) => {
    setNodeScale(prev => ({ ...prev, ...patch }))
  }, [])

  // Clear pin-override flash after ~600ms so the visual flash plays once.
  React.useEffect(() => {
    if (overriddenPins.size === 0) return
    const timer = setTimeout(onOverriddenPinsConsumed, 600)
    return () => clearTimeout(timer)
  }, [overriddenPins, onOverriddenPinsConsumed])

  // Stale-file cleanup is now owned by the host shell (it touches both views'
  // filters consistently when the AST changes).

  // Visible subgraph derived from the live sim (filter + edge graduation +
  // summaries + downstream-depth scores), recomputed on filter / sim-rebuild.
  const { visibleNodes, visibleEdges, visibleIds, edgeTypes, nodeSummaries, downstreamScores } =
    useVisibleGraph(simRef, simVersion, filter, filterAxes)

  // Every visible edge's stroke, from the type the derivation resolved on the
  // edge's ORIGINAL endpoints, once, not per frame. An edge
  // whose type the taxonomy does not declare has no entry and draws neutral;
  // `validateGraph` has already named it.
  const edgeStrokes = React.useMemo(() => {
    const strokes = new Map<GraphEdge, EdgeStroke>()
    for (const edge of visibleEdges) {
      const type = edgeTypes.get(edge.id)
      if (type !== undefined) strokes.set(edge, ontology.edgeStrokeFor(type))
    }
    return strokes
  }, [visibleEdges, edgeTypes, ontology])

  // Parallel dependency edges — two or more between one pair of visible nodes,
  // kept apart — take lanes a few pixels either side of the line so
  // both read. One pass per visible set.
  const edgeOffsets = React.useMemo(() => {
    const byPair = new Map<string, string[]>()
    for (const e of visibleEdges) {
      if (isContainment(e)) continue
      const key = e.sourceId < e.targetId ? `${e.sourceId}|${e.targetId}` : `${e.targetId}|${e.sourceId}`
      const list = byPair.get(key)
      if (list) list.push(e.id); else byPair.set(key, [e.id])
    }
    const out = new Map<string, number>()
    for (const ids of byPair.values()) {
      if (ids.length < 2) continue
      ids.forEach((id, i) => out.set(id, (i - (ids.length - 1) / 2) * 7))
    }
    return out
  }, [visibleEdges])

  // What the controls offer: only what the post-filter visible set holds —
  // one function, `presentSetsOf`, that the harness calls too.
  // The pull half is read over the edges the simulation springs (the graph's
  // own, both ends visible), not over the graduated edges it draws.
  const sprung = React.useMemo(() => sprungEdges(graph.edges, visibleIds), [graph, visibleIds])
  const present = React.useMemo<PresentSets>(
    () => presentSetsOf(visibleNodes, sprung, resolved, getSimNode),
    [visibleNodes, sprung, resolved, ontology, getSimNode],
  )

  // Selection / hover / keyboard-focus / shift + control-panel preview state,
  // plus the derived transitive-dependency highlight sets and focusedNodeId.
  const {
    hoveredNodeId, setHoveredNodeId,
    selectedNodeId, setSelectedNodeId,
    setFocusedIndex,
    shiftHeld,
    focusedNodeId,
    highlightedNodes, highlightedEdges,
    activeSection, setActiveSection,
    activePushBucket, setActivePushBucket,
    activeGravityBucket, setActiveGravityBucket,
    activePullEdge, setActivePullEdge,
  } = useHighlight(visibleNodes, visibleEdges, visibleIds, getSimNode, graph)

  // The groups as drawn: the
  // host's, restricted to the visible set and coloured in order. Drives the
  // canvas glow and the host's control.
  const activeGroups = React.useMemo(() => activeGroupsOf(groups ?? [], visibleIds, theme), [groups, visibleIds, theme])

  // Canvas glow set: the active groups with the group under the hovered/selected
  // node strengthened, so one group surfaces from many faint ones as the pointer
  // moves. The modal keeps the un-boosted activeGroups (its legend colors don't
  // depend on strength).
  const glowGroups = React.useMemo(
    () => boostGroupsForNodes(activeGroups, [hoveredNodeId, selectedNodeId]),
    [activeGroups, hoveredNodeId, selectedNodeId],
  )

  // Search matches against all nodes (not just visible). When search is
  // active we return a Set even if empty so the canvas dims everything —
  // an empty search with a query is "no matches yet, all non-matching",
  // not "no search active".
  // Hidden matches are counted on the chip hiding them: the first declared
  // axis the node fails, under its value there — a precedence a host's own
  // filter bar can share, so the two read alike.
  const { visibleMatchIds, hiddenMatchCount, hiddenMatches } = React.useMemo(() => {
    const none = new Map<string, ReadonlyMap<string, number>>()
    if (!searchQuery) return { visibleMatchIds: null as Set<string> | null, hiddenMatchCount: 0, hiddenMatches: none }
    const lq = searchQuery.toLowerCase()
    const sim = simRef.current
    if (!sim) return { visibleMatchIds: new Set<string>(), hiddenMatchCount: 0, hiddenMatches: none }

    const visible = new Set<string>()
    let hidden = 0
    const byAxis = new Map<string, Map<string, number>>()
    for (const node of sim.nodes) {
      if (!node.name.toLowerCase().includes(lq)) continue
      if (visibleIds.has(node.id)) { visible.add(node.id); continue }
      hidden++
      const failing = filterAxes.find(d => !passesSelection(filter, [d], dim => ontology.valueOn(node, dim)))
      const value = failing ? ontology.valueOn(node, failing.id) : undefined
      if (!failing || value === undefined) continue
      const tally = byAxis.get(failing.id) ?? new Map<string, number>()
      tally.set(value, (tally.get(value) ?? 0) + 1)
      byAxis.set(failing.id, tally)
    }
    return { visibleMatchIds: visible, hiddenMatchCount: hidden, hiddenMatches: byAxis }
  }, [searchQuery, visibleIds, filter, filterAxes, ontology])

  // Physics loop + filter-driven reheats. Owns the RAF tick (with one-shot
  // initial fit, cross-view center, fps, and stability stop), the hover tooltip
  // re-render tick, and the seed/reheat-on-filter-change effects. It consumes the
  // sim, the visible subgraph, and the camera/selection handles as inputs.
  const { fps } = useSimulationLoop({
    simRef, running, setRunning,
    visibleIds, visibleNodes, downstreamScores,
    filter, axes: filterAxes,
    hoveredNodeId, selectedNodeId,
    containerRef, initialFitDone, pendingCenterRef, setViewport, setSelectedNodeId,
  })

  // Double-click node: center and zoom to neighbors
  const handleDoubleClickNode = React.useCallback((id: string) => {
    const sim = simRef.current
    if (!sim) return
    const node = sim.getNode(id)
    if (!node) return
    const neighborIds = new Set<string>([id])
    for (const edge of sim.edges) {
      if (edge.sourceId === id) neighborIds.add(edge.targetId)
      if (edge.targetId === id) neighborIds.add(edge.sourceId)
    }
    const neighbors = sim.nodes.filter(n => neighborIds.has(n.id))
    fit(neighbors, 80)
  }, [fit])

  // Fit-to-view
  const handleFitToView = React.useCallback(() => {
    fit(visibleNodes)
  }, [fit, visibleNodes])

  // Search toggle — used by the keyboard handler (Escape closes search). The
  // filter-bar's own search button has its own copy inside FilterBar. Search
  // query is globally shared so clearing it on close affects both views.
  const toggleSearch = () => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  // Hover with a grace period so the pointer can travel from a node onto its
  // hover tooltip (interactive — it carries the host's cross-view button)
  // without the tooltip vanishing. A null from the canvas schedules a clear;
  // the tooltip's onMouseEnter cancels it, onMouseLeave re-arms it.
  const hoverClearTimer = React.useRef<number | null>(null)
  const cancelHoverClear = React.useCallback(() => {
    if (hoverClearTimer.current !== null) {
      clearTimeout(hoverClearTimer.current)
      hoverClearTimer.current = null
    }
  }, [])
  const handleHoverNode = React.useCallback((id: string | null) => {
    cancelHoverClear()
    if (id !== null) {
      setHoveredNodeId(id)
    } else {
      hoverClearTimer.current = window.setTimeout(() => {
        setHoveredNodeId(null)
        hoverClearTimer.current = null
      }, 150)
    }
  }, [cancelHoverClear, setHoveredNodeId])

  // Select node from search result
  const handleSelectSearchResult = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    // Center viewport on the node
    const sim = simRef.current
    const container = containerRef.current
    if (!sim || !container) return
    const node = sim.getNode(nodeId)
    if (!node) return
    const { width, height } = container.getBoundingClientRect()
    setViewport({
      scale: viewport.scale,
      x: width / 2 - node.x * viewport.scale,
      y: height / 2 - node.y * viewport.scale,
    })
  }

  // Focused node ID (for keyboard nav)
  // Cross-view focus: the host shell's reconciler has already
  // expanded the destination filter so the target is visible. We only
  // arrange the visual focus part — set up the center-on-target ref
  // and reheat the simulation if it had stabilized.
  React.useEffect(() => {
    if (!pendingFocus) return
    const sim = simRef.current
    if (sim) {
      // Matched on whatever dimension values the host pinned the name with;
      // this view never learns which axis that was.
      const targetNode = sim.nodes.find(n => matchesFocus(n, pendingFocus))
      if (targetNode) {
        pendingCenterRef.current = { nodeId: targetNode.id }
        if (!running) {
          simRef.current?.reheat(0.1)
          setRunning(true)
        }
      }
    }
    onFocusConsumed()
  }, [pendingFocus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard, scoped by `keyboard`: on the pane, the focusable root
  // handles the keys that reach it; globally, the window does while this view
  // is `active` — the hidden (inactive) view, kept mounted, never also handles
  // them. A control keeps its own keys either way: Space on a button activates
  // the button, not the simulation, and Tab from a control moves focus.
  const handleKey = React.useCallback((e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    const onControl = target !== null && target !== containerRef.current &&
      target.closest('button, select, a, [contenteditable], [role="tab"]') !== null
    if (onControl && e.key !== 'Escape') return

    switch (e.key) {
      case 'Tab': {
        // On the pane, Tab cycles nodes only while the pane itself is focused;
        // from anywhere else it moves focus as it always does.
        if (keyboard === 'pane' && target !== containerRef.current) return
        e.preventDefault()
        const count = visibleNodes.length
        if (count === 0) return
        if (e.shiftKey) {
          setFocusedIndex(prev => prev > 0 ? prev - 1 : count - 1)
        } else {
          setFocusedIndex(prev => prev < count - 1 ? prev + 1 : 0)
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (focusedNodeId) setSelectedNodeId(focusedNodeId)
        break
      }
      case 'Escape': {
        e.preventDefault()
        if (shortcutsOpen) { setShortcutsOpen(false); break }
        if (searchActive) { toggleSearch(); break }
        if (selectedNodeId) { setSelectedNodeId(null); break }
        // Nothing left to close: on the pane, give focus back to the host.
        if (keyboard === 'pane') containerRef.current?.blur()
        break
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault()
        const PAN_STEP = 30
        const dx = e.key === 'ArrowLeft' ? PAN_STEP : e.key === 'ArrowRight' ? -PAN_STEP : 0
        const dy = e.key === 'ArrowUp' ? PAN_STEP : e.key === 'ArrowDown' ? -PAN_STEP : 0
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
        break
      }
      case '+':
      case '=': {
        e.preventDefault()
        setViewport(prev => zoomAt(prev, (containerRef.current?.clientWidth ?? 400) / 2, (containerRef.current?.clientHeight ?? 400) / 2, 1.15))
        break
      }
      case '-':
      case '_': {
        e.preventDefault()
        setViewport(prev => zoomAt(prev, (containerRef.current?.clientWidth ?? 400) / 2, (containerRef.current?.clientHeight ?? 400) / 2, 0.85))
        break
      }
      case 'f':
      case 'F': {
        e.preventDefault()
        handleFitToView()
        break
      }
      case '/': {
        e.preventDefault()
        if (!searchActive) {
          onSearchChange(searchQuery, true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        } else {
          searchInputRef.current?.focus()
        }
        break
      }
      case ' ': {
        e.preventDefault()
        handleToggleRunning()
        break
      }
      case '?': {
        e.preventDefault()
        setShortcutsOpen(prev => !prev)
        break
      }
    }
  }, [keyboard, visibleNodes, focusedNodeId, selectedNodeId, searchActive, searchQuery, onSearchChange, shortcutsOpen, handleFitToView, handleToggleRunning]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (keyboard !== 'global' || !active) return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [keyboard, active, handleKey])
  const paneKeyDown = React.useCallback((e: React.KeyboardEvent) => handleKey(e.nativeEvent), [handleKey])

  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

  // Graph-view search adornment: the hidden-match "+N" badge.
  const searchExtra = hiddenMatchCount > 0 ? (
    <span className="gv-header-search-badge" title={`${hiddenMatchCount} match${hiddenMatchCount !== 1 ? 'es' : ''} hidden by filters`}>
      +{hiddenMatchCount}
    </span>
  ) : null

  return (
    <CanvasErrorBoundary what="graph view">
    <div
      className="gv-graph-view"
      ref={containerRef}
      data-theme={theme}
      tabIndex={keyboard === 'pane' ? 0 : undefined}
      onKeyDown={keyboard === 'pane' ? paneKeyDown : undefined}
      style={{ ...schemeStyle, ...(toolbarHeight ? { ['--gv-toolbar-height' as string]: `${toolbarHeight}px` } : {}) } as React.CSSProperties}
    >
      {/* Canvas fills the full viewport beneath the floating overlay */}
      <div className="gv-graph-canvas-area">
        <CanvasErrorBoundary>
          <GraphCanvas
            nodes={visibleNodes}
            edges={visibleEdges}
            viewport={viewport}
            onViewportChange={setViewport}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragMove={handleNodeDragMove}
            onNodeDragEnd={handleNodeDragEnd}
            onDoubleClickNode={handleDoubleClickNode}
            onHoverNode={handleHoverNode}
            onSelectNode={setSelectedNodeId}
            highlightedNodes={highlightedNodes}
            highlightedEdges={highlightedEdges}
            hoveredNodeId={hoveredNodeId}
            selectedNodeId={selectedNodeId}
            focusedNodeId={focusedNodeId}
            searchMatchIds={visibleMatchIds}
            running={running}
            forceParams={forceParams}
            resolved={resolved}
            overlay={overlay}
            theme={theme}
            edgeStrokes={edgeStrokes}
            edgeOffsets={edgeOffsets}
            activeSection={activeSection}
            activePushBucket={activePushBucket}
            activeGravityBucket={activeGravityBucket}
            activePullEdge={activePullEdge}
            nodeScale={nodeScale}
            groupGlows={glowGroups}
          />
        </CanvasErrorBoundary>
        <GraphHoverTooltip
          hoveredNodeId={hoveredNodeId}
          simRef={simRef}
          visibleEdges={visibleEdges}
          visibleIds={visibleIds}
          viewport={viewport}
          shiftHeld={shiftHeld}
          copies={copies}
          nodeSummaries={nodeSummaries}
          crossView={crossView}
          onMouseEnter={cancelHoverClear}
          onMouseLeave={() => handleHoverNode(null)}
        />
      </div>

      {/* Floating overlay: the shared filter bar (with the host's findings), the
          pane's own diagnostics, the search results. Measured whole: its height
          is `--gv-toolbar-height`, where a host control anchors. */}
      <div className="gv-graph-overlay" ref={toolbarRef}>
        <div className="gv-graph-toolbar">
          <FilterBar
            counts={counts}
            valuesByDimension={valuesByDimension}
            filter={filter}
            onFilterChange={onFilterChange}
            pins={pins}
            onPinsChange={onPinsChange}
            chain={chain}
            onChainChange={onChainChange}
            overriddenPins={overriddenPins}
            recentlyChanged={recentlyChanged}
            searchQuery={searchQuery}
            searchActive={searchActive}
            onSearchChange={onSearchChange}
            searchInputRef={searchInputRef}
            searchTitle="Search nodes (/)"
            searchPlaceholder="Search nodes..."
            searchExtra={searchExtra}
            hiddenMatches={hiddenMatches}
            findings={findings}
          />
        </div>

        {diagnostics.length > 0 && <GraphDiagnostics diagnostics={diagnostics} />}

        {/* Search results dropdown */}
        {visibleMatchIds && visibleMatchIds.size > 0 && searchActive && (
          <div className="gv-graph-search-results">
            {visibleNodes.filter(n => visibleMatchIds.has(n.id)).map(n => (
              <button
                key={n.id}
                className="gv-graph-search-result"
                onClick={() => handleSelectSearchResult(n.id)}
              >
                <span className="gv-graph-search-result-type">{ontology.valueFor(n)}</span>
                <span className="gv-graph-search-result-name">{n.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>{/* /graph-overlay */}

      {/* Bottom-left: node/edge counts (shifts right when the shortcuts panel
          is open so they don't overlap). */}
      <div className={`gv-graph-bottom-left${shortcutsOpen ? ' shifted' : ''}`}>
        <span className="gv-graph-count">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bottom-center: simulation controls + live fps. */}
      <div className="gv-graph-bottom-center">
        <button className="gv-graph-toolbar-btn" onClick={handleFitToView} title="Fit to view (F)">Fit</button>
        <button
          className={`gv-graph-toolbar-btn${themeChoice === 'system' ? '' : ' active'}`}
          onClick={() => onThemeChange(THEME_CHOICES[(THEME_CHOICES.indexOf(themeChoice) + 1) % THEME_CHOICES.length])}
          title={`Colour scheme: ${themeChoice}${themeChoice === 'system' ? ` (${theme})` : ''} — click to change`}
          aria-label="Colour scheme"
        >
          {themeChoice === 'system' ? 'Auto' : themeChoice === 'light' ? 'Light' : 'Dark'}
        </button>
        <button
          className={`gv-graph-toolbar-btn ${running ? 'active' : ''}`}
          onClick={handleToggleRunning}
          title={running ? 'Pause simulation (Space)' : 'Resume simulation (Space)'}
        >
          {running ? 'Pause' : 'Play'}
        </button>
        {/* Always rendered (reserving its width) so toggling Play/Pause never
            shifts the centred cluster; hidden when the simulation is paused. */}
        <span className={`gv-graph-count-fps${running ? '' : ' hidden'}`} title="Simulation frames per second">{fps} fps</span>
      </div>

      {/* Control panel */}
      <GraphControlPanel
        params={forceParams}
        resolved={resolved}
        onParamChange={handleParamChange}
        onAdjust={handleForceAdjust}
        onRelayout={handleRelayout}
        axes={axes}
        layoutAxes={layoutAxes}
        present={present}
        onAxisChange={handleAxisChange}
        onActiveSection={setActiveSection}
        onActivePushBucket={setActivePushBucket}
        onActiveGravityBucket={setActiveGravityBucket}
        onActivePullEdge={setActivePullEdge}
        nodeScale={nodeScale}
        onNodeScaleChange={handleNodeScaleChange}
      />

      {/* The host's control for its groups (top-left), handed the groups as drawn. */}
      {groupsControl?.(activeGroups)}

      {/* Shortcuts panel */}
      {shortcutsOpen && (
        <div className="gv-graph-shortcuts-panel">
          <div className="gv-graph-shortcuts-title">
            Keyboard Shortcuts
            <button className="gv-graph-shortcuts-close" onClick={() => setShortcutsOpen(false)}>&times;</button>
          </div>
          <div className="gv-graph-shortcuts-list">
            <Shortcut keys="Tab / Shift+Tab" desc="Cycle focus" />
            <Shortcut keys="Enter" desc="Select focused node" />
            <Shortcut keys="Escape" desc="Deselect / close" />
            <Shortcut keys="Arrow keys" desc="Pan viewport" />
            <Shortcut keys="+ / -" desc="Zoom in / out" />
            <Shortcut keys="F" desc="Fit to view" />
            <Shortcut keys="/" desc="Open search" />
            <Shortcut keys="Space" desc="Toggle simulation" />
            <Shortcut keys="Shift + hover" desc="Upstream deps" />
            <Shortcut keys="?" desc="This panel" />
          </div>
        </div>
      )}
    </div>
    </CanvasErrorBoundary>
  )
}

/** The pane's own findings about the host's graph: each with its code; errors name edges the view does not draw. */
function GraphDiagnostics({ diagnostics }: { diagnostics: readonly GraphDiagnostic[] }) {
  const errors = diagnostics.filter(d => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  const parts: string[] = []
  if (errors > 0) parts.push(`${errors} graph error${errors === 1 ? '' : 's'}`)
  if (warnings > 0) parts.push(`${warnings} graph warning${warnings === 1 ? '' : 's'}`)
  return (
    <details className={`gv-graph-diagnostics${errors > 0 ? ' has-errors' : ''}`} role={errors > 0 ? 'alert' : undefined}>
      <summary>{parts.join(', ')}{errors > 0 ? ' — the edges named are not drawn' : ''}</summary>
      <ul>
        {diagnostics.map((d, i) => (
          <li key={i} className={`gv-graph-diagnostic ${d.severity}`}><code>{d.code}</code>{d.message}</li>
        ))}
      </ul>
    </details>
  )
}

interface GraphHoverTooltipProps {
  hoveredNodeId: string | null
  simRef: React.RefObject<Simulation | null>
  visibleEdges: GraphEdge[]
  visibleIds: Set<string>
  viewport: Viewport
  shiftHeld: boolean
  /** Every node's copies by their shared key, over the whole graph. */
  copies: ReadonlyMap<string, ReadonlySet<string>>
  nodeSummaries: Map<string, string>
  // The host's cross-view action from the tooltip, when it offers one.
  crossView?: { label: string; onFocus: (target: FocusTarget) => void }
  // The tooltip is interactive: these keep it open while the pointer is over
  // it (so the cross-view button is clickable).
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, visibleIds, viewport, shiftHeld, copies, nodeSummaries, crossView, onMouseEnter, onMouseLeave }: GraphHoverTooltipProps) {
  // Before the early returns: this is a hook, and the component bails out four
  // different ways below.
  const ontology = useOntology()
  if (!hoveredNodeId) return null
  const sim = simRef.current
  if (!sim) return null
  const node = sim.getNode(hoveredNodeId)
  if (!node) return null

  // The context under the name is the taxonomy's answer: a host that keys a
  // value's identity on its own metadata says so there, as one line or
  // several; the library's default is the parent's name. The icon is the
  // value's own.
  const context = ontology.contextLine(node, node.parentId ? sim.getNode(node.parentId) : undefined)
  const contextLines = context === undefined ? [] : typeof context === 'string' ? [context] : [...context]
  const icon = ontology.resolveNodeStyle(node).icon

  // The composition line for a node that summarises its children (counted
  // per style value, named by its abbreviation). These used to render as a
  // badge under the node; they now live in the box. Degree nodes are covered
  // by the connection counts row below, so we don't duplicate them here.
  const summaryKind = ontology.resolveNodeStyle(node).summaryKind
  const compositionLine =
    summaryKind === 'children'
      ? nodeSummaries.get(hoveredNodeId) || undefined
      : undefined

  // The node's badges, as the canvas draws them above it, in one line.
  const badgesLine = node.badges && node.badges.length > 0 ? node.badges.join(' ') : undefined

  let outgoing = 0, incoming = 0
  for (const e of visibleEdges) {
    if (isContainment(e)) continue
    if (e.sourceId === hoveredNodeId) outgoing++
    if (e.targetId === hoveredNodeId) incoming++
  }

  // Copies indicator: when the same entity has more than one node in the
  // graph, say "copy i of N" so the user knows the halo they're seeing is
  // intentional. Count only copies that survive the current filter — a hidden
  // copy isn't a copy from the user's current point of view.
  const sisters = copies.get(copyKeyOf(node))
  const visibleCopies = sisters
    ? Array.from(sisters).filter(id => visibleIds.has(id))
    : [node.id]
  const copyCount = visibleCopies.length
  const copyIndex = copyCount > 1 ? visibleCopies.indexOf(node.id) + 1 : 0

  const [sx, sy] = worldToScreen(viewport, node.x, node.y)

  return (
    <div
      className="gv-graph-hover-tooltip"
      style={{ left: sx, top: sy }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="gv-tooltip-identity">
        {icon && <span className="gv-tooltip-type-icon">{icon}</span>}
        <span className="gv-tooltip-name">{node.name}</span>
      </div>
      {contextLines.map((line, i) => <div key={i} className="gv-tooltip-parent">{line}</div>)}
      {compositionLine && <div className="gv-tooltip-summary">{compositionLine}</div>}
      {badgesLine && <div className="gv-tooltip-summary">{badgesLine}</div>}
      {copyCount > 1 && (
        <div className="gv-tooltip-duplicates" title="The same entity appears in more than one place. Hovering any copy marks all copies.">
          copy {copyIndex} of {copyCount}
        </div>
      )}
      {(outgoing > 0 || incoming > 0) && (
        <div className="gv-tooltip-connections">
          {outgoing > 0 && <span className="gv-tooltip-conn-out">→{outgoing}</span>}
          {incoming > 0 && <span className="gv-tooltip-conn-in">←{incoming}</span>}
        </div>
      )}
      <div className="gv-tooltip-direction">{shiftHeld ? 'dependents' : 'dependencies'}</div>
      {crossView && (
        <button
          className="gv-tooltip-cross-view"
          onClick={() => crossView.onFocus({ name: node.name, values: node.dimensions })}
          title={crossView.label}
        >
          {crossView.label}
        </button>
      )}
    </div>
  )
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="gv-graph-shortcut-row">
      <kbd className="gv-graph-shortcut-key">{keys}</kbd>
      <span className="gv-graph-shortcut-desc">{desc}</span>
    </div>
  )
}

