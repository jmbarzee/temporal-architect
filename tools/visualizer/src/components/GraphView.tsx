// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, rendering, and interaction.

import React from 'react'
import type { TWFFile, FileError } from '../types/ast'
import type { CrossViewTarget } from './WorkflowCanvas'
import type { ForceParams } from '../graph/simulation'
import { buildGraph } from '../graph/build'
import { Simulation, DEFAULT_PARAMS } from '../graph/simulation'
import type { SimNode } from '../graph/simulation'
import { DEFAULT_VIEWPORT, fitToView, worldToScreen } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { zoomAt } from '../graph/viewport'
import { getTransitiveDeps, getHighlightedEdgeIds } from '../graph/highlight'
import { GraphCanvas } from './GraphCanvas'
import { GraphControlPanel } from './GraphControlPanel'
import type { ForceSection } from './GraphControlPanel'
import { SearchIcon } from './icons/GearIcons'
import { THEME, DEF_TYPE_CONFIGS } from '../theme/temporal-theme'

interface GraphViewProps {
  ast: TWFFile
  onShowInTree?: (name: string, defType: string) => void
  pendingNavigation?: CrossViewTarget | null
  onNavigationConsumed?: () => void
}

// Map graph nodeType to AST defType (for visibility filter)
function nodeTypeToDefType(nodeType: string): string {
  switch (nodeType) {
    case 'namespace': return 'namespaceDef'
    case 'worker': return 'workerDef'
    case 'workflow': return 'workflowDef'
    case 'activity': return 'activityDef'
    case 'nexusService': return 'nexusServiceDef'
    default: return 'workflowDef'
  }
}

// Walk parentId chain to find nearest ancestor that is in visibleIds
function findNearestVisibleAncestor(
  nodeId: string,
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined
): string | null {
  const node = getNode(nodeId)
  if (!node) return null
  let id: string | undefined = node.parentId
  while (id) {
    if (visibleIds.has(id)) return id
    const parent = getNode(id)
    id = parent?.parentId
  }
  return null
}

// Compute a glanceable summary string for a graph node from the visible edge set
function computeGraphNodeSummary(
  node: SimNode,
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[],
  nodeMap: Map<string, SimNode>
): string {
  if (node.level === 1) {
    const count = visibleEdges.filter(e => e.edgeType === 'containment' && e.targetId === node.id).length
    return count > 0 ? `${count} worker${count !== 1 ? 's' : ''}` : ''
  } else if (node.level === 2) {
    let wf = 0, act = 0, nxs = 0
    for (const e of visibleEdges) {
      if (e.edgeType !== 'containment' || e.targetId !== node.id) continue
      const child = nodeMap.get(e.sourceId)
      if (!child) continue
      if (child.nodeType === 'workflow') wf++
      else if (child.nodeType === 'activity') act++
      else if (child.nodeType === 'nexusService') nxs++
    }
    const parts: string[] = []
    if (wf > 0) parts.push(`${wf}wf`)
    if (act > 0) parts.push(`${act}act`)
    if (nxs > 0) parts.push(`${nxs}nxs`)
    return parts.join(' · ')
  } else {
    let out = 0, inc = 0
    for (const e of visibleEdges) {
      if (e.edgeType === 'containment') continue
      if (e.sourceId === node.id) out++
      if (e.targetId === node.id) inc++
    }
    const parts: string[] = []
    if (out > 0) parts.push(`→${out}`)
    if (inc > 0) parts.push(`←${inc}`)
    return parts.join(' ')
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
  const [visibleTypes, setVisibleTypes] = React.useState<Set<string>>(
    new Set(DEF_TYPE_CONFIGS.filter(c => c.defaultOn).map(c => c.type))
  )
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

  // Filter visible nodes by type toggles + file filter
  const { visibleNodes, visibleEdges, visibleIds, nodeSummaries } = React.useMemo(() => {
    const sim = simRef.current
    if (!sim) return { visibleNodes: [] as SimNode[], visibleEdges: [], visibleIds: new Set<string>(), nodeSummaries: new Map<string, string>() }

    const hasFileFilter = selectedFiles.size > 0
    const ids = new Set<string>()
    const vNodes: SimNode[] = []

    for (const node of sim.nodes) {
      if (!visibleTypes.has(nodeTypeToDefType(node.nodeType))) continue
      if (hasFileFilter && node.sourceFile && !selectedFiles.has(node.sourceFile)) continue
      ids.add(node.id)
      vNodes.push(node)
    }

    // Graduate edges across hidden types.
    // Containment: if child visible but parent hidden, walk up to nearest visible ancestor.
    // Dependency: if either endpoint hidden, project to nearest visible ancestor; deduplicate.
    const getNode = (id: string) => sim.getNode(id)
    const graduatedEdges: typeof sim.edges = []
    const depEdgeKeys = new Map<string, (typeof sim.edges)[0]>()

    for (const edge of sim.edges) {
      const srcVisible = ids.has(edge.sourceId)
      const tgtVisible = ids.has(edge.targetId)

      if (edge.edgeType === 'containment') {
        if (!srcVisible) continue  // hidden child — drop
        if (tgtVisible) {
          graduatedEdges.push(edge)  // both visible — keep as-is
        } else {
          // parent hidden — walk up to nearest visible ancestor
          const ancestor = findNearestVisibleAncestor(edge.targetId, ids, getNode)
          if (ancestor) {
            graduatedEdges.push({ ...edge, targetId: ancestor, id: `grad:${edge.id}` })
          }
          // else child floats free — no containment edge
        }
      } else {
        // dependency or nexusDependency — project both endpoints
        const resolvedSrc = srcVisible ? edge.sourceId
          : findNearestVisibleAncestor(edge.sourceId, ids, getNode)
        const resolvedTgt = tgtVisible ? edge.targetId
          : findNearestVisibleAncestor(edge.targetId, ids, getNode)
        if (!resolvedSrc || !resolvedTgt || resolvedSrc === resolvedTgt) continue
        const key = `${resolvedSrc}→${resolvedTgt}`
        if (!depEdgeKeys.has(key)) {
          depEdgeKeys.set(key, { ...edge, sourceId: resolvedSrc, targetId: resolvedTgt, id: `grad:${key}` })
        }
      }
    }

    const vEdges = [...graduatedEdges, ...depEdgeKeys.values()]

    // Compute per-node summaries from the graduated visible edge set
    const vNodeMap = new Map<string, SimNode>()
    for (const n of vNodes) vNodeMap.set(n.id, n)
    const nodeSummaries = new Map<string, string>()
    for (const node of vNodes) {
      const s = computeGraphNodeSummary(node, vEdges, vNodeMap)
      if (s) nodeSummaries.set(node.id, s)
    }

    return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids, nodeSummaries }
  }, [visibleTypes, selectedFiles, graph]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Type toggle
  const toggleType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

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

    // Ensure the target type is visible (enable if toggled off)
    setVisibleTypes(prev => {
      if (prev.has(defType)) return prev
      const next = new Set(prev)
      next.add(defType)
      return next
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
      {/* Shared Filter Bar — identical structure to Tree View */}
      <div className="canvas-header">
        {hasFiles && (
          <>
            <div className="header-files-section">
              <div className="header-files-row">
                {allFiles.map(file => {
                  const fileName = file.split('/').pop() || file
                  const isSelected = selectedFiles.has(file)
                  const chipClass = noFilesSelected
                    ? 'header-file-tag all-included'
                    : `header-file-tag ${isSelected ? 'selected' : ''}`
                  return (
                    <button key={file} className={chipClass} onClick={() => toggleFile(file)} title={file}>
                      <span className="header-file-icon">📄</span>
                      <span className="header-file-name">{fileName}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="header-divider" />
          </>
        )}

        <div className="header-types-section">
          <div className="header-types-row">
            {DEF_TYPE_CONFIGS.map(cfg => {
              const isActive = visibleTypes.has(cfg.type)
              return (
                <button
                  key={cfg.type}
                  className={`header-type-tag ${isActive ? 'active' : ''} header-type-${cfg.type}`}
                  onClick={() => toggleType(cfg.type)}
                  title={isActive ? `Hide ${cfg.label.toLowerCase()}` : `Show ${cfg.label.toLowerCase()}`}
                >
                  <span className="header-type-icon">{cfg.icon}</span>
                  <span className="header-type-label">{cfg.label}</span>
                </button>
              )
            })}
          </div>
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
                onChange={e => setSearchQuery(e.target.value)}
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

      {/* Canvas + hover tooltip overlay */}
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
          highlightedNodes={highlightedNodes}
          highlightedEdges={highlightedEdges}
          hoveredNodeId={hoveredNodeId}
          selectedNodeId={selectedNodeId}
          focusedNodeId={focusedNodeId}
          searchMatchIds={visibleMatchIds}
          running={running}
          showForceFields={showForceFields}
          forceParams={forceParams}
          activeSection={activeSection}
          activeChargeLevel={activeChargeLevel}
          nodeSummaries={nodeSummaries}
        />
        <GraphHoverTooltip
          hoveredNodeId={hoveredNodeId}
          simRef={simRef}
          visibleEdges={visibleEdges}
          viewport={viewport}
          shiftHeld={shiftHeld}
        />
      </div>

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

interface GraphHoverTooltipProps {
  hoveredNodeId: string | null
  simRef: React.RefObject<Simulation | null>
  visibleEdges: { edgeType: string; sourceId: string; targetId: string }[]
  viewport: Viewport
  shiftHeld: boolean
}

function GraphHoverTooltip({ hoveredNodeId, simRef, visibleEdges, viewport, shiftHeld }: GraphHoverTooltipProps) {
  if (!hoveredNodeId) return null
  const sim = simRef.current
  if (!sim) return null
  const node = sim.getNode(hoveredNodeId)
  if (!node) return null

  const parentName = node.parentId ? sim.getNode(node.parentId)?.name : undefined
  const cfg = DEF_TYPE_CONFIGS.find(c => c.type === nodeTypeToDefType(node.nodeType))
  const fileName = node.sourceFile?.split('/').pop()

  let outgoing = 0, incoming = 0
  for (const e of visibleEdges) {
    if (e.edgeType === 'containment') continue
    if (e.sourceId === hoveredNodeId) outgoing++
    if (e.targetId === hoveredNodeId) incoming++
  }

  const [sx, sy] = worldToScreen(viewport, node.x, node.y)

  return (
    <div className="graph-hover-tooltip" style={{ left: sx, top: sy }}>
      <div className="tooltip-identity">
        {cfg && <span className="tooltip-type-icon">{cfg.icon}</span>}
        <span className="tooltip-name">{node.name}</span>
      </div>
      {parentName && <div className="tooltip-parent">{parentName}</div>}
      {fileName && <div className="tooltip-file">{fileName}</div>}
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
