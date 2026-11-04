// useViewport — the camera concern for the Graph View.
//
// Owns the viewport (pan/zoom transform, which follows a pane resize) and the
// DOM container ref used to measure the canvas, plus two coordination refs the
// physics loop reads: the one-shot `initialFitDone` guard and the cross-view
// `pendingCenterRef` request. `fit()` frames a set of nodes; the
// loop/keyboard/double-click handlers consume the returned
// `setViewport`/`containerRef` directly until the loop is extracted.

import React from 'react'
import { DEFAULT_VIEWPORT, fitToView, followResize } from '../../graph/viewport'
import type { Viewport } from '../../graph/viewport'
import type { SimNode } from '../../graph/simulation'

export interface ViewportController {
  viewport: Viewport
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>
  containerRef: React.RefObject<HTMLDivElement>
  // One-shot initial-fit guard; reset on sim rebuild / visible-type change.
  initialFitDone: React.MutableRefObject<boolean>
  // Cross-view "center on this node after warmup" request, consumed by the loop.
  pendingCenterRef: React.MutableRefObject<{ nodeId: string } | null>
  // Frame the viewport to the given nodes (measures the container first).
  fit: (nodes: SimNode[], padding?: number) => void
}

export function useViewport(): ViewportController {
  const [viewport, setViewport] = React.useState<Viewport>(DEFAULT_VIEWPORT)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const initialFitDone = React.useRef(false)
  const pendingCenterRef = React.useRef<{ nodeId: string } | null>(null)

  // A resize keeps the world point at the pane's centre fixed. The first
  // measurement only records the size, and a zero-sized pane (hidden by its
  // host) neither shifts the camera nor is shifted from.
  const sizeRef = React.useRef<{ w: number; h: number } | null>(null)
  React.useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect
      const prev = sizeRef.current
      sizeRef.current = { w, h }
      if (!prev || !prev.w || !prev.h || !w || !h) return
      if (w !== prev.w || h !== prev.h) setViewport(vp => followResize(vp, w - prev.w, h - prev.h))
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const fit = React.useCallback((nodes: SimNode[], padding?: number) => {
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(nodes, width, height, padding))
  }, [])

  return { viewport, setViewport, containerRef, initialFitDone, pendingCenterRef, fit }
}
