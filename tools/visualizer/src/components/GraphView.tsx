// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, rendering, and interaction.

import React from 'react'
import type { TWFFile, FileError, Diagnostic } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import type { CrossViewTarget } from './WorkflowCanvas'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import type { Simulation } from '../graph/simulation'
import { nodeTypeToDefType, defTypeToNodeType } from './graph-view/nodeDefType'
import { fitToView, worldToScreen } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { GraphCanvas } from './GraphCanvas'
import { GraphControlPanel } from './GraphControlPanel'
import { PinToggle } from './PinToggle'
import { GraphContextMenu, type ContextMenuItem } from './GraphContextMenu'
import { SearchIcon } from './icons/GearIcons'
import { DEF_TYPE_CONFIGS, VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'
import { useGraphModel } from './graph-view/useGraphModel'
import { useViewport } from './graph-view/useViewport'
import { useHighlight } from './graph-view/useHighlight'
import { useSimulation } from './graph-view/useSimulation'
import { useVisibleGraph } from './graph-view/useVisibleGraph'

interface GraphViewProps {
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
  // Frame-rate indicator for debugging. Updated ~2×/sec from the physics loop.
  const [fps, setFps] = React.useState(0)
  const fpsTrackRef = React.useRef({ frames: 0, lastStamp: 0 })
  // The simulation instance + its handlers are owned by useSimulation, called
  // below once `graph` (from useGraphModel) is available.

  // Interaction / highlight state (hover, selection, keyboard focus, shift, and
  // the control-panel preview) is owned by useHighlight, called below once the
  // visible subgraph it derives from is available.

  // --- Search ---
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  // --- Right-click context menu ---
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; nodeId: string } | null>(null)

  // Pure data layer (graph build, file list, filter-change flash, diagnostics
  // partition) — everything derived straight from props, no sim/DOM.
  const {
    graph,
    allFiles,
    recentlyChanged,
    errors,
    diagnostics,
    shownFileErrors,
    hiddenFileErrors,
    shownDiagnostics,
    hiddenDiagnostics,
  } = useGraphModel(ast, parserGraph, filter)

  // Reset camera/fps coordination on each sim rebuild. Held by useSimulation
  // and invoked from its build effect (selection reset is owned by useHighlight,
  // keyed on `graph`).
  const onSimRebuild = React.useCallback(() => {
    initialFitDone.current = false
    fpsTrackRef.current = { frames: 0, lastStamp: 0 }
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
    onReheat: handleReheat,
  } = useSimulation(graph, onSimRebuild)

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

  // Physics animation loop.
  //
  // Decoupled from React rendering: the canvas has its own requestAnimationFrame
  // draw loop that reads live SimNode.x/.y through a ref, so the physics tick does
  // NOT need to trigger a React re-render each frame. We only touch React state
  // for one-shot events (initial fit, pending cross-view center, stability, FPS).
  // Hierarchical gravity (X anchor + per-type Y bands) keeps world coordinates
  // stable, so we no longer compensate for COM drift on the canvas side.
  React.useEffect(() => {
    if (!running) return
    let frameId = 0

    const loop = () => {
      const sim = simRef.current
      if (!sim) return

      sim.tick(visibleIds, downstreamScores)

      // Initial fit — once per sim instance, after warmup. With hierarchical
      // gravity the world coordinates are anchored, so a one-shot fit is all
      // we need; the graph won't drift out of frame as the simulation runs.
      if (!initialFitDone.current && sim.alpha < 0.3) {
        const container = containerRef.current
        if (container) {
          const { width, height } = container.getBoundingClientRect()
          if (width > 0 && height > 0) {
            setViewport(fitToView(visibleNodes, width, height))
            initialFitDone.current = true
          }
        }
      }

      // Cross-view navigation: center on target after warmup.
      if (initialFitDone.current && pendingCenterRef.current) {
        const targetNode = sim.getNode(pendingCenterRef.current.nodeId)
        if (targetNode) {
          const container = containerRef.current
          if (container) {
            const { width, height } = container.getBoundingClientRect()
            setViewport(prev => ({
              scale: Math.max(prev.scale, 1.2),
              x: width / 2 - targetNode.x * Math.max(prev.scale, 1.2),
              y: height / 2 - targetNode.y * Math.max(prev.scale, 1.2),
            }))
            setSelectedNodeId(targetNode.id)
          }
        }
        pendingCenterRef.current = null
      }

      // FPS meter — recompute ~2×/sec. setFps only fires on change, so this
      // is the only routine state update from the loop in steady state.
      const now = performance.now()
      const track = fpsTrackRef.current
      track.frames++
      if (track.lastStamp === 0) track.lastStamp = now
      const elapsed = now - track.lastStamp
      if (elapsed >= 500) {
        const measured = Math.round((track.frames * 1000) / elapsed)
        setFps(prev => (prev === measured ? prev : measured))
        track.frames = 0
        track.lastStamp = now
      }

      if (sim.isStable()) {
        setRunning(false)
        return
      }

      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => { if (frameId) cancelAnimationFrame(frameId) }
  }, [running, visibleIds, visibleNodes, selectedNodeId])

  // While hovering a node during a running simulation, re-render at ~10fps so
  // the DOM tooltip tracks the moving node. (Canvas nodes update at 60fps via
  // mutable refs; the tooltip is a React-rendered DOM element that reads
  // node.x/.y at render time.)
  const [, setTooltipTick] = React.useState(0)
  React.useEffect(() => {
    if (!running || !hoveredNodeId) return
    const id = window.setInterval(() => setTooltipTick(t => t + 1), 100)
    return () => window.clearInterval(id)
  }, [running, hoveredNodeId])

  // Seed newly visible nodes at their nearest visible ancestor, then reheat
  const prevVisibleTypes = React.useRef(visibleTypes)
  React.useEffect(() => {
    const prev = prevVisibleTypes.current
    if (prev === visibleTypes) return
    const sim = simRef.current
    if (sim) {
      // Find nodes that just became visible
      for (const node of sim.nodes) {
        const defType = nodeTypeToDefType(node.nodeType)
        if (visibleTypes.has(defType) && !prev.has(defType)) {
          // Seed at nearest visible ancestor
          let ancestorId = node.parentId
          while (ancestorId) {
            const ancestor = sim.getNode(ancestorId)
            if (!ancestor) break
            if (visibleTypes.has(nodeTypeToDefType(ancestor.nodeType))) {
              sim.seedAt(node.id, ancestor.x, ancestor.y)
              break
            }
            ancestorId = ancestor.parentId
          }
        }
      }
      sim.reheat(0.5)
      setRunning(true)
      initialFitDone.current = false
    }
    prevVisibleTypes.current = visibleTypes
  }, [visibleTypes])

  // Reheat when the file filter changes — gives the user visible motion
  // confirming the change registered, and lets the now-visible /
  // newly-hidden subset settle into a layout that reflects the new
  // node population. Unlike type changes, we don't ancestor-seed (files
  // aren't structural containers in the graph) and we don't refit the
  // viewport (the user's pan/zoom should survive a file filter toggle).
  const prevSelectedFiles = React.useRef(selectedFiles)
  React.useEffect(() => {
    const prev = prevSelectedFiles.current
    if (prev === selectedFiles) return
    const sim = simRef.current
    if (sim) {
      sim.reheat(0.3)
      setRunning(true)
    }
    prevSelectedFiles.current = selectedFiles
  }, [selectedFiles])

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

  // Type group toggle — turns all types in the group on together, or off
  // together. If any member is currently on, the whole group turns off;
  // if all are off, the whole group turns on.
  const toggleTypeGroup = (types: string[]) => {
    const anyOn = types.some(t => filter.visibleTypes.has(t))
    const next = new Set(filter.visibleTypes)
    if (anyOn) {
      for (const t of types) next.delete(t)
    } else {
      for (const t of types) next.add(t)
    }
    onFilterChange({ ...filter, visibleTypes: next })
  }

  // File filter toggle
  const toggleFile = (file: string) => {
    const next = new Set(filter.selectedFiles)
    if (next.has(file)) next.delete(file)
    else next.add(file)
    onFilterChange({ ...filter, selectedFiles: next })
  }

  // Search toggle — emits to canvas. Search query is globally shared so
  // clearing it on close affects both views (intentional: closing the
  // search bar means "no active search anywhere").
  const toggleSearch = () => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  // Pin togglers — emit the new PinState up.
  const togglePinFiles = () => onPinsChange({ ...pins, files: !pins.files })
  const togglePinTypes = () => onPinsChange({ ...pins, types: !pins.types })

  // Right-click on a canvas node — open the context menu at the cursor.
  const handleNodeContextMenu = React.useCallback((nodeId: string, clientX: number, clientY: number) => {
    setContextMenu({ x: clientX, y: clientY, nodeId })
  }, [])

  const closeContextMenu = React.useCallback(() => setContextMenu(null), [])

  // Build the menu items dynamically from the right-clicked node.
  const contextMenuItems = React.useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu || !onShowInTree) return []
    const node = simRef.current?.getNode(contextMenu.nodeId)
    if (!node) return []
    return [{
      label: 'Show in Tree',
      onClick: () => onShowInTree(node.name, nodeTypeToDefType(node.nodeType)),
    }]
  }, [contextMenu, onShowInTree])

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

  // Keyboard navigation
  React.useEffect(() => {
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
  }, [visibleNodes, focusedNodeId, selectedNodeId, searchActive, searchQuery, onSearchChange, shortcutsOpen, handleFitToView, handleToggleRunning])

  const hasFiles = allFiles.length > 0
  const hasHeaderContent = errors.length > 0 || diagnostics.length > 0
  const noFilesSelected = selectedFiles.size === 0
  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

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
          onHoverNode={setHoveredNodeId}
          onSelectNode={setSelectedNodeId}
          onNodeContextMenu={handleNodeContextMenu}
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
          nodeSummaries={nodeSummaries}
        />
        <GraphHoverTooltip
          hoveredNodeId={hoveredNodeId}
          simRef={simRef}
          visibleEdges={visibleEdges}
          visibleIds={visibleIds}
          viewport={viewport}
          shiftHeld={shiftHeld}
          duplicateGroups={graph.duplicateGroups}
        />
      </div>

      {/* Floating overlay: filter bar + toolbar + errors header */}
      <div className="graph-overlay">
      {/* Shared Filter Bar — identical structure to Tree View */}
      <div className="canvas-header">
        {hasFiles && (
          <>
            <div className={`header-files-section${pins.files ? ' section-pinned' : ''}`}>
              <div className="header-files-row">
                {allFiles.map(file => {
                  const fileName = file.split('/').pop() || file
                  const isSelected = selectedFiles.has(file)
                  const isChanged = recentlyChanged.has(`file:${file}`)
                  const chipClass = [
                    'header-file-tag',
                    noFilesSelected ? 'all-included' : (isSelected ? 'selected' : ''),
                    isChanged ? 'recently-changed' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button key={file} className={chipClass} onClick={() => toggleFile(file)} title={file}>
                      <span className="header-file-icon">📄</span>
                      <span className="header-file-name">{fileName}</span>
                    </button>
                  )
                })}
              </div>
              <PinToggle
                pinned={pins.files}
                onClick={togglePinFiles}
                flashing={overriddenPins.has('files')}
                label="Files"
              />
            </div>
            <div className="header-divider" />
          </>
        )}

        <div className={`header-types-section${pins.types ? ' section-pinned' : ''}`}>
          <div className="header-types-row">
            {VIEW_FILTER_ENTRIES.map(entry => {
              const isActive = entry.types.some(t => visibleTypes.has(t))
              const isChanged = entry.types.some(t => recentlyChanged.has(`type:${t}`))
              const cls = [
                'header-type-tag',
                isActive ? 'active' : '',
                `header-type-${entry.id}`,
                isChanged ? 'recently-changed' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={entry.id}
                  className={cls}
                  onClick={() => toggleTypeGroup([...entry.types])}
                  title={isActive ? `Hide ${entry.label.toLowerCase()}` : `Show ${entry.label.toLowerCase()}`}
                >
                  <span className="header-type-icon">{entry.icon}</span>
                  <span className="header-type-label">{entry.label}</span>
                </button>
              )
            })}
          </div>
          <PinToggle
            pinned={pins.types}
            onClick={togglePinTypes}
            flashing={overriddenPins.has('types')}
            label="Types"
          />
        </div>

        <div className="header-divider" />

        <div className="header-controls-section">
          <div className={`header-search ${searchActive ? 'active' : ''}`}>
            <button className="header-search-toggle" onClick={toggleSearch} title="Search nodes (/)">
              <SearchIcon size={14} />
            </button>
            {searchActive && (
              <input
                ref={searchInputRef}
                className="header-search-input"
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value, true)}
                onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
              />
            )}
            {hiddenMatchCount > 0 && (
              <span className="header-search-badge" title={`${hiddenMatchCount} match${hiddenMatchCount !== 1 ? 'es' : ''} hidden by filters`}>
                +{hiddenMatchCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Graph Toolbar — view-specific controls */}
      <div className="graph-toolbar">
        <span className="graph-toolbar-count">
          {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
          {running && <span className="graph-toolbar-fps" title="Simulation frames per second">  ·  {fps} fps</span>}
        </span>
        {selectedNodeId && onShowInTree && (() => {
          const node = simRef.current?.getNode(selectedNodeId)
          if (!node) return null
          return (
            <button
              className="graph-toolbar-btn"
              onClick={() => onShowInTree(node.name, nodeTypeToDefType(node.nodeType))}
              title="Show in Tree view"
            >
              Show in Tree
            </button>
          )
        })()}
        <button className="graph-toolbar-btn" onClick={handleFitToView} title="Fit to view (F)">Fit</button>
        <button
          className={`graph-toolbar-btn ${running ? 'active' : ''}`}
          onClick={handleToggleRunning}
          title={running ? 'Pause simulation (Space)' : 'Resume simulation (Space)'}
        >
          {running ? 'Pause' : 'Play'}
        </button>
        <button className="graph-toolbar-btn" onClick={handleReheat} title="Reheat the simulation (strong)">Reheat</button>
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
              <span className="graph-search-result-type">{n.nodeType}</span>
              <span className="graph-search-result-name">{n.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Errors header — last element inside the floating overlay */}
      {hasHeaderContent && (
        <GraphErrorsHeader
          shownFileErrors={shownFileErrors}
          hiddenFileErrors={hiddenFileErrors}
          shownDiagnostics={shownDiagnostics}
          hiddenDiagnostics={hiddenDiagnostics}
        />
      )}
      </div>{/* /graph-overlay */}

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
      />

      {/* Right-click context menu */}
      {contextMenu && contextMenuItems.length > 0 && (
        <GraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}

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

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, visibleIds, viewport, shiftHeld, duplicateGroups }: GraphHoverTooltipProps) {
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
      contextLine = [stripKindPrefix(node.namespace), node.queue].filter(Boolean).join(' · ') || undefined
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
    <div className="graph-hover-tooltip" style={{ left: sx, top: sy }}>
      <div className="tooltip-identity">
        {cfg && <span className="tooltip-type-icon">{cfg.icon}</span>}
        <span className="tooltip-name">{node.name}</span>
      </div>
      {contextLine && <div className="tooltip-parent">{contextLine}</div>}
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

/**
 * Floating-overlay variant of the errors header used by the Graph view.
 * Renders both kinds of finding side-by-side:
 *   - FileError (catastrophic parser-process failures)
 *   - Diagnostic (structured validator/resolver/parse output) with
 *     severity-aware glyphs and code chips.
 *
 * Layout is more compact than the tree-view header — the overlay is
 * size-constrained (max-height: 30vh) and shares vertical space with
 * the filter bar and toolbar. Body items render inline; the
 * shown/hidden split appears as an in-body label between groups,
 * not as separate ErrorGroup containers.
 */
function GraphErrorsHeader({
  shownFileErrors, hiddenFileErrors,
  shownDiagnostics, hiddenDiagnostics,
}: {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}) {
  const [expanded, setExpanded] = React.useState(true)

  const allDiagnostics = [...shownDiagnostics, ...hiddenDiagnostics]
  const diagErrors = allDiagnostics.filter(d => d.severity === 'error').length
  const diagWarnings = allDiagnostics.filter(d => d.severity === 'warning').length
  const errorCount = shownFileErrors.length + hiddenFileErrors.length + diagErrors
  const warningCount = diagWarnings
  const headerSeverity: 'error' | 'warning' = errorCount > 0 ? 'error' : 'warning'
  const headerIcon = headerSeverity === 'error' ? '\u2717' : '\u26A0'

  const countParts: string[] = []
  if (errorCount > 0) countParts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`)
  if (warningCount > 0) countParts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`)
  const countText = countParts.join(', ')

  const shownTotal = shownFileErrors.length + shownDiagnostics.length
  const hiddenTotal = hiddenFileErrors.length + hiddenDiagnostics.length

  const shownErrDiags = shownDiagnostics.filter(d => d.severity === 'error')
  const shownWarnDiags = shownDiagnostics.filter(d => d.severity === 'warning')
  const hiddenErrDiags = hiddenDiagnostics.filter(d => d.severity === 'error')
  const hiddenWarnDiags = hiddenDiagnostics.filter(d => d.severity === 'warning')

  return (
    <div className={`graph-errors-header${headerSeverity === 'warning' ? ' severity-warnings-only' : ''}`}>
      <div className="graph-errors-bar" onClick={() => setExpanded(!expanded)}>
        <span className="block-toggle">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="graph-errors-icon">{headerIcon}</span>
        <span className="graph-errors-title">{countText}</span>
      </div>
      {expanded && (
        <div className="graph-errors-body">
          {shownTotal > 0 && hiddenTotal > 0 && (
            <div className="error-group-label">Shown files ({shownTotal})</div>
          )}
          {shownFileErrors.map((err, i) => (
            <div key={`sfe${i}`} className="graph-error-item">
              <span className="graph-error-file">{err.file.split('/').pop()}</span>
              <pre className="graph-error-msg">{err.stderr || err.error}</pre>
            </div>
          ))}
          {shownErrDiags.map((d, i) => (
            <GraphDiagnosticRow key={`sed${i}`} diagnostic={d} />
          ))}
          {shownWarnDiags.map((d, i) => (
            <GraphDiagnosticRow key={`swd${i}`} diagnostic={d} />
          ))}
          {hiddenTotal > 0 && (
            <>
              <div className="error-group-label">Hidden files ({hiddenTotal})</div>
              {hiddenFileErrors.map((err, i) => (
                <div key={`hfe${i}`} className="graph-error-item">
                  <span className="graph-error-file">{err.file.split('/').pop()}</span>
                  <pre className="graph-error-msg">{err.stderr || err.error}</pre>
                </div>
              ))}
              {hiddenErrDiags.map((d, i) => (
                <GraphDiagnosticRow key={`hed${i}`} diagnostic={d} />
              ))}
              {hiddenWarnDiags.map((d, i) => (
                <GraphDiagnosticRow key={`hwd${i}`} diagnostic={d} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GraphDiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  const glyph = diagnostic.severity === 'error' ? '\u2717' : '\u26A0'
  const fileName = diagnostic.file ? diagnostic.file.split('/').pop() : undefined
  const loc = fileName
    ? `${fileName}:${diagnostic.start.line}:${diagnostic.start.column}`
    : undefined
  return (
    <div className={`graph-diagnostic-item diagnostic-item severity-${diagnostic.severity}`}>
      <span className="diagnostic-glyph" aria-hidden="true">{glyph}</span>
      <span className="diagnostic-code">{diagnostic.code}</span>
      <span className="diagnostic-message">{diagnostic.message}</span>
      {loc && <span className="diagnostic-location">{loc}</span>}
    </div>
  )
}
