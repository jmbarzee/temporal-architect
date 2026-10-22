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
import { matchesFocus } from '../filter/types'
import type { PresentSets } from './graph-view/present'
import { presentSetsOf } from './graph-view/present'
import type { EdgeStroke } from '../graph/scheme'
import { schemeVars } from '../graph/scheme'
import { useTheme, THEME_CHOICES } from './graph-view/useTheme'
import type { ThemeChoice } from './graph-view/useTheme'
import { axisOptions, layoutAxisOptions, pairTuning, sprungEdges } from '../graph/simulation'
import type { DimensionalMapping } from '../graph/dimension'
import type { Graph, GraphEdge } from '../graph/model'
import { SOURCE_FILE_DIMENSION, valuesOn } from '../graph/dimension'
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

interface GraphViewProps {
  // Whether this view is the active tab. Both views stay mounted (keep-alive),
  // so the inactive one must not respond to global keyboard shortcuts.
  active: boolean
  /** The graph, built by the host from whatever it reads. */
  graph: Graph
  /** Chip badge counts per axis and value — the host's reading of its own data. */
  counts: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** The host's findings bars, rendered under the filter chips. */
  findings?: React.ReactNode
  /** Groups to glow, over the whole graph; the view restricts them to the visible set and colours them. */
  groups?: readonly NodeGroup[]
  /** The host's control for its groups (a legend, a modal), rendered top-left and handed the groups as drawn, colours included. */
  groupsControl?: (active: readonly ActiveGroup[]) => React.ReactNode
  onShowInTree?: (target: FocusTarget) => void
  /** The pane's theme choice and where a new one goes (R21). */
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
  graph,
  counts,
  findings,
  groups,
  groupsControl,
  onShowInTree,
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
  // Filter state is now driven by props from the host shell (spec § Filter
  // State Model). Read the two structural dimensions through `filter`.

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

  // The toolbar (filter chips + file row + search + error/warning bars) floats
  // over the full-bleed canvas, and its height is dynamic (it grows when error
  // bars expand or chips wrap). Measure it so the Groups modal can sit just
  // below it instead of guessing with a magic offset that the toolbar outgrows.
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
  // (params, taxonomy) here and handed to the canvas and every control (T25).
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
  // scheme rides inline as custom properties in that theme (D57), and every
  // visible edge's stroke is resolved here once, not per frame (T25).
  const theme = useTheme(containerRef, themeChoice)
  const schemeStyle = React.useMemo(() => schemeVars(ontology, theme) as React.CSSProperties, [ontology, theme])
  const overlay = React.useMemo(() => bandOverlay(graph.nodes.values(), forceParams, resolved, frame,
    (axis, bucket) => axis.mapping.dimension === ontology.styleAxis() && isIdentityMapping(axis.mapping)
      ? ontology.styleForKey(bucket).color[theme].fill
      : undefined), [graph, forceParams, resolved, frame, ontology, theme])

  // A new axis starts both pair forces from the taxonomy's declared physics on
  // its buckets (D47: a tuning keyed by one axis has no reading on another).
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
  const { visibleNodes, visibleEdges, visibleIds, nodeSummaries, downstreamScores } =
    useVisibleGraph(simRef, simVersion, filter)

  // Every visible edge's stroke, resolved here once from the taxonomy's one
  // classifier (D57), not per frame (T25).
  const edgeStrokes = React.useMemo(() => {
    const strokes = new Map<GraphEdge, EdgeStroke>()
    for (const edge of visibleEdges) {
      const src = getSimNode(edge.sourceId)
      const tgt = getSimNode(edge.targetId)
      strokes.set(edge, ontology.edgeStrokeFor(ontology.resolveEdgeType(edge, src && ontology.valueFor(src), tgt && ontology.valueFor(tgt))))
    }
    return strokes
  }, [visibleEdges, ontology, getSimNode])

  // What the controls offer: only what the post-filter visible set holds
  // (R35, D59) — one function, `presentSetsOf`, that the harness calls too.
  // The pull half is read over the edges the simulation springs (the graph's
  // own, both ends visible), not over the graduated edges it draws (D60).
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

  // The groups as drawn (GRAPH_VIEW.md § Decomposition Group Overlay): the
  // host's, restricted to the visible set and coloured in order. Drives the
  // canvas glow and the host's control.
  const activeGroups = React.useMemo(() => activeGroupsOf(groups ?? [], visibleIds), [groups, visibleIds])

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
  const { visibleMatchIds, hiddenMatchCount } = React.useMemo(() => {
    if (!searchQuery) return { visibleMatchIds: null as Set<string> | null, hiddenMatchCount: 0 }
    const lq = searchQuery.toLowerCase()
    const sim = simRef.current
    if (!sim) return { visibleMatchIds: new Set<string>(), hiddenMatchCount: 0 }

    const visible = new Set<string>()
    let hidden = 0
    for (const node of sim.nodes) {
      if (node.name.toLowerCase().includes(lq)) {
        if (visibleIds.has(node.id)) {
          visible.add(node.id)
        } else {
          hidden++
        }
      }
    }
    return { visibleMatchIds: visible, hiddenMatchCount: hidden }
  }, [searchQuery, visibleIds])

  // Physics loop + filter-driven reheats. Owns the RAF tick (with one-shot
  // initial fit, cross-view center, fps, and stability stop), the hover tooltip
  // re-render tick, and the seed/reheat-on-filter-change effects. It consumes the
  // sim, the visible subgraph, and the camera/selection handles as inputs.
  const { fps } = useSimulationLoop({
    simRef, running, setRunning,
    visibleIds, visibleNodes, downstreamScores,
    filter,
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
  // hover tooltip (now interactive — it carries a "Show in Tree" button)
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
      // this view never learns which axis that was (D59).
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

  // Keyboard navigation. Gated on `active` so the hidden (inactive) view —
  // both views stay mounted for keep-alive — doesn't also handle shortcuts.
  React.useEffect(() => {
    if (!active) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Tab': {
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
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, visibleNodes, focusedNodeId, selectedNodeId, searchActive, searchQuery, onSearchChange, shortcutsOpen, handleFitToView, handleToggleRunning])

  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

  // Graph-view search adornment: the hidden-match "+N" badge.
  const searchExtra = hiddenMatchCount > 0 ? (
    <span className="header-search-badge" title={`${hiddenMatchCount} match${hiddenMatchCount !== 1 ? 'es' : ''} hidden by filters`}>
      +{hiddenMatchCount}
    </span>
  ) : null

  return (
    <div
      className="graph-view"
      ref={containerRef}
      data-theme={theme}
      style={{ ...schemeStyle, ...(toolbarHeight ? { ['--toolbar-height' as string]: `${toolbarHeight}px` } : {}) } as React.CSSProperties}
    >
      {/* Canvas fills the full viewport beneath the floating overlay */}
      <div className="graph-canvas-area">
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
          duplicateGroups={graph.duplicateGroups}
          nodeSummaries={nodeSummaries}
          onShowInTree={onShowInTree}
          onMouseEnter={cancelHoverClear}
          onMouseLeave={() => handleHoverNode(null)}
        />
      </div>

      {/* Floating overlay: shared filter bar (with the error/warning bars) */}
      <div className="graph-overlay">
        {/* Measured wrapper: its height drives where the Groups modal sits, so
            the modal tracks the real toolbar bottom (not a fixed offset). */}
        <div className="graph-toolbar" ref={toolbarRef}>
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
            findings={findings}
          />
        </div>

        {/* Search results dropdown */}
        {visibleMatchIds && visibleMatchIds.size > 0 && searchActive && (
          <div className="graph-search-results">
            {visibleNodes.filter(n => visibleMatchIds.has(n.id)).map(n => (
              <button
                key={n.id}
                className="graph-search-result"
                onClick={() => handleSelectSearchResult(n.id)}
              >
                <span className="graph-search-result-type">{ontology.valueFor(n)}</span>
                <span className="graph-search-result-name">{n.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>{/* /graph-overlay */}

      {/* Bottom-left: node/edge counts (shifts right when the shortcuts panel
          is open so they don't overlap). */}
      <div className={`graph-bottom-left${shortcutsOpen ? ' shifted' : ''}`}>
        <span className="graph-count">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bottom-center: simulation controls + live fps. */}
      <div className="graph-bottom-center">
        <button className="graph-toolbar-btn" onClick={handleFitToView} title="Fit to view (F)">Fit</button>
        <button
          className={`graph-toolbar-btn${themeChoice === 'system' ? '' : ' active'}`}
          onClick={() => onThemeChange(THEME_CHOICES[(THEME_CHOICES.indexOf(themeChoice) + 1) % THEME_CHOICES.length])}
          title={`Colour scheme: ${themeChoice}${themeChoice === 'system' ? ` (${theme})` : ''} — click to change`}
          aria-label="Colour scheme"
        >
          {themeChoice === 'system' ? 'Auto' : themeChoice === 'light' ? 'Light' : 'Dark'}
        </button>
        <button
          className={`graph-toolbar-btn ${running ? 'active' : ''}`}
          onClick={handleToggleRunning}
          title={running ? 'Pause simulation (Space)' : 'Resume simulation (Space)'}
        >
          {running ? 'Pause' : 'Play'}
        </button>
        {/* Always rendered (reserving its width) so toggling Play/Pause never
            shifts the centred cluster; hidden when the simulation is paused. */}
        <span className={`graph-count-fps${running ? '' : ' hidden'}`} title="Simulation frames per second">{fps} fps</span>
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
        <div className="graph-shortcuts-panel">
          <div className="graph-shortcuts-title">
            Keyboard Shortcuts
            <button className="graph-shortcuts-close" onClick={() => setShortcutsOpen(false)}>&times;</button>
          </div>
          <div className="graph-shortcuts-list">
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
  )
}

interface GraphHoverTooltipProps {
  hoveredNodeId: string | null
  simRef: React.RefObject<Simulation | null>
  visibleEdges: GraphEdge[]
  visibleIds: Set<string>
  viewport: Viewport
  shiftHeld: boolean
  duplicateGroups: Map<string, Set<string>>
  nodeSummaries: Map<string, string>
  // Cross-view nav from the tooltip. Absent in history mode (no Tree view).
  onShowInTree?: (target: FocusTarget) => void
  // The tooltip is interactive: these keep it open while the pointer is over
  // it (so the Show in Tree button is clickable).
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, visibleIds, viewport, shiftHeld, duplicateGroups, nodeSummaries, onShowInTree, onMouseEnter, onMouseLeave }: GraphHoverTooltipProps) {
  // Before the early returns: this is a hook, and the component bails out four
  // different ways below.
  const ontology = useOntology()
  if (!hoveredNodeId) return null
  const sim = simRef.current
  if (!sim) return null
  const node = sim.getNode(hoveredNodeId)
  if (!node) return null

  // The context line is the taxonomy's answer (D59, B35): a host that keys a
  // value's identity on its own metadata says so there; the library's
  // default is the parent's name. The icon is the value's own.
  const contextLine = ontology.contextLine(node, node.parentId ? sim.getNode(node.parentId) : undefined)
  const icon = ontology.resolveNodeStyle(node).icon
  const fileName = node.dimensions[SOURCE_FILE_DIMENSION]?.split('/').pop()

  // The composition line for a node that summarises its children (counted
  // per style value, named by its abbreviation). These used to render as a
  // badge under the node; they now live in the box. Degree nodes are covered
  // by the connection counts row below, so we don't duplicate them here.
  const summaryKind = ontology.resolveNodeStyle(node).summaryKind
  const compositionLine =
    summaryKind === 'children'
      ? nodeSummaries.get(hoveredNodeId) || undefined
      : undefined

  // Cardinality line for a parameterized-family representative (issue #100):
  // this one node stands for a family that fans out once per template param.
  // Mirrors the canvas `× {param}` badge. Absent on static nodes.
  const cardinalityLine =
    node.templateParams && node.templateParams.length > 0
      ? node.templateParams.map(p => `× ${p}`).join(' ')
      : undefined

  let outgoing = 0, incoming = 0
  for (const e of visibleEdges) {
    if (isContainment(e)) continue
    if (e.sourceId === hoveredNodeId) outgoing++
    if (e.targetId === hoveredNodeId) incoming++
  }

  // Duplicate-copies indicator: if this definition has more than one
  // node in the graph, show "N copies" so the user knows the highlight
  // they're seeing is intentional ("this is one of several"). Count
  // only sister copies that survive the current filter — a hidden copy
  // isn't a copy from the user's current point of view.
  const sisters = duplicateGroups.get(node.definitionKey)
  const visibleCopies = sisters
    ? Array.from(sisters).filter(id => visibleIds.has(id))
    : [node.id]
  const copyCount = visibleCopies.length
  const copyIndex = copyCount > 1 ? visibleCopies.indexOf(node.id) + 1 : 0

  const [sx, sy] = worldToScreen(viewport, node.x, node.y)

  return (
    <div
      className="graph-hover-tooltip"
      style={{ left: sx, top: sy }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="tooltip-identity">
        {icon && <span className="tooltip-type-icon">{icon}</span>}
        <span className="tooltip-name">{node.name}</span>
      </div>
      {contextLine && <div className="tooltip-parent">{contextLine}</div>}
      {compositionLine && <div className="tooltip-summary">{compositionLine}</div>}
      {cardinalityLine && (
        <div className="tooltip-summary" title="Parameterized family: this node represents one instance per template parameter.">
          {cardinalityLine}
        </div>
      )}
      {fileName && <div className="tooltip-file">{fileName}</div>}
      {copyCount > 1 && (
        <div className="tooltip-duplicates" title="This definition is registered on multiple hosts. Hovering any copy highlights all copies.">
          copy {copyIndex} of {copyCount}
        </div>
      )}
      {(outgoing > 0 || incoming > 0) && (
        <div className="tooltip-connections">
          {outgoing > 0 && <span className="tooltip-conn-out">→{outgoing}</span>}
          {incoming > 0 && <span className="tooltip-conn-in">←{incoming}</span>}
        </div>
      )}
      <div className="tooltip-direction">{shiftHeld ? 'dependents' : 'dependencies'}</div>
      {onShowInTree && (
        <button
          className="tooltip-show-in-tree"
          onClick={() => onShowInTree({ name: node.name, values: node.dimensions })}
          title="Show in Tree view"
        >
          Show in Tree
        </button>
      )}
    </div>
  )
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="graph-shortcut-row">
      <kbd className="graph-shortcut-key">{keys}</kbd>
      <span className="graph-shortcut-desc">{desc}</span>
    </div>
  )
}

