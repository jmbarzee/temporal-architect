// useSimulationLoop — drives the simulation each frame and reacts to filter
// changes. Owns the requestAnimationFrame physics loop (tick + one-shot initial
// fit + cross-view center + fps + stability stop), the hover tooltip re-render
// tick, and the seed-on-type-change / reheat-on-file-change effects. It consumes
// the sim instance, the visible subgraph, and the camera/selection handles as
// inputs (the explicit data links) rather than owning any of them.

import React from 'react'
import type { Simulation, SimNode } from '../../graph/simulation'
import type { Viewport } from '../../graph/viewport'
import { fitToView } from '../../graph/viewport'
import { nodeTypeToDefType } from './nodeDefType'

export interface SimulationLoopParams {
  simRef: React.MutableRefObject<Simulation | null>
  running: boolean
  setRunning: React.Dispatch<React.SetStateAction<boolean>>
  visibleIds: Set<string>
  visibleNodes: SimNode[]
  downstreamScores: Map<string, number>
  visibleTypes: Set<string>
  selectedFiles: Set<string>
  hoveredNodeId: string | null
  selectedNodeId: string | null
  containerRef: React.RefObject<HTMLDivElement>
  initialFitDone: React.MutableRefObject<boolean>
  pendingCenterRef: React.MutableRefObject<{ nodeId: string } | null>
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>
}

export function useSimulationLoop({
  simRef, running, setRunning,
  visibleIds, visibleNodes, downstreamScores,
  visibleTypes, selectedFiles,
  hoveredNodeId, selectedNodeId,
  containerRef, initialFitDone, pendingCenterRef, setViewport, setSelectedNodeId,
}: SimulationLoopParams): { fps: number } {
  // Frame-rate indicator. Updated ~2×/sec from the loop.
  const [fps, setFps] = React.useState(0)
  const fpsTrackRef = React.useRef({ frames: 0, lastStamp: 0 })

  // Physics animation loop. Decoupled from React rendering: the canvas has its
  // own RAF draw loop reading live SimNode.x/.y through a ref, so the physics
  // tick does NOT trigger a React re-render each frame. We only touch React state
  // for one-shot events (initial fit, pending cross-view center, stability, FPS).
  React.useEffect(() => {
    if (!running) return
    let frameId = 0
    fpsTrackRef.current = { frames: 0, lastStamp: 0 }

    const loop = () => {
      const sim = simRef.current
      if (!sim) return

      sim.tick(visibleIds, downstreamScores)

      // Initial fit — once per sim instance, after warmup.
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

      // FPS meter — recompute ~2×/sec; setFps only fires on change.
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
  }, [running, visibleIds, visibleNodes, selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // While hovering a node during a running sim, re-render at ~10fps so the DOM
  // tooltip tracks the moving node (canvas nodes update at 60fps via refs).
  const [, setTooltipTick] = React.useState(0)
  React.useEffect(() => {
    if (!running || !hoveredNodeId) return
    const id = window.setInterval(() => setTooltipTick(t => t + 1), 100)
    return () => window.clearInterval(id)
  }, [running, hoveredNodeId])

  // Seed newly visible nodes at their nearest visible ancestor, then reheat.
  const prevVisibleTypes = React.useRef(visibleTypes)
  React.useEffect(() => {
    const prev = prevVisibleTypes.current
    if (prev === visibleTypes) return
    const sim = simRef.current
    if (sim) {
      for (const node of sim.nodes) {
        const defType = nodeTypeToDefType(node.nodeType)
        if (visibleTypes.has(defType) && !prev.has(defType)) {
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
  }, [visibleTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reheat when the file filter changes — visible motion confirming the change.
  // No ancestor-seed (files aren't structural) and no refit (preserve pan/zoom).
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
  }, [selectedFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  return { fps }
}
