// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, rendering, and interaction.

import React from 'react'
import type { TWFFile } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import type { CrossViewTarget } from './WorkflowCanvas'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import type { Simulation } from '../graph/simulation'
import { nodeTypeToDefType, defTypeToNodeType } from './graph-view/nodeDefType'
import { definitionFor, DEFAULT_NODE_SCALE, type NodeScaleParams } from '../graph/node-types'
import { worldToScreen } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { GraphCanvas } from './GraphCanvas'
import { GraphControlPanel } from './GraphControlPanel'
import { FilterBar } from './FilterBar'
import { DEF_TYPE_CONFIGS } from '../theme/temporal-theme'
import { useGraphModel } from './graph-view/useGraphModel'
import { useViewport } from './graph-view/useViewport'
import { useHighlight } from './graph-view/useHighlight'
import { useSimulation } from './graph-view/useSimulation'
import { useVisibleGraph } from './graph-view/useVisibleGraph'
import { useSimulationLoop } from './graph-view/useSimulationLoop'

interface GraphViewProps {
  // Whether this view is the active tab. Both views stay mounted (keep-alive),
  // so the inactive one must not respond to global keyboard shortcuts.
  active: boolean
  ast: TWFFile
  // Deployment graph from `twf graph` — primary input. AST is secondary
  // (sourceFile lookup, hover details). See visualizer/REVISIONS_003.
  parserGraph: ParserGraph
  onShowInTree?: (name: string, defType: string) => void
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  pins: PinState
  onPinsChange: (next: PinState) => void
  searchQuery: string
  searchActive: boolean
  onSearchChange: (query: string, active: boolean) => void
  pendingFocus: CrossViewTarget | null
  onFocusConsumed: () => void
  overriddenPins: Set<FilterDimension>
  onOverriddenPinsConsumed: () => void
}

// Graph-view filter entries — imported from temporal-theme.tsx so the Tree and
// Graph views always show the same chip layout. See VIEW_FILTER_ENTRIES.

export function GraphView({
  active,
  ast,
  parserGraph,
  onShowInTree,
  filter,
  onFilterChange,
  pins,
  onPinsChange,
  searchQuery,
  searchActive,
  onSearchChange,
  pendingFocus,
  onFocusConsumed,
  overriddenPins,
  onOverriddenPinsConsumed,
}: GraphViewProps) {
  // Filter state is now driven by props from WorkflowCanvas (spec § Filter
  // State Model). Read the two structural dimensions through `filter`.
  const visibleTypes = filter.visibleTypes
  const selectedFiles = filter.selectedFiles

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

  // Pure data layer (graph build, file list, filter-change flash, diagnostics
  // partition) — everything derived straight from props, no sim/DOM.
  const {
    graph,
    allFiles,
    recentlyChanged,
    errors,
    diagnostics,
  } = useGraphModel(ast, parserGraph, filter)

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
    onGravityChange: handleGravityChange,
    onNodeDragStart: handleNodeDragStart,
    onNodeDragMove: handleNodeDragMove,
    onNodeDragEnd: handleNodeDragEnd,
    onToggleRunning: handleToggleRunning,
  } = useSimulation(graph, onSimRebuild)

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

  // Stale-file cleanup is now owned by WorkflowCanvas (it touches both views'
  // filters consistently when the AST changes).

  // Visible subgraph derived from the live sim (filter + edge graduation +
  // summaries + downstream-depth scores), recomputed on filter / sim-rebuild.
  const { visibleNodes, visibleEdges, visibleIds, nodeSummaries, downstreamScores } =
    useVisibleGraph(simRef, simVersion, visibleTypes, selectedFiles)

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
    activeChargeType, setActiveChargeType,
    activeGravityType, setActiveGravityType,
    activePullEdge, setActivePullEdge,
  } = useHighlight(visibleNodes, visibleEdges, visibleIds, getSimNode, graph)

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
    visibleTypes, selectedFiles,
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
  // Cross-view focus: the reconciler in WorkflowCanvas has already
  // expanded the destination filter so the target is visible. We only
  // arrange the visual focus part — set up the center-on-target ref
  // and reheat the simulation if it had stabilized.
  React.useEffect(() => {
    if (!pendingFocus) return
    const { name, defType } = pendingFocus
    const targetNodeType = defTypeToNodeType(defType)
    const sim = simRef.current
    if (sim) {
      const targetNode = sim.nodes.find(n => n.name === name && n.nodeType === targetNodeType)
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
    <div className="graph-view" ref={containerRef}>
      {/* Canvas fills the full viewport beneath the floating overlay */}
      <div className="graph-canvas-area">
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
          activeSection={activeSection}
          activeChargeType={activeChargeType}
          activeGravityType={activeGravityType}
          activePullEdge={activePullEdge}
          nodeScale={nodeScale}
        />
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
        <FilterBar
          ast={ast}
          allFiles={allFiles}
          filter={filter}
          onFilterChange={onFilterChange}
          pins={pins}
          onPinsChange={onPinsChange}
          overriddenPins={overriddenPins}
          recentlyChanged={recentlyChanged}
          searchQuery={searchQuery}
          searchActive={searchActive}
          onSearchChange={onSearchChange}
          searchInputRef={searchInputRef}
          searchTitle="Search nodes (/)"
          searchPlaceholder="Search nodes..."
          searchExtra={searchExtra}
          errors={errors}
          diagnostics={diagnostics}
        />

        {/* Search results dropdown */}
        {visibleMatchIds && visibleMatchIds.size > 0 && searchActive && (
          <div className="graph-search-results">
            {visibleNodes.filter(n => visibleMatchIds.has(n.id)).map(n => (
              <button
                key={n.id}
                className="graph-search-result"
                onClick={() => handleSelectSearchResult(n.id)}
              >
                <span className="graph-search-result-type">{n.nodeType}</span>
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
        onParamChange={handleParamChange}
        onAdjust={handleForceAdjust}
        onGravityChange={handleGravityChange}
        onActiveSection={setActiveSection}
        onActiveChargeType={setActiveChargeType}
        onActiveGravityType={setActiveGravityType}
        onActivePullEdge={setActivePullEdge}
        nodeScale={nodeScale}
        onNodeScaleChange={handleNodeScaleChange}
      />

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
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[]
  visibleIds: Set<string>
  viewport: Viewport
  shiftHeld: boolean
  duplicateGroups: Map<string, Set<string>>
  nodeSummaries: Map<string, string>
  // Cross-view nav from the tooltip. Absent in history mode (no Tree view).
  onShowInTree?: (name: string, defType: string) => void
  // The tooltip is interactive: these keep it open while the pointer is over
  // it (so the Show in Tree button is clickable).
  onMouseEnter: () => void
  onMouseLeave: () => void
}

// Strip the kind prefix from a parser metadata field (e.g. 'namespace:ecommerce'
// → 'ecommerce', 'worker:paymentWorker' → 'paymentWorker'). The parser includes
// the kind label so consumers can identify the type of the referenced entity;
// tooltips want the bare name.
function stripKindPrefix(s: string | undefined): string | undefined {
  if (!s) return undefined
  const i = s.indexOf(':')
  return i >= 0 ? s.slice(i + 1) : s
}

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, visibleIds, viewport, shiftHeld, duplicateGroups, nodeSummaries, onShowInTree, onMouseEnter, onMouseLeave }: GraphHoverTooltipProps) {
  if (!hoveredNodeId) return null
  const sim = simRef.current
  if (!sim) return null
  const node = sim.getNode(hoveredNodeId)
  if (!node) return null

  const parentName = node.parentId ? sim.getNode(node.parentId)?.name : undefined
  // Context line — format varies by node type to surface the most useful
  // parent context. Nexus types show their addressing metadata in the
  // `<parent context> · <task queue>` format from the spec.
  let contextLine: string | undefined
  switch (node.nodeType) {
    case 'nexusEndpoint':
      // Namespace is the endpoint's containment parent (parentName), not a
      // node field; queue is intrinsic display metadata.
      contextLine = [parentName, node.queue].filter(Boolean).join(' · ') || undefined
      break
    case 'nexusService':
      contextLine = [stripKindPrefix(node.worker), node.queue].filter(Boolean).join(' · ') || undefined
      break
    case 'nexusOperation':
      contextLine = [parentName, stripKindPrefix(node.worker), node.queue].filter(Boolean).join(' · ') || undefined
      break
    default:
      contextLine = parentName
  }
  // Use the individual DEF_TYPE_CONFIGS entry for the tooltip icon — the
  // per-type icon (★ for service, ☆ for operation, ⌖ for endpoint) is
  // more informative than the group chip icon. DEF_TYPE_CONFIGS still has
  // all 7 entries even though 3 are collapsed into one chip in the filter bar.
  const cfg = DEF_TYPE_CONFIGS.find(c => c.type === nodeTypeToDefType(node.nodeType))
  const fileName = node.sourceFile?.split('/').pop()

  // Composition counts for container/host nodes (e.g. "3 workers · 1 endpoint"
  // on a namespace, "3wf · 1act" on a worker, "2 ops" on a nexus service).
  // These used to render as a badge under the node; they now live in the box.
  // Degree nodes (workflow/activity/operation) are covered by the connection
  // counts row below, so we don't duplicate them here.
  const summaryKind = definitionFor(node.nodeType).summaryKind
  const compositionLine =
    summaryKind === 'containerCount' || summaryKind === 'hostRegistrations'
      ? nodeSummaries.get(hoveredNodeId) || undefined
      : undefined

  let outgoing = 0, incoming = 0
  for (const e of visibleEdges) {
    if (e.edgeType === 'containment') continue
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
        {cfg && <span className="tooltip-type-icon">{cfg.icon}</span>}
        <span className="tooltip-name">{node.name}</span>
      </div>
      {contextLine && <div className="tooltip-parent">{contextLine}</div>}
      {compositionLine && <div className="tooltip-summary">{compositionLine}</div>}
      {fileName && <div className="tooltip-file">{fileName}</div>}
      {copyCount > 1 && (
        <div className="tooltip-duplicates" title="This definition is registered on multiple workers. Hovering any copy highlights all copies.">
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
          onClick={() => onShowInTree(node.name, nodeTypeToDefType(node.nodeType))}
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

