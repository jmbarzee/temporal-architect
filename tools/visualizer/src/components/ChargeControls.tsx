// Push-section controls: a 2D "charge map" (the control) and a read-only
// charge-falloff visualization (the read-out), linked by a shared hovered-type
// state (the DimensionValue). Thin wrappers over the shared ForceMap2D / ForceCurves
// primitives — this file owns only the charge-specific math (one solid token
// per node type, inverse-power falloff curves). See GRAPH_VIEW.md § Control
// Panel → PUSH.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { withOverride } from '../graph/simulation'
import { pushForKey, resolvePhysics } from '../graph/forces'

import type { DimensionValue } from '../graph/dimension'
import type { Ontology } from '../graph/ontology'
import { useOntology } from './graph-view/useOntology'
import { ForceMap2D, ForceCurves, CURVE_W, CURVE_H, CURVE_SAMPLES } from './ForceMap'
import type { MapToken, CurveItem } from './ForceMap'

// Shared charge / core-radius ranges. The map plots every node type on these
// common axes so their relative repulsion strength and reach are comparable.
// Charge is stored negative (repulsion) but plotted as magnitude.
export const CHARGE_MAG_MIN = 0
export const CHARGE_MAG_MAX = 1000
export const CHARGE_MAG_STEP = 10
export const CORE_RADIUS_MIN_AXIS = 0
export const CORE_RADIUS_MAX_AXIS = 100
export const CORE_RADIUS_STEP = 1

// Colour for one value on the style axis, resolved through the taxonomy rather
// than looked up in a registry this component imports.
function typeColor(ontology: Ontology, t: DimensionValue): string {
  return `var(--color-${ontology.styleForKey(t).color.cssVarSuffix})`
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface ChargeControlProps {
  params: ForceParams
  onParamChange: (patch: Partial<ForceParams>) => void
  // The hovered/active node type — links the map, the curves, and the canvas.
  hoveredType: DimensionValue | null
  onHoverType: (t: DimensionValue | null) => void
}

// ── 2D Charge Map ─────────────────────────────────────────────────────────────
//
// y = charge magnitude, x = core radius. One solid token per node type, coloured
// by type. Dragging sets both the (negative) charge and the core radius at once.
export function ChargeMap({ params, onParamChange, hoveredType, onHoverType }: ChargeControlProps) {
  const ontology = useOntology()
  // The dense per-bucket table the kernels also read — resolved here once per
  // (params, taxonomy), never per token or per sample.
  const push = React.useMemo(() => resolvePhysics(params, ontology).push, [params, ontology])
  const tokens: MapToken[] = push.mapping.buckets.map(({ id: t }) => ({
    id: t,
    x: pushForKey(push, t).coreRadius,
    y: Math.abs(pushForKey(push, t).charge),
    colorA: typeColor(ontology, t),
    outline: 'solid',
    label: ontology.abbreviationFor(t),
    tooltip: `${ontology.styleForKey(t).label} repulsion charge & core radius`,
  }))

  const handleDrag = (id: string, x: number, y: number) => {
    const t = id
    onParamChange({
      // One override per bucket, carrying both numbers the token encodes;
      // charge is stored negative (repulsion).
      push: withOverride(params.push, t, { charge: -y, coreRadius: x }),
    })
  }

  return (
    <ForceMap2D
      tokens={tokens}
      xAxis={{ min: CORE_RADIUS_MIN_AXIS, max: CORE_RADIUS_MAX_AXIS, step: CORE_RADIUS_STEP, label: 'core radius' }}
      yAxis={{ min: CHARGE_MAG_MIN, max: CHARGE_MAG_MAX, step: CHARGE_MAG_STEP, label: 'charge' }}
      onDrag={handleDrag}
      hoveredId={hoveredType}
      onHover={onHoverType}
      ariaLabel="Charge map: core radius versus charge magnitude"
      xSlider={{
        value: params.coreRadiusMultiplier, min: 0.1, max: 3, step: 0.05,
        onChange: v => onParamChange({ coreRadiusMultiplier: v }),
        title: 'Scale every type’s core radius', ariaLabel: 'Scale all core radius',
        popId: 'coreRadiusMultiplier',
      }}
      ySlider={{
        value: params.pushMultiplier, min: 0, max: 3, step: 0.1,
        onChange: v => onParamChange({ pushMultiplier: v }),
        title: 'Scale every type’s charge', ariaLabel: 'Scale all charge',
        popId: 'pushMultiplier',
      }}
    />
  )
}

// ── Charge-falloff visualization (read-only) ──────────────────────────────────
//
// Plots each type's repulsion falloff push·|charge| / (d² + rEff²)^exp vs
// distance (all-positive, baseline at the bottom of the frame), with the core
// radius marked on the distance axis. The global `exp` (chargeExponent) is the
// slider beneath.
export function ChargeCurves({ params, onParamChange, hoveredType, onHoverType }: ChargeControlProps) {
  const ontology = useOntology()
  // The dense per-bucket table the kernels also read — resolved here once per
  // (params, taxonomy), never per token or per sample.
  const push = React.useMemo(() => resolvePhysics(params, ontology).push, [params, ontology])
  const pushMul = params.pushMultiplier
  const crMul = params.coreRadiusMultiplier
  const exp = params.chargeExponent

  const { curves, dMax } = React.useMemo<{ curves: CurveItem[]; dMax: number }>(() => {
    const rEffs = push.mapping.buckets.map(b => crMul * pushForKey(push, b.id).coreRadius)
    const maxREff = Math.max(0, ...rEffs)
    // Show the falloff out to a few core radii so the plateau-then-drop shape
    // is legible even when the radii are small.
    const dMax = Math.max(150, maxREff * 4)

    let maxMag = 0
    const sampled = push.mapping.buckets.map(({ id: t }) => {
      const q = Math.abs(pushForKey(push, t).charge) * pushMul
      const rEff = crMul * pushForKey(push, t).coreRadius
      const soft = rEff * rEff
      const pts: { d: number; v: number }[] = []
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const d = (i / CURVE_SAMPLES) * dMax
        const v = q / Math.pow(d * d + soft, Math.max(exp, 0.01))
        if (v > maxMag) maxMag = v
        pts.push({ d, v })
      }
      return { type: t, rEff, pts }
    })

    const norm = maxMag > 0 ? maxMag : 1
    const ampH = CURVE_H * 0.95  // leave a little headroom at the top
    const xFor = (d: number) => (d / dMax) * CURVE_W
    const yFor = (v: number) => clamp(CURVE_H - (v / norm) * ampH, 0, CURVE_H)

    const built = sampled.map(({ type, rEff, pts }) => ({
      id: type,
      color: typeColor(ontology, type),
      markerX: xFor(rEff),
      points: pts.map(p => `${xFor(p.d).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' '),
    }))
    return { curves: built, dMax }
  }, [params, pushMul, push, crMul, exp, ontology])

  return (
    <ForceCurves
      curves={curves}
      xMax={dMax}
      hoveredId={hoveredType}
      onHover={onHoverType}
      xLabel="distance"
      yLabel="force"
      ariaLabel="Charge falloff curves"
      exp={{
        value: exp, min: 0.5, max: 1.0, step: 0.05,
        onChange: v => onParamChange({ chargeExponent: v }),
        title: 'Power of (d² + r²) in the charge falloff. 1 = inverse-square; higher = sharper drop-off.',
        popId: 'chargeExponent',
      }}
    />
  )
}
