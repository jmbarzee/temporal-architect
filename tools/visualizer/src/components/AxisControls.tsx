// One layout axis of the Gravity tab — X or Y — as a sub-tab body: which
// mapping the axis keys on, one column per bucket carrying the bucket's rest
// band as two handles (R30), the axis's own strength in the left gutter (R32),
// and the band force curve beneath (R33). Both axes are this one component:
// they are the same kind of thing (T22), so they get the same surface.
// See GRAPH_VIEW.md § Control Panel → GRAVITY.

import React from 'react'
import type { ForceParams, AxisOption, AxisTuning, BandRange } from '../graph/simulation'
import { TOKEN_CEILING, withOverride } from '../graph/simulation'
import type { ResolvedAxis, ResolvedPhysics } from '../graph/forces'
import { bandRangeFor } from '../graph/forces'
import type { DimensionalMapping } from '../graph/dimension'
import { useOntology } from './graph-view/useOntology'
import { bucketColor } from './controls/bucketColor'
import { Plot } from './controls/Plot'
import { Slider } from './controls/Slider'
import { Equation } from './controls/Equation'
import { FormulaValue } from './controls/PopContext'
import { ForceCurves, CURVE_W, CURVE_H, CURVE_SAMPLES } from './ForceMap'
import type { CurveItem } from './ForceMap'

export type LayoutAxis = 'x' | 'y'

/** A hovered bucket on one layout axis — links the axis plot to the canvas overlay. */
export interface GravityHover {
  axis: LayoutAxis
  bucket: string
}

interface AxisControlsProps {
  axis: LayoutAxis
  params: ForceParams
  resolved: ResolvedPhysics
  /** Every mapping the graph admits; an axis takes one whose bucket count fits the ceiling. */
  axes: readonly AxisOption[]
  onParamChange: (patch: Partial<ForceParams>) => void
  onRelayout: (patch: Partial<ForceParams>) => void
  hovered: GravityHover | null
  onHover: (h: GravityHover | null) => void
}

const tuningKey = (axis: LayoutAxis): 'bandX' | 'bandY' => (axis === 'x' ? 'bandX' : 'bandY')
const strengthKey = (axis: LayoutAxis): 'gravityX' | 'gravityY' => (axis === 'x' ? 'gravityX' : 'gravityY')

// ── Axis plot geometry ─────────────────────────────────────────────────────────
// One column per bucket; the vertical is the axis's world coordinate. Rest
// bands render as a stripe per column with two draggable handles on top.
const AP_W = 300
const AP_H = 210
const AP_PAD = { top: 16, right: 8, bottom: 2, left: 8 }
const PL = AP_PAD.left
const PR = AP_W - AP_PAD.right
const PT = AP_PAD.top
const PB = AP_H - AP_PAD.bottom
const W_MIN = -600
const W_MAX = 600
const W_STEP = 10
const DOT_R = 5

const yForWorld = (v: number) => PT + ((v - W_MIN) / (W_MAX - W_MIN)) * (PB - PT)
const valForY = (y: number) => W_MIN + ((y - PT) / (PB - PT)) * (W_MAX - W_MIN)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number, step: number) => Math.round(v / step) * step

export function AxisControls({ axis, params, resolved, axes, onParamChange, onRelayout, hovered, onHover }: AxisControlsProps) {
  const ontology = useOntology()
  const key = tuningKey(axis)
  const tuning: AxisTuning<BandRange> = params[key]
  const table: ResolvedAxis<BandRange> = axis === 'x' ? resolved.bandX : resolved.bandY
  const strength = params[strengthKey(axis)]
  const label = axis.toUpperCase()
  const ignored = axis === 'x' && params.radial

  const onAxisChange = (mapping: DimensionalMapping) => {
    if (mapping.dimension === tuning.mapping.dimension) return
    // A new axis starts from the taxonomy's declared bands on its buckets.
    onRelayout({ [key]: { mapping, overrides: new Map() } } as Partial<ForceParams>)
  }

  return (
    <div className={`gravity-section-tools${strength > 0 && !ignored ? '' : ' inactive'}`}>
      <Equation>{<>F = <FormulaValue id={`bandStrength${label}`}>strength</FormulaValue> × d<sup><FormulaValue id="bandExp">exp</FormulaValue></sup></>}</Equation>

      <div className="axis-row">
        <label className="axis-label" htmlFor={`gravity-axis-${axis}`}>axis</label>
        <select
          id={`gravity-axis-${axis}`}
          className="axis-select"
          value={tuning.mapping.dimension}
          title={`The dimension the ${label} axis keys on: one column per bucket`}
          onChange={e => {
            const option = axes.find(o => o.mapping.dimension === e.target.value)
            if (option) onAxisChange(option.mapping)
          }}
        >
          {axes.map(o => (
            <option key={o.mapping.dimension} value={o.mapping.dimension} disabled={o.pushTokens > TOKEN_CEILING}>
              {o.pushTokens > TOKEN_CEILING ? `${o.mapping.label} — ${o.pushTokens} columns (max ${TOKEN_CEILING})` : `${o.mapping.label} (${o.pushTokens})`}
            </option>
          ))}
        </select>
        {ignored && <span className="axis-note">ignored in radial</span>}
      </div>

      <AxisPlot
        axis={axis}
        tuning={tuning}
        table={table}
        strength={strength}
        onStrength={v => onParamChange({ [strengthKey(axis)]: v } as Partial<ForceParams>)}
        onBand={(bucket, next) => onParamChange({ [key]: withOverride(tuning, bucket, next) } as Partial<ForceParams>)}
        hovered={hovered}
        onHover={onHover}
        color={bucket => bucketColor(ontology, tuning.mapping, bucket)}
      />

      <AxisCurve axis={axis} params={params} onParamChange={onParamChange} />
    </div>
  )
}

function AxisPlot({ axis, tuning, table, strength, onStrength, onBand, hovered, onHover, color }: {
  axis: LayoutAxis
  tuning: AxisTuning<BandRange>
  table: ResolvedAxis<BandRange>
  strength: number
  onStrength: (v: number) => void
  onBand: (bucket: string, next: BandRange) => void
  hovered: GravityHover | null
  onHover: (h: GravityHover | null) => void
  color: (bucket: string) => string
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const dragRef = React.useRef<{ bucket: string; edge: 'min' | 'max' } | null>(null)
  const buckets = tuning.mapping.buckets
  const colX = (i: number) => PL + ((i + 0.5) / buckets.length) * (PR - PL)
  const label = axis.toUpperCase()

  const userY = (e: React.PointerEvent): number => {
    const svg = svgRef.current
    if (!svg) return 0
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return 0
    return pt.matrixTransform(ctm.inverse()).y
  }
  const handleDown = (e: React.PointerEvent, bucket: string, edge: 'min' | 'max') => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { bucket, edge }
  }
  const handleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const cur = bandRangeFor(table, drag.bucket)
    const v = clamp(snap(valForY(userY(e)), W_STEP), W_MIN, W_MAX)
    onBand(drag.bucket, drag.edge === 'min'
      ? { min: Math.min(v, cur.max - W_STEP), max: cur.max }
      : { min: cur.min, max: Math.max(v, cur.min + W_STEP) })
  }
  const handleUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }
  const isHovered = (bucket: string) => hovered !== null && hovered.axis === axis && hovered.bucket === bucket
  const anyHovered = hovered !== null && hovered.axis === axis

  return (
    <Plot
      yLabel={`${label} strength`}
      ySlider={
        <Slider
          orientation="vertical"
          min={0} max={0.25} step={0.005}
          value={strength}
          onChange={onStrength}
          title={`${label} band-pull strength (scale all); 0 switches the axis off`}
          ariaLabel={`${label} band strength`}
          popId={`bandStrength${label}`}
        />
      }
      bottom={<div className="ctl-plot-xlabel">{label} position</div>}
    >
      <svg
        ref={svgRef}
        className="gravity-band-svg"
        viewBox={`0 0 ${AP_W} ${AP_H}`}
        role="group"
        aria-label={`${label} axis: one column per bucket, its rest band as two handles`}
      >
        <rect x={PL} y={PT} width={PR - PL} height={PB - PT} className="gravity-band-bg" />
        <g className="gravity-band-stripes">
          {buckets.map((b, i) => {
            const r = bandRangeFor(table, b.id)
            const yTop = yForWorld(r.min)
            const yBot = yForWorld(r.max)
            const half = (PR - PL) / buckets.length / 2
            return (
              <rect
                key={b.id}
                x={colX(i) - half} y={yTop} width={half * 2} height={Math.max(0, yBot - yTop)}
                fill={color(b.id)}
                className={`gravity-band-stripe${anyHovered && !isHovered(b.id) ? ' dim' : ''}${isHovered(b.id) ? ' active' : ''}`}
              />
            )
          })}
        </g>
        {buckets.map((b, i) => {
          const x = colX(i)
          const r = bandRangeFor(table, b.id)
          const yTop = yForWorld(r.min)
          const yBot = yForWorld(r.max)
          const c = color(b.id)
          return (
            <g
              key={b.id}
              className={`gravity-band-col${anyHovered && !isHovered(b.id) ? ' dim' : ''}${isHovered(b.id) ? ' active' : ''}`}
              onPointerEnter={() => onHover({ axis, bucket: b.id })}
              onPointerLeave={() => { if (!dragRef.current) onHover(null) }}
            >
              <title>{b.label}</title>
              <text x={x} y={PT - 6} textAnchor="middle" className="gravity-band-label" style={{ fill: c }}>{b.abbreviation}</text>
              <line x1={x} y1={PT} x2={x} y2={PB} className="gravity-band-track" />
              <line x1={x} y1={yTop} x2={x} y2={yBot} stroke={c} className="gravity-band-stem" />
              <circle cx={x} cy={yTop} r={DOT_R} fill={c} className="gravity-band-dot"
                onPointerDown={e => handleDown(e, b.id, 'min')} onPointerMove={handleMove} onPointerUp={handleUp} />
              <circle cx={x} cy={yBot} r={DOT_R} fill={c} className="gravity-band-dot"
                onPointerDown={e => handleDown(e, b.id, 'max')} onPointerMove={handleMove} onPointerUp={handleUp} />
            </g>
          )
        })}
      </svg>
    </Plot>
  )
}

// The band force-response curve for this axis — how the pull grows with
// distance outside the rest band — with the (shared) falloff exponent beneath.
const CURVE_TOP_PAD = 4
function AxisCurve({ axis, params, onParamChange }: {
  axis: LayoutAxis
  params: ForceParams
  onParamChange: (patch: Partial<ForceParams>) => void
}) {
  const exp = params.gravityBandExp
  const strength = params[strengthKey(axis)]
  const scale = Math.max(params.gravityX, params.gravityY, 1e-6)
  const points = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const d = i / CURVE_SAMPLES
    const f = (strength / scale) * Math.pow(d, exp) // normalized to the stronger axis
    const px = d * CURVE_W
    const py = CURVE_H - CURVE_TOP_PAD - f * (CURVE_H - 2 * CURVE_TOP_PAD)
    return `${px.toFixed(1)},${py.toFixed(1)}`
  }).join(' ')
  const curves: CurveItem[] = [{ id: axis, points, color: 'var(--color-text)', label: axis.toUpperCase() }]
  return (
    <ForceCurves
      curves={curves}
      xMax={1}
      hoveredId={null}
      onHover={() => {}}
      xLabel="distance"
      yLabel="force"
      ariaLabel={`${axis.toUpperCase()} band force-response curve`}
      exp={{
        value: exp, min: 0.5, max: 3, step: 0.1,
        onChange: v => onParamChange({ gravityBandExp: v }),
        title: 'Band falloff exponent, shared by both axes. 1 = linear (Hooke); higher = softer just outside the band, stiffer far out.',
        popId: 'bandExp',
      }}
    />
  )
}
