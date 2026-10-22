// Push-section controls: a 2D "charge map" (the control) and a read-only
// charge-falloff visualization (the read-out), linked by a shared hovered-type
// state (the DimensionValue). Thin wrappers over the shared ForceMap2D / ForceCurves
// primitives — this file owns only the charge-specific math (one solid token
// per node type, inverse-power falloff curves). See GRAPH_VIEW.md § Control
// Panel → PUSH.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { withPushOverride } from '../graph/simulation'
import { pushForKey } from '../graph/forces'
import type { ResolvedPhysics } from '../graph/forces'

import { useOntology } from './graph-view/useOntology'
import { bucketColor } from './controls/bucketColor'
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface ChargeControlProps {
  params: ForceParams
  /** The dense tables the kernels read, resolved once by the view (T25). */
  resolved: ResolvedPhysics
  /** The push buckets some visible node falls in — the only ones worth a token (R35). */
  present: ReadonlySet<string>
  onParamChange: (patch: Partial<ForceParams>) => void
  // The hovered/active bucket on the push axis — links the map, the curves, and the canvas.
  hoveredBucket: string | null
  onHoverBucket: (b: string | null) => void
}

// ── 2D Charge Map ─────────────────────────────────────────────────────────────
//
// y = charge magnitude, x = core radius. One solid token per bucket of the push
// axis. Dragging sets both the (negative) charge and the core radius at once.
export function ChargeMap({ params, resolved, present, onParamChange, hoveredBucket, onHoverBucket }: ChargeControlProps) {
  const ontology = useOntology()
  const { push } = resolved
  // Only the buckets the visible set holds (R35); the tuning keeps the rest.
  const shown = push.mapping.buckets.filter(b => present.has(b.id))
  const tokens: MapToken[] = shown.map(b => ({
    id: b.id,
    x: pushForKey(push, b.id).coreRadius,
    y: Math.abs(pushForKey(push, b.id).charge),
    colorA: bucketColor(ontology, push.mapping, b.id),
    outline: 'solid',
    label: b.abbreviation,
    tooltip: `${b.label} repulsion charge & core radius`,
  }))

  const handleDrag = (id: string, x: number, y: number) => {
    const t = id
    onParamChange({
      // One override per bucket, carrying both numbers the token encodes;
      // charge is stored negative (repulsion).
      pair: withPushOverride(params.pair, t, { charge: -y, coreRadius: x }),
    })
  }

  return (
    <ForceMap2D
      tokens={tokens}
      xAxis={{ min: CORE_RADIUS_MIN_AXIS, max: CORE_RADIUS_MAX_AXIS, step: CORE_RADIUS_STEP, label: 'core radius' }}
      yAxis={{ min: CHARGE_MAG_MIN, max: CHARGE_MAG_MAX, step: CHARGE_MAG_STEP, label: 'charge' }}
      onDrag={handleDrag}
      hoveredId={hoveredBucket}
      onHover={onHoverBucket}
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
export function ChargeCurves({ params, resolved, present, onParamChange, hoveredBucket, onHoverBucket }: ChargeControlProps) {
  const ontology = useOntology()
  const { push } = resolved
  // Only the buckets the visible set holds (R35); the tuning keeps the rest.
  const shown = push.mapping.buckets.filter(b => present.has(b.id))
  const pushMul = params.pushMultiplier
  const crMul = params.coreRadiusMultiplier
  const exp = params.chargeExponent

  const { curves, dMax } = React.useMemo<{ curves: CurveItem[]; dMax: number }>(() => {
    const rEffs = shown.map(b => crMul * pushForKey(push, b.id).coreRadius)
    const maxREff = Math.max(0, ...rEffs)
    // Show the falloff out to a few core radii so the plateau-then-drop shape
    // is legible even when the radii are small.
    const dMax = Math.max(150, maxREff * 4)

    let maxMag = 0
    const sampled = shown.map(({ id: t }) => {
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
      color: bucketColor(ontology, push.mapping, type),
      markerX: xFor(rEff),
      points: pts.map(p => `${xFor(p.d).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' '),
    }))
    return { curves: built, dMax }
  }, [params, pushMul, push, crMul, exp, ontology, present])

  return (
    <ForceCurves
      curves={curves}
      xMax={dMax}
      hoveredId={hoveredBucket}
      onHover={onHoverBucket}
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
