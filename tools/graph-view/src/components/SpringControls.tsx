// Pull-section controls: a 2D "spring map" (the control) and a read-only
// force-curve visualization (the read-out), linked by a shared hovered-edge
// state (keyed by the edge category's k-field). Both are thin wrappers over
// the shared ForceMap2D / ForceCurves primitives — this file owns only the
// spring-specific math (split-colour tokens from the resolved spring
// categories, signed-response curves) and feeds presentational data into the
// primitives.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { withSpringOverride } from '../graph/simulation'
import type { ResolvedPhysics } from '../graph/forces'
import type { EdgeCategoryDescription } from '../graph/forces'

import { useOntology } from './graph-view/useOntology'
import { bucketColor } from './controls/bucketColor'
import { ForceMap2D, ForceCurves, CURVE_W, CURVE_H, CURVE_SAMPLES } from './ForceMap'
import type { MapToken, CurveItem } from './ForceMap'

// Shared k / rest ranges. The map plots every edge category on these common
// axes so their relative stiffness / length is directly comparable.
export const EDGE_K_MIN = 0
export const EDGE_K_MAX = 2
export const EDGE_K_STEP = 0.05
export const EDGE_REST_MIN = 0
export const EDGE_REST_MAX = 1000
export const EDGE_REST_STEP = 10

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** One token per category present in the graph, in first-seen order; ids the table cannot describe are skipped. */
function describedCategories(spring: ResolvedPhysics['spring'], present: ReadonlySet<string>): EdgeCategoryDescription[] {
  const out: EdgeCategoryDescription[] = []
  for (const id of present) {
    const c = spring.describe(id)
    if (c) out.push(c)
  }
  return out
}

interface SpringControlProps {
  params: ForceParams
  /** The dense tables the kernels read, resolved once by the view. */
  resolved: ResolvedPhysics
  /** The categories some edge of the graph falls in — the only ones worth a token. */
  present: ReadonlySet<string>
  // Routes through the panel's emitParamChange → live reheat.
  onParamChange: (patch: Partial<ForceParams>) => void
  // The hovered/active edge category, identified by its k-field key.
  hoveredEdge: string | null
  onHoverEdge: (key: string | null) => void
}

// ── 2D Spring Map ───────────────────────────────────────────────────────────
//
// x = rest length, y = stiffness (k). Each edge category is a draggable
// split-colour token; dragging sets both rest and k at once.
export function SpringMap({ params, resolved, present, onParamChange, hoveredEdge, onHoverEdge }: SpringControlProps) {
  const ontology = useOntology()
  const { spring } = resolved
  const shown = describedCategories(spring, present)
  const tokens: MapToken[] = shown.map(c => {
    const ph = spring.physicsFor(c.id)
    return {
      id: c.id,
      x: ph.distance,
      y: ph.strength,
      colorA: bucketColor(ontology, spring.mapping, c.sourceType),
      colorB: bucketColor(ontology, spring.mapping, c.targetType),
      outline: c.category === 'containment' ? 'dashed' : 'solid',
      label: c.label,
      tooltip: c.tooltip,
    }
  })

  // Drag id is the category id; one override carries both stiffness and length.
  const handleDrag = (id: string, x: number, y: number) => {
    onParamChange({ pair: withSpringOverride(params.pair, id, { strength: y, distance: x }) })
  }

  return (
    <ForceMap2D
      tokens={tokens}
      xAxis={{ min: EDGE_REST_MIN, max: EDGE_REST_MAX, step: EDGE_REST_STEP, label: 'length' }}
      yAxis={{ min: EDGE_K_MIN, max: EDGE_K_MAX, step: EDGE_K_STEP, label: 'stiffness' }}
      onDrag={handleDrag}
      hoveredId={hoveredEdge}
      onHover={onHoverEdge}
      ariaLabel="Spring map: rest length versus stiffness"
      xSlider={{
        value: params.distanceMultiplier, min: 0.05, max: 3, step: 0.05,
        onChange: v => onParamChange({ distanceMultiplier: v }),
        title: 'Scale every spring’s rest length', ariaLabel: 'Scale all length',
        popId: 'distanceMultiplier',
      }}
      ySlider={{
        value: params.pullMultiplier, min: 0, max: 3, step: 0.1,
        onChange: v => onParamChange({ pullMultiplier: v }),
        title: 'Scale every spring’s stiffness', ariaLabel: 'Scale all stiffness',
        popId: 'pullMultiplier',
      }}
    />
  )
}

// ── Force-curve visualization (read-only) ────────────────────────────────────
//
// Plots each spring's displacement response stiffness·sign(Δ)|Δ|^exp around its
// rest length (the /d direction term from the sim is dropped — this shows the
// spring *shape*, not the per-tick force vector). Zero crossing = length. The
// baseline sits low so the readable tension side gets most of the height and
// the compression side is cropped.

// Baseline at 78% down: tension (positive) above gets the bulk of the height.
const ZERO_Y = CURVE_H * 0.78

function springResponse(d: number, kEff: number, restEff: number, exp: number): number {
  const disp = d - restEff
  return kEff * Math.sign(disp) * Math.pow(Math.abs(disp), exp)
}

export function SpringCurves({ params, resolved, present, onParamChange, hoveredEdge, onHoverEdge }: SpringControlProps) {
  const ontology = useOntology()
  const { spring } = resolved
  const shown = React.useMemo(() => describedCategories(spring, present), [spring, present])
  const pull = params.pullMultiplier
  const dist = params.distanceMultiplier
  const exp = params.linkExponent

  const { curves, dMax } = React.useMemo<{ curves: CurveItem[]; dMax: number }>(() => {
    const restEffs = shown.map(c => spring.physicsFor(c.id).distance * dist)
    const dMax = Math.max(60, Math.max(...restEffs) * 2.2)

    let maxMag = 0
    const sampled = shown.map(edge => {
      const ph = spring.physicsFor(edge.id)
      const kEff = ph.strength * pull
      const restEff = ph.distance * dist
      const pts: { d: number; v: number }[] = []
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const d = (i / CURVE_SAMPLES) * dMax
        const v = springResponse(d, kEff, restEff, exp)
        if (Math.abs(v) > maxMag) maxMag = Math.abs(v)
        pts.push({ d, v })
      }
      return { edge, restEff, pts }
    })

    const norm = maxMag > 0 ? maxMag : 1
    const ampH = ZERO_Y // tension amplitude spans baseline → top edge (y=0)
    const xFor = (d: number) => (d / dMax) * CURVE_W
    // Symmetric scale by the tension amplitude; the compression side simply
    // clips at the bottom (intentional crop).
    const yFor = (v: number) => clamp(ZERO_Y - (v / norm) * ampH, 0, CURVE_H)

    const built = sampled.map(({ edge, restEff, pts }) => ({
      id: edge.id,
      color: bucketColor(ontology, spring.mapping, edge.sourceType),
      markerX: xFor(restEff),
      points: pts.map(p => `${xFor(p.d).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' '),
    }))
    return { curves: built, dMax }
    // `ontology` belongs here: the body reads it for the split-colour tokens.
    // Its sibling ChargeCurves already listed it, and the asymmetry was the bug
    // — a taxonomy swap left these curves drawn in the previous taxonomy's
    // colours, on its edge set, with no error.
  }, [spring, shown, pull, dist, exp, ontology])

  return (
    <ForceCurves
      curves={curves}
      xMax={dMax}
      baselineY={ZERO_Y}
      hoveredId={hoveredEdge}
      onHover={onHoverEdge}
      xLabel="distance"
      yLabel="force"
      ariaLabel="Spring force response curves"
      exp={{
        value: exp, min: 0.5, max: 3, step: 0.1,
        onChange: v => onParamChange({ linkExponent: v }),
        title: 'Power of displacement in the spring force. 1 = linear (Hooke); higher = softer near rest, stiffer far out.',
        popId: 'linkExponent',
      }}
    />
  )
}
