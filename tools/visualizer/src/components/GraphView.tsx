// Graph View: force-directed visualization of definition relationships.
// Wires together graph construction, simulation, viewport, and rendering.

import React from 'react'
import type { TWFFile } from '../types/ast'
import { buildGraph } from '../graph/build'
import { Simulation } from '../graph/simulation'
import type { SimNode } from '../graph/simulation'
import { DEFAULT_VIEWPORT, fitToView } from '../graph/viewport'
import type { Viewport } from '../graph/viewport'
import { GraphCanvas } from './GraphCanvas'
import { LevelSelector } from './LevelSelector'
import type { LevelRange } from './LevelSelector'

interface GraphViewProps {
  ast: TWFFile
}

export function GraphView({ ast }: GraphViewProps) {
  // Level range: default to Levels 1-2 (Namespaces + Workers) per spec
  const [levelRange, setLevelRange] = React.useState<LevelRange>([1, 2])
  const [viewport, setViewport] = React.useState<Viewport>(DEFAULT_VIEWPORT)
  const [running, setRunning] = React.useState(true)
  const simRef = React.useRef<Simulation | null>(null)
  const dragNodeRef = React.useRef<string | null>(null)
  const initialFitDone = React.useRef(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Build graph from AST
  const graph = React.useMemo(() => buildGraph(ast), [ast])

  // Create or update simulation when graph changes
  React.useEffect(() => {
    simRef.current = new Simulation(graph)
    initialFitDone.current = false
    setRunning(true)
  }, [graph])

  // Filter visible nodes and edges by level range
  const { visibleNodes, visibleEdges, visibleIds } = React.useMemo(() => {
    const sim = simRef.current
    if (!sim) return { visibleNodes: [] as SimNode[], visibleEdges: [], visibleIds: new Set<string>() }

    const [minL, maxL] = levelRange
    const ids = new Set<string>()
    const vNodes: SimNode[] = []

    for (const node of sim.nodes) {
      if (node.level >= minL && node.level <= maxL) {
        ids.add(node.id)
        vNodes.push(node)
      }
    }

    const vEdges = sim.edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId))

    return { visibleNodes: vNodes, visibleEdges: vEdges, visibleIds: ids }
  }, [levelRange, graph]) // eslint-disable-line react-hooks/exhaustive-deps

  // Animation loop: tick simulation and trigger re-render
  const [, forceRender] = React.useState(0)

  React.useEffect(() => {
    if (!running) return
    let frameId: number

    const loop = () => {
      const sim = simRef.current
      if (sim) {
        sim.tick(visibleIds)

        // Auto fit-to-view after simulation warms up
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

        if (sim.isStable()) {
          setRunning(false)
        }
      }
      forceRender(c => c + 1)
      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [running, visibleIds, visibleNodes])

  // Reheat simulation when level range changes
  const prevRange = React.useRef(levelRange)
  React.useEffect(() => {
    if (prevRange.current[0] !== levelRange[0] || prevRange.current[1] !== levelRange[1]) {
      // Seed newly visible nodes at parent position
      const sim = simRef.current
      if (sim) {
        for (const node of sim.nodes) {
          if (node.level >= levelRange[0] && node.level <= levelRange[1]) {
            if (node.level < prevRange.current[0] || node.level > prevRange.current[1]) {
              // Node is newly visible — seed at parent position
              if (node.parentId) {
                const parent = sim.getNode(node.parentId)
                if (parent) {
                  sim.seedAt(node.id, parent.x, parent.y)
                }
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

  // Node drag handlers
  const handleNodeDragStart = React.useCallback((id: string, wx: number, wy: number) => {
    dragNodeRef.current = id
    simRef.current?.pinNode(id, wx, wy)
    simRef.current?.reheat(0.3)
    setRunning(true)
  }, [])

  const handleNodeDragMove = React.useCallback((wx: number, wy: number) => {
    if (dragNodeRef.current) {
      simRef.current?.pinNode(dragNodeRef.current, wx, wy)
    }
  }, [])

  const handleNodeDragEnd = React.useCallback(() => {
    if (dragNodeRef.current) {
      simRef.current?.unpinNode(dragNodeRef.current)
      dragNodeRef.current = null
    }
  }, [])

  // Double-click node: center and zoom to fit it and its neighbors
  const handleDoubleClickNode = React.useCallback((id: string) => {
    const sim = simRef.current
    const container = containerRef.current
    if (!sim || !container) return

    const node = sim.getNode(id)
    if (!node) return

    // Gather neighbors
    const neighborIds = new Set<string>([id])
    for (const edge of sim.edges) {
      if (edge.sourceId === id) neighborIds.add(edge.targetId)
      if (edge.targetId === id) neighborIds.add(edge.sourceId)
    }

    const neighbors = sim.nodes.filter(n => neighborIds.has(n.id))
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(neighbors, width, height, 80))
  }, [])

  // Fit-to-view button
  const handleFitToView = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(visibleNodes, width, height))
  }, [visibleNodes])

  const nodeCount = visibleNodes.length
  const edgeCount = visibleEdges.length

  return (
    <div className="graph-view" ref={containerRef}>
      <div className="graph-header">
        <LevelSelector range={levelRange} onChange={setLevelRange} />
        <div className="graph-header-info">
          <span className="graph-header-count">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''}, {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
          </span>
          <button className="graph-header-btn" onClick={handleFitToView} title="Fit to view (F)">
            Fit
          </button>
          <button
            className={`graph-header-btn ${running ? 'active' : ''}`}
            onClick={() => { if (!running) { simRef.current?.reheat(0.5); setRunning(true) } else { setRunning(false) } }}
            title={running ? 'Pause simulation' : 'Resume simulation'}
          >
            {running ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
      <GraphCanvas
        nodes={visibleNodes}
        edges={visibleEdges}
        viewport={viewport}
        onViewportChange={setViewport}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragMove={handleNodeDragMove}
        onNodeDragEnd={handleNodeDragEnd}
        onDoubleClickNode={handleDoubleClickNode}
        running={running}
      />
    </div>
  )
}
