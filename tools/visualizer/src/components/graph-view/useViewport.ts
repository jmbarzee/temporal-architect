// useViewport — the camera concern for the Graph View.
//
// Owns the viewport (pan/zoom transform) and the DOM container ref used to
// measure the canvas, plus two coordination refs the physics loop reads: the
// one-shot `initialFitDone` guard and the cross-view `pendingCenterRef` request.
// `fit()` frames a set of nodes; the loop/keyboard/double-click handlers consume
// the returned `setViewport`/`containerRef` directly until the loop is extracted.

import React from 'react'
import { DEFAULT_VIEWPORT, fitToView } from '../../graph/viewport'
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

  const fit = React.useCallback((nodes: SimNode[], padding?: number) => {
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    setViewport(fitToView(nodes, width, height, padding))
  }, [])

  return { viewport, setViewport, containerRef, initialFitDone, pendingCenterRef, fit }
}
