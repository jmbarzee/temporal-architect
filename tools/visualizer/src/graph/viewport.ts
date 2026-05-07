// Viewport transform for the graph canvas.
// Converts between world coordinates (node positions) and screen coordinates (canvas pixels).

import type { SimNode } from './simulation'

export interface Viewport {
  x: number     // translation (world offset) in screen pixels
  y: number
  scale: number // zoom level (1 = 100%)
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 }

export function worldToScreen(vp: Viewport, wx: number, wy: number): [number, number] {
  return [wx * vp.scale + vp.x, wy * vp.scale + vp.y]
}

export function screenToWorld(vp: Viewport, sx: number, sy: number): [number, number] {
  return [(sx - vp.x) / vp.scale, (sy - vp.y) / vp.scale]
}

// Zoom centered on a screen point
export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport {
  const newScale = Math.max(0.1, Math.min(10, vp.scale * factor))
  // Adjust translation so the point under the cursor stays fixed
  const wx = (sx - vp.x) / vp.scale
  const wy = (sy - vp.y) / vp.scale
  return {
    scale: newScale,
    x: sx - wx * newScale,
    y: sy - wy * newScale,
  }
}

// Compute viewport that frames all given nodes with padding
export function fitToView(
  nodes: SimNode[],
  width: number,
  height: number,
  padding = 60,
): Viewport {
  if (nodes.length === 0) return { x: width / 2, y: height / 2, scale: 1 }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }

  const graphW = maxX - minX || 1
  const graphH = maxY - minY || 1
  const availW = width - padding * 2
  const availH = height - padding * 2

  const scale = Math.min(availW / graphW, availH / graphH, 2) // cap at 2x
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  return {
    scale,
    x: width / 2 - cx * scale,
    y: height / 2 - cy * scale,
  }
}
