// useViewport — the camera concern for the Graph View.
//
// Owns the viewport (pan/zoom transform, which follows a pane resize) and the
// DOM container ref used to measure the canvas, plus two coordination refs the
// physics loop reads: the one-shot `initialFitDone` guard and the cross-view
// `pendingCenterRef` request. `fit()` frames a set of nodes; every other
// framing (the loop's initial fit and centring, search) sets the viewport
// against the size `measure()` returns, and the keyboard handlers zoom about
// the centre of `containerRef`.

import React from 'react'
import { DEFAULT_VIEWPORT, fitToView, followResize } from '../../graph/viewport'
import type { PaneSize, Viewport } from '../../graph/viewport'
import type { SimNode } from '../../graph/simulation'

export interface ViewportController {
  viewport: Viewport
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>
  containerRef: React.RefObject<HTMLDivElement>
  // One-shot initial-fit guard; reset on sim rebuild / visible-type change.
  initialFitDone: React.MutableRefObject<boolean>
  // Cross-view "center on this node after warmup" request, consumed by the loop.
  pendingCenterRef: React.MutableRefObject<{ nodeId: string } | null>
  // The container's size, for a viewport computed against it.
  measure: () => PaneSize | null
  // Frame the viewport to the given nodes (measures the container first).
  fit: (nodes: SimNode[], padding?: number) => void
}

export function useViewport(): ViewportController {
  const [viewport, setViewport] = React.useState<Viewport>(DEFAULT_VIEWPORT)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const initialFitDone = React.useRef(false)
  const pendingCenterRef = React.useRef<{ nodeId: string } | null>(null)

  // A resize keeps the world point at the pane's centre fixed. The shift is
  // the change since the size the viewport was last computed for: `measure()`
  // records that size, so a viewport framed after the host resized the pane,
  // but before the observer ran, is not shifted again. `followResize` leaves
  // the first measurement and a zero-sized (hidden) pane alone.
  const sizeRef = React.useRef<PaneSize | null>(null)
  const measure = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return null
    const { width, height } = container.getBoundingClientRect()
    sizeRef.current = { width, height }
    return { width, height }
  }, [])
  React.useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const prev = sizeRef.current
      const size = measure()
      if (size) setViewport(vp => followResize(vp, prev, size))
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [measure])

  const fit = React.useCallback((nodes: SimNode[], padding?: number) => {
    const size = measure()
    if (!size) return
    setViewport(fitToView(nodes, size.width, size.height, padding))
  }, [measure])

  return { viewport, setViewport, containerRef, initialFitDone, pendingCenterRef, measure, fit }
}
