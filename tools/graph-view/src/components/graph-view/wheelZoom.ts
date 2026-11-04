// Wheel zoom about the pointer, for the graph canvas.

import { zoomAt } from '../../graph/viewport'
import type { Viewport } from '../../graph/viewport'

/**
 * Zooms the camera on each wheel event over `canvas`; returns the cleanup.
 * The listener is native and non-passive: React's root wheel listener is
 * passive, so its preventDefault cannot keep the page from scrolling (#212).
 */
export function listenWheelZoom(
  canvas: HTMLElement,
  viewport: () => Viewport,
  onViewportChange: (vp: Viewport) => void,
): () => void {
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    onViewportChange(zoomAt(viewport(), e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 0.85))
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })
  return () => canvas.removeEventListener('wheel', onWheel)
}
