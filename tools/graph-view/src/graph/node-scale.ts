// Render-time node scaling.
//
// Nodes are drawn in screen pixels. Without scaling they stay a fixed size at
// every zoom, so a zoomed-out graph collapses into a chaotic pile of full-size
// dots. The on-screen size is `baseR × baseMul × clamp(zoom, minZoomMul,
// maxZoomMul)`:
//   - baseMul    overall size knob (1 = the style's declared size).
//   - maxZoomMul ceiling — once the user zooms past this, nodes stop growing.
//                Lower it to make nodes start shrinking sooner as you zoom out.
//   - minZoomMul floor — how small nodes may get when zoomed all the way out.
// These are user-tunable from the Controls panel (Misc → Node scaling).
//
// Nothing here knows what a node *is*; it scales a radius against a zoom level.
// It lives apart from the taxonomy shapes for that reason — the two were in one
// file only because the sizes happened to be declared next to the registry.

export interface NodeScaleParams {
  baseMul: number
  minZoomMul: number
  maxZoomMul: number
}

export const DEFAULT_NODE_SCALE: NodeScaleParams = {
  baseMul: 0.6,
  minZoomMul: 0.4,
  maxZoomMul: 1.65,
}

/** On-screen size multiplier for a node body/label at the given zoom. */
export function nodeSizeMul(scale: number, p: NodeScaleParams): number {
  return p.baseMul * Math.max(p.minZoomMul, Math.min(p.maxZoomMul, scale))
}
