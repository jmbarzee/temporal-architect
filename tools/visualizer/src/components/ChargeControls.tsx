// Push-section controls: a 2D "charge map" (the control) and a read-only
// charge-falloff visualization (the read-out), linked by a shared hovered-type
// state (the NodeType). Thin wrappers over the shared ForceMap2D / ForceCurves
// primitives — this file owns only the charge-specific math (one solid token
// per node type, inverse-power falloff curves). See GRAPH_VIEW.md § Control
// Panel → PUSH.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { CHARGE_KEY, CORE_RADIUS_KEY } from '../graph/simulation'
import type { NodeType } from '../graph/model'
import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY, sliderLabelFor } from '../graph/node-types'
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

function typeColor(t: NodeType): string {
  return `var(--color-${NODE_TYPE_REGISTRY[t].color.cssVarSuffix})`
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface ChargeControlProps {
  params: ForceParams
  onParamChange: (key: keyof ForceParams, value: number) => void
  // The hovered/active node type — links the map, the curves, and the canvas.
  hoveredType: NodeType | null
  onHoverType: (t: NodeType | null) => void
}

// ── 2D Charge Map ─────────────────────────────────────────────────────────────
//
// y = charge magnitude, x = core radius. One solid token per node type, coloured
// by type. Dragging sets both the (negative) charge and the core radius at once.
export function ChargeMap({ params, onParamChange, hoveredType, onHoverType }: ChargeControlProps) {
  const tokens: MapToken[] = ALL_NODE_TYPES.map(t => ({
    id: t,
    x: params[CORE_RADIUS_KEY[t]] as number,
    y: Math.abs(params[CHARGE_KEY[t]] as number),
    colorA: typeColor(t),
    outline: 'solid',
    label: sliderLabelFor(t),
    tooltip: `${NODE_TYPE_REGISTRY[t].label} repulsion charge & core radius`,
  }))

  const handleDrag = (id: string, x: number, y: number) => {
    const t = id as NodeType
    onParamChange(CHARGE_KEY[t], -y)   // store negative (repulsion)
    onParamChange(CORE_RADIUS_KEY[t], x)
  }

  return (
    <ForceMap2D
      tokens={tokens}
      xAxis={{ min: CORE_RADIUS_MIN_AXIS, max: CORE_RADIUS_MAX_AXIS, step: CORE_RADIUS_STEP, label: 'core radius' }}
      yAxis={{ min: CHARGE_MAG_MIN, max: CHARGE_MAG_MAX, step: CHARGE_MAG_STEP, label: 'charge' }}
      onDrag={handleDrag}
      hoveredId={hoveredType}
      onHover={id => onHoverType(id as NodeType | null)}
      ariaLabel="Charge map: core radius versus charge magnitude"
      xSlider={{
        value: params.coreRadiusMultiplier, min: 0.1, max: 3, step: 0.05,
        onChange: v => onParamChange('coreRadiusMultiplier', v),
        title: 'Scale every type’s core radius', ariaLabel: 'Scale all core radius',
        popId: 'coreRadiusMultiplier',
      }}
      ySlider={{
        value: params.pushMultiplier, min: 0, max: 3, step: 0.1,
        onChange: v => onParamChange('pushMultiplier', v),
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
  const push = params.pushMultiplier
  const crMul = params.coreRadiusMultiplier
  const exp = params.chargeExponent

  const { curves, dMax } = React.useMemo<{ curves: CurveItem[]; dMax: number }>(() => {
    const rEffs = ALL_NODE_TYPES.map(t => crMul * (params[CORE_RADIUS_KEY[t]] as number))
    const maxREff = Math.max(0, ...rEffs)
    // Show the falloff out to a few core radii so the plateau-then-drop shape
    // is legible even when the radii are small.
    const dMax = Math.max(150, maxREff * 4)

    let maxMag = 0
    const sampled = ALL_NODE_TYPES.map(t => {
      const q = Math.abs(params[CHARGE_KEY[t]] as number) * push
      const rEff = crMul * (params[CORE_RADIUS_KEY[t]] as number)
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
      color: typeColor(type),
      markerX: xFor(rEff),
      points: pts.map(p => `${xFor(p.d).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' '),
    }))
    return { curves: built, dMax }
  }, [params, push, crMul, exp])

  return (
    <ForceCurves
      curves={curves}
      xMax={dMax}
      hoveredId={hoveredType}
      onHover={id => onHoverType(id as NodeType | null)}
      xLabel="distance"
      yLabel="force"
      ariaLabel="Charge falloff curves"
      exp={{
        value: exp, min: 0.5, max: 1.0, step: 0.05,
        onChange: v => onParamChange('chargeExponent', v),
        title: 'Power of (d² + r²) in the charge falloff. 1 = inverse-square; higher = sharper drop-off.',
        popId: 'chargeExponent',
      }}
    />
  )
}
