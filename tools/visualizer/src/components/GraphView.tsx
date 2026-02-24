// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, rendering, and interaction.

import React from 'react'
import type { TWFFile, FileError } from '../types/ast'
import type { CrossViewTarget } from './WorkflowCanvas'
import type { ForceParams } from '../graph/simulation'
import { buildGraph } from '../graph/build'
import { Simulation, DEFAULT_PARAMS } from '../graph/simulation'
import type { SimNode } from '../graph/simulation'
import { DEFAULT_VIEWPORT, fitToView } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { getTransitiveDeps, getHighlightedEdgeIds } from '../graph/highlight'
import { GraphCanvas } from './GraphCanvas'
import { LevelSelector } from './LevelSelector'
import type { LevelRange } from './LevelSelector'
import { GraphControlPanel } from './GraphControlPanel'
import type { ForceSection } from './GraphControlPanel'
import { SearchIcon } from './icons/GearIcons'
import { THEME } from '../theme/temporal-theme'

interface GraphViewProps {
  ast: TWFFile
  onShowInTree?: (name: string, defType: string) => void
  pendingNavigation?: CrossViewTarget | null
  onNavigationConsumed?: () => void
}

// Map AST defType to graph node level
function defTypeToLevel(defType: string): 1 | 2 | 3 {
  switch (defType) {
    case 'namespaceDef': return 1
    case 'workerDef': return 2
    default: return 3
  }
}

// Map AST defType to graph nodeType
function defTypeToNodeType(defType: string): string {
  switch (defType) {
    case 'namespaceDef': return 'namespace'
    case 'workerDef': return 'worker'
    case 'workflowDef': return 'workflow'
    case 'activityDef': return 'activity'
    case 'nexusServiceDef': return 'nexusService'
    default: return 'workflow'
  }
}

export function GraphView({ ast, onShowInTree, pendingNavigation, onNavigationConsumed }: GraphViewProps) {
  // --- Core state ---
  const [levelRange, setLevelRange] = React.useState<LevelRange>([1, 2])
  const [viewport, setViewport] = React.useState<Viewport>(DEFAULT_VIEWPORT)
  const [running, setRunning] = React.useState(true)
  const [forceParams, setForceParams] = React.useState<ForceParams>({ ...DEFAULT_PARAMS })
  const simRef = React.useRef<Simulation | null>(null)
  const dragNodeRef = React.useRef<string | null>(null)
  const initialFitDone = React.useRef(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const pendingCenterRef = React.useRef<{ nodeId: string } | null>(null)
  const lastComRef = React.useRef<{ x: number; y: number } | null>(null)

  // --- Interaction state ---
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const [shiftHeld, setShiftHeld] = React.useState(false)

  // --- Force field visualization ---
  const [showForceFields, setShowForceFields] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<ForceSection>(null)
  const [activeChargeLevel, setActiveChargeLevel] = React.useState<number | null>(null)

  // --- Filter state ---
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set())
  const [searchActive, setSearchActive] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  // Build graph from AST
  const graph = React.useMemo(() => buildGraph(ast), [ast])

  // Create or update simulation when graph changes
  React.useEffect(() => {
    simRef.current = new Simulation(graph, forceParams)
    initialFitDone.current = false
    lastComRef.current = null
    setRunning(true)
    setSelectedNodeId(null)
    setHoveredNodeId(null)
    setFocusedIndex(-1)
  }, [graph]) // eslint-disable-line react-hooks/exhaustive-deps

  // Extract all unique source files from graph nodes
  const allFiles = React.useMemo(() => {
    const files = new Set<string>()
    for (const node of graph.nodes.values()) {
      if (node.sourceFile) files.add(node.sourceFile)
    }
    return Array.from(files).sort()
  }, [graph])

  // Stale file cleanup
  React.useEffect(() => {
    const fileSet = new Set(allFiles)
    setSelectedFiles(prev => {
      const pruned = new Set([...prev].filter(f => fileSet.has(f)))
      return pruned.size === prev.size ? prev : pruned
    })
  }, [allFiles])

  // Filter visible nodes and edges by level range + file filter
  const { visibleNodes, visibleEdges, visibleIds } = React.useMemo(() => {
    const sim = simRef.current
    if (!sim) return { visibleNodes: [] as SimNode[], visibleEdges: [], visibleIds: new Set<string>() }

    const [minL, maxL] = levelRange
    const hasFileFilter = selectedFiles.size > 0
    const ids = new Set<string>()
    const vNodes: SimNode[] = []

    for (const node of sim.nodes) {
      if (node.level < minL || node.level > maxL) continue
      if (hasFileFilter && node.sourceFile && !selectedFiles.has(node.sourceFile)) continue
      ids.add(node.id)
      vNodes.push(node)
    }

    const vEdges = sim.edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId))

    return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids }
  }, [levelRange, selectedFiles, graph]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search matches (against all nodes, not just visible)
  const { visibleMatchIds, hiddenMatchCount } = React.useMemo(() => {
    if (!searchQuery) return { visibleMatchIds: null as Set<string> | null, hiddenMatchCount: 0 }
    const lq = searchQuery.toLowerCase()
    const sim = simRef.current
    if (!sim) return { visibleMatchIds: null, hiddenMatchCount: 0 }

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
    return { visibleMatchIds: visible.size > 0 ? visible : null, hiddenMatchCount: hidden }
  }, [searchQuery, visibleIds])

  // Transitive dependency highlighting
  const { highlightedNodes, highlightedEdges } = React.useMemo(() => {
    const activeId = hoveredNodeId ?? selectedNodeId
    if (!activeId || !visibleIds.has(activeId)) {
      return { highlightedNodes: null as Set<string> | null, highlightedEdges: null as Set<string> | null }
    }
    const direction = shiftHeld ? 'upstream' as const : 'downstream' as const
    const nodes = getTransitiveDeps(activeId, visibleEdges, visibleIds, direction)
    const edges = getHighlightedEdgeIds(nodes, visibleEdges)
    return { highlightedNodes: nodes, highlightedEdges: edges }
  }, [hoveredNodeId, selectedNodeId, shiftHeld, visibleEdges, visibleIds])

  // Animation loop
  const [, forceRender] = React.useState(0)

  React.useEffect(() => {
    if (!running) return
    let frameId: number
    const loop = () => {
      const sim = simRef.current
      if (sim) {
        sim.tick(visibleIds)

        // Track center-of-mass drift and compensate viewport
        if (visibleNodes.length > 0 && initialFitDone.current && !pendingCenterRef.current && !selectedNodeId) {
          let comX = 0, comY = 0
          for (const node of visibleNodes) { comX += node.x; comY += node.y }
          comX /= visibleNodes.length; comY /= visibleNodes.length
          const prev = lastComRef.current
          if (prev) {
            const dx = comX - prev.x
            const dy = comY - prev.y
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
              setViewport(vp => ({ ...vp, x: vp.x - dx * vp.scale, y: vp.y - dy * vp.scale }))
            }
          }
          lastComRef.current = { x: comX, y: comY }
        }

        if (!initialFitDone.current && sim.alpha < 0.3) {
          const container = containerRef.current
          if (container) {
            const { width, height } = container.getBoundingClientRect()
            if (width > 0 && height > 0) {
              setViewport(fitToView(visibleNodes, width, height))
              initialFitDone.current = true
              lastComRef.current = null
            }
          }
        }
        // Handle pending cross-view center after warmup
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
          lastComRef.current = null
        }
        if (sim.isStable()) setRunning(false)
      }
      forceRender(c => c + 1)
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [running, visibleIds, visibleNodes, selectedNodeId])

  // Reheat on level range change
  const prevRange = React.useRef(levelRange)
  React.useEffect(() => {
    if (prevRange.current[0] !== levelRange[0] || prevRange.current[1] !== levelRange[1]) {
      const sim = simRef.current
      if (sim) {
        for (const node of sim.nodes) {
          if (node.level >= levelRange[0] && node.level <= levelRange[1]) {
            if (node.level < prevRange.current[0] || node.level > prevRange.current[1]) {
              if (node.parentId) {
                const parent = sim.getNode(node.parentId)
                if (parent) sim.seedAt(node.id, parent.x, parent.y)
              }
            }
          }
        }
        sim.reheat(0.5)
        setRunning(true)
        initialFitDone.current = false
      }
      prevRange.current = levelRange
    }
  }, [levelRange])

  // Propagate force param changes to simulation (no auto-reheat — user controls when to restart)
  const handleParamChange = React.useCallback((key: keyof ForceParams, value: number) => {
    setForceParams(prev => {
      const next = { ...prev, [key]: value }
      simRef.current?.setParams(next)
      return next
    })
  }, [])

  // Node drag handlers
  const handleNodeDragStart = React.useCallback((id: string, wx: number, wy: number) => {
    dragNodeRef.current = id
    simRef.current?.pinNode(id, wx, wy)
    simRef.current?.reheat(0.3)
    setRunning(true)
  }, [])

  const handleNodeDragMove = React.useCallback((wx: number, wy: number) => {
    if (dragNodeRef.current) simRef.current?.pinNode(dragNodeRef.current, wx, wy)
  }, [])

  const handleNodeDragEnd = React.useCallback(() => {
    if (dragNodeRef.current) {
      simRef.current?.unpinNode(dragNodeRef.current)
      dragNodeRef.current = null
    }
  }, [])

  // Double-click node: center and zoom to neighbors
  const handleDoubleClickNode = React.useCallback((id: string) => {
    const sim = simRef.current
    const container = containerRef.current
    if (!sim || !container) return
    const node = sim.getNode(id)
    if (!node) return
    const neighborIds = new Set<string>([id])
    for (const edge of sim.edges) {
      if (edge.sourceId === id) neighborIds.add(edge.targetId)
      if (edge.targetId === id) neighborIds.add(edge.sourceId)
    }
    const neighbors = sim.nodes.filter(n => neighborIds.has(n.id))
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(neighbors, width, height, 80))
  }, [])

  // Fit-to-view
  const handleFitToView = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(visibleNodes, width, height))
  }, [visibleNodes])

  // Toggle simulation
  const handleToggleRunning = React.useCallback(() => {
    if (!running) {
      simRef.current?.reheat(0.5)
      setRunning(true)
    } else {
      setRunning(false)
    }
  }, [running])

  const handleReheat = React.useCallback(() => {
    simRef.current?.reheat(1.0)
    setRunning(true)
  }, [])

  // File filter toggle
  const toggleFile = (file: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  // Search toggle
  const toggleSearch = () => {
    if (searchActive) {
      setSearchActive(false)
      setSearchQuery('')
    } else {
      setSearchActive(true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

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
  const focusedNodeId = focusedIndex >= 0 && focusedIndex < visibleNodes.length
    ? visibleNodes[focusedIndex].id
    : null

  // Cross-view navigation: handle pending navigation from Tree → Graph
  React.useEffect(() => {
    if (!pendingNavigation) return
    const { name, defType } = pendingNavigation

    // Ensure the target level is within the visible range
    const targetLevel = defTypeToLevel(defType)
    setLevelRange(prev => {
      const [minL, maxL] = prev
      if (targetLevel >= minL && targetLevel <= maxL) return prev
      // Expand range to include target level
      return [Math.min(minL, targetLevel), Math.max(maxL, targetLevel)] as LevelRange
    })

    // Ensure the target's source file is visible
    const targetNodeType = defTypeToNodeType(defType)
    const sim = simRef.current
    if (sim) {
      const targetNode = sim.nodes.find(n => n.name === name && n.nodeType === targetNodeType)
      if (targetNode?.sourceFile && selectedFiles.size > 0 && !selectedFiles.has(targetNode.sourceFile)) {
        setSelectedFiles(prev => new Set(prev).add(targetNode.sourceFile!))
      }
      if (targetNode) {
        pendingCenterRef.current = { nodeId: targetNode.id }
        // If simulation is stable, reheat briefly so the animation loop runs to handle centering
        if (!running) {
          simRef.current?.reheat(0.1)
          setRunning(true)
        }
      }
    }

    onNavigationConsumed?.()
  }, [pendingNavigation]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shift key tracking
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

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
            setSearchActive(true)
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
  }, [visibleNodes, focusedNodeId, selectedNodeId, searchActive, shortcutsOpen, handleFitToView, handleToggleRunning])

  // Errors
  const errors = ast.errors || []
  const { shownFileErrors, hiddenFileErrors } = React.useMemo(() => {
    if (selectedFiles.size === 0) return { shownFileErrors: errors, hiddenFileErrors: [] as FileError[] }
    const shown: FileError[] = []
    const hidden: FileError[] = []
    for (const e of errors) {
      if (selectedFiles.has(e.file)) shown.push(e)
      else hidden.push(e)
    }
    return { shownFileErrors: shown, hiddenFileErrors: hidden }
  }, [errors, selectedFiles])

  const hasFiles = allFiles.length > 0
  const hasErrors = errors.length > 0
  const noFilesSelected = selectedFiles.size === 0
  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

  return (
    <div className="graph-view" ref={containerRef}>
      {/* Graph Header: filters + controls */}
      <div className="graph-header">
        <div className="graph-header-left">
          <LevelSelector range={levelRange} onChange={setLevelRange} />

          {hasFiles && (
            <div className="graph-file-chips">
              {allFiles.map(file => {
                const fileName = file.split('/').pop() || file
                const isSelected = selectedFiles.has(file)
                const cls = noFilesSelected
                  ? 'graph-file-chip all-included'
                  : `graph-file-chip ${isSelected ? 'selected' : ''}`
                return (
                  <button key={file} className={cls} onClick={() => toggleFile(file)} title={file}>
                    {fileName}
                  </button>
                )
              })}
            </div>
          )}

          <div className={`graph-search ${searchActive ? 'active' : ''}`}>
            <button className="graph-search-toggle" onClick={toggleSearch} title="Search nodes (/)">
              <SearchIcon size={13} />
            </button>
            {searchActive && (
              <input
                ref={searchInputRef}
                className="graph-search-input"
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
              />
            )}
            {hiddenMatchCount > 0 && (
              <span className="graph-search-badge" title={`${hiddenMatchCount} match${hiddenMatchCount !== 1 ? 'es' : ''} hidden by filters`}>
                +{hiddenMatchCount}
              </span>
            )}
          </div>
        </div>

        <div className="graph-header-info">
          {selectedNodeId && onShowInTree && (() => {
            const node = simRef.current?.getNode(selectedNodeId)
            if (!node) return null
            const defType = node.nodeType === 'namespace' ? 'namespaceDef'
              : node.nodeType === 'worker' ? 'workerDef'
              : node.nodeType === 'activity' ? 'activityDef'
              : node.nodeType === 'nexusService' ? 'nexusServiceDef'
              : 'workflowDef'
            return (
              <button
                className="graph-header-btn"
                onClick={() => onShowInTree(node.name, defType)}
                title="Show in Tree view"
              >
                Show in Tree
              </button>
            )
          })()}
          <span className="graph-header-count">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
          </span>
          <button className="graph-header-btn" onClick={handleFitToView} title="Fit to view (F)">Fit</button>
          <button
            className={`graph-header-btn ${running ? 'active' : ''}`}
            onClick={handleToggleRunning}
            title={running ? 'Pause simulation (Space)' : 'Resume simulation (Space)'}
          >
            {running ? 'Pause' : 'Play'}
          </button>
        </div>
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

      {/* Errors header */}
      {hasErrors && (
        <GraphErrorsHeader shownFileErrors={shownFileErrors} hiddenFileErrors={hiddenFileErrors} />
      )}

      {/* Canvas */}
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
        highlightedNodes={highlightedNodes}
        highlightedEdges={highlightedEdges}
        selectedNodeId={selectedNodeId}
        focusedNodeId={focusedNodeId}
        searchMatchIds={visibleMatchIds}
        running={running}
        showForceFields={showForceFields}
        forceParams={forceParams}
        activeSection={activeSection}
        activeChargeLevel={activeChargeLevel}
      />

      {/* Control panel */}
      <GraphControlPanel
        params={forceParams}
        onParamChange={handleParamChange}
        running={running}
        onToggleRunning={handleToggleRunning}
        onReheat={handleReheat}
        showForceFields={showForceFields}
        onToggleForceFields={() => setShowForceFields(v => !v)}
        onActiveSection={setActiveSection}
        onActiveChargeLevel={setActiveChargeLevel}
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

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="graph-shortcut-row">
      <kbd className="graph-shortcut-key">{keys}</kbd>
      <span className="graph-shortcut-desc">{desc}</span>
    </div>
  )
}

function GraphErrorsHeader({ shownFileErrors, hiddenFileErrors }: {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
}) {
  const [expanded, setExpanded] = React.useState(true)
  const total = shownFileErrors.length + hiddenFileErrors.length

  return (
    <div className="graph-errors-header">
      <div className="graph-errors-bar" onClick={() => setExpanded(!expanded)}>
        <span className="block-toggle">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="graph-errors-icon">{THEME.error.icon}</span>
        <span className="graph-errors-title">
          {total} {total === 1 ? 'error' : 'errors'}
        </span>
      </div>
      {expanded && (
        <div className="graph-errors-body">
          {shownFileErrors.map((err, i) => (
            <div key={`s${i}`} className="graph-error-item">
              <span className="graph-error-file">{err.file.split('/').pop()}</span>
              <pre className="graph-error-msg">{err.stderr || err.error}</pre>
            </div>
          ))}
          {hiddenFileErrors.length > 0 && (
            <div className="graph-error-hidden-label">
              {hiddenFileErrors.length} error{hiddenFileErrors.length !== 1 ? 's' : ''} in hidden files
            </div>
          )}
        </div>
      )}
    </div>
  )
}
