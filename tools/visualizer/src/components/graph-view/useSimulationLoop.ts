// useSimulationLoop — drives the simulation each frame and reacts to filter
// changes. Owns the requestAnimationFrame physics loop (tick + one-shot initial
// fit + cross-view center + fps + stability stop), the hover tooltip re-render
// tick, and the seed-on-type-change / reheat-on-file-change effects. It consumes
// the sim instance, the visible subgraph, and the camera/selection handles as
// inputs (the explicit data links) rather than owning any of them.

import type { FilterState } from '../../filter/types'
import { selectionFor } from '../../filter/types'
import { passesFilter } from './visibleGraph'
import React from 'react'
import type { Simulation, SimNode } from '../../graph/simulation'
import type { Viewport } from '../../graph/viewport'
import { fitToView } from '../../graph/viewport'
import { useOntology } from './useOntology'

export interface SimulationLoopParams {
  simRef: React.MutableRefObject<Simulation | null>
  running: boolean
  setRunning: React.Dispatch<React.SetStateAction<boolean>>
  visibleIds: Set<string>
  visibleNodes: SimNode[]
  downstreamScores: Map<string, number>
  filter: FilterState
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
  filter,
  hoveredNodeId, selectedNodeId,
  containerRef, initialFitDone, pendingCenterRef, setViewport, setSelectedNodeId,
}: SimulationLoopParams): { fps: number } {
  const ontology = useOntology()
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

  // React to a filter change, per axis, using that axis's declared reheat policy.
  //
  // This was two hand-written effects — one for types, one for files — and their
  // differences were the trap (T9). They differ on three of four fields, and the
  // one they AGREE on is the one a careless generalisation drops: both call
  // `setRunning(true)`, and omitting it leaves the canvas frozen after every
  // toggle. Writing `resume` out per axis is what keeps that a decision rather
  // than an omission.
  //
  // "Newly revealed" is now asked of the whole filter rather than of one axis:
  // a node counts as revealed if it passes now and did not before. The old
  // version tested only the type axis, so a node revealed by a *file* change was
  // never seeded even when the type axis had also moved in the same commit.
  const prevFilter = React.useRef(filter)
  React.useEffect(() => {
    const prev = prevFilter.current
    if (prev === filter) return
    const sim = simRef.current
    if (!sim) { prevFilter.current = filter; return }

    let alpha = 0
    let seedRevealed = false
    let refit = false
    let resume = false
    for (const dim of ontology.filterDimensions) {
      if (selectionFor(prev, dim.id) === selectionFor(filter, dim.id)) continue
      // Several axes can move at once (a view switch does exactly that), so the
      // policies combine rather than the last one winning: the strongest reheat,
      // and any axis that wants seeding, refitting or resuming gets it.
      alpha = Math.max(alpha, dim.reheat.alpha)
      seedRevealed = seedRevealed || dim.reheat.seedRevealed
      refit = refit || dim.reheat.refit
      resume = resume || dim.reheat.resume
    }

    if (alpha > 0) {
      if (seedRevealed) {
        for (const node of sim.nodes) {
          if (!passesFilter(node, filter, ontology)) continue
          if (passesFilter(node, prev, ontology)) continue
          let ancestorId = node.parentId
          while (ancestorId) {
            const ancestor = sim.getNode(ancestorId)
            if (!ancestor) break
            if (passesFilter(ancestor, filter, ontology)) {
              sim.seedAt(node.id, ancestor.x, ancestor.y)
              break
            }
            ancestorId = ancestor.parentId
          }
        }
      }
      sim.reheat(alpha)
      if (resume) setRunning(true)
      if (refit) initialFitDone.current = false
    }
    prevFilter.current = filter
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  return { fps }
}
