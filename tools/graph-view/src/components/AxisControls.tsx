// One layout axis of the Gravity tab — X or Y — as a sub-tab body: which
// mapping or scalar the axis keys on, one column per bucket carrying the bucket's rest
// band as two handles (R30), the axis's own strength in the left gutter (R32),
// and the band force curve beneath (R33). Both axes are this one component:
// they are the same kind of thing (T22), so they get the same surface.
// See GRAPH_VIEW.md § Control Panel → GRAVITY.

import React from 'react'
import type { ForceParams, LayoutAxisOption, AxisTuning, BandRange, LayoutTuning } from '../graph/simulation'
import { TOKEN_CEILING, layoutAxisKey, mappedTuning, withOverride } from '../graph/simulation'
import type { ScalarSpan } from '../graph/scalar'
import type { ResolvedAxis, ResolvedPhysics } from '../graph/forces'
import { bandRangeFor, isScalarAxis } from '../graph/forces'
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
  /** Every axis this one may key on: mappings whose bucket count fits the ceiling, and computed scalars (R28). */
  axes: readonly LayoutAxisOption[]
  /** The buckets some visible node falls in on this axis — the only columns worth drawing (R35). */
  present: ReadonlySet<string>
  onParamChange: (patch: Partial<ForceParams>) => void
  onRelayout: (patch: Partial<ForceParams>) => void
  hovered: GravityHover | null
  onHover: (h: GravityHover | null) => void
}

const tuningKey = (axis: LayoutAxis): 'bandX' | 'bandY' => (axis === 'x' ? 'bandX' : 'bandY')
const strengthKey = (axis: LayoutAxis): 'gravityX' | 'gravityY' => (axis === 'x' ? 'gravityX' : 'gravityY')
// Patches spelled out per axis, so the compiler checks the value against the
// field — a computed key under a cast would let a tuning land in a strength.
const tuningPatch = (axis: LayoutAxis, tuning: LayoutTuning): Partial<ForceParams> =>
  axis === 'x' ? { bandX: tuning } : { bandY: tuning }
const strengthPatch = (axis: LayoutAxis, value: number): Partial<ForceParams> =>
  axis === 'x' ? { gravityX: value } : { gravityY: value }

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

// The plot is vertical for both axes. For Y it reads as the screen does —
// a larger y is lower. For X it reads as a rotated chart: a larger x (further
// right on the canvas) is higher, so a scalar's "1 at the right" sits at the
// top of the X plot as "1 at the top" sits at the top of the Y plot.
const yForWorld = (axis: LayoutAxis, v: number) => {
  const t = (v - W_MIN) / (W_MAX - W_MIN)
  return axis === 'y' ? PT + t * (PB - PT) : PB - t * (PB - PT)
}
const valForY = (axis: LayoutAxis, y: number) => {
  const t = axis === 'y' ? (y - PT) / (PB - PT) : (PB - y) / (PB - PT)
  return W_MIN + t * (W_MAX - W_MIN)
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number, step: number) => Math.round(v / step) * step

export function AxisControls({ axis, params, resolved, axes, present, onParamChange, onRelayout, hovered, onHover }: AxisControlsProps) {
  const ontology = useOntology()
  const key = tuningKey(axis)
  const tuning: LayoutTuning = params[key]
  const table = axis === 'x' ? resolved.bandX : resolved.bandY
  const strength = params[strengthKey(axis)]
  const label = axis.toUpperCase()
  const ignored = axis === 'x' && params.radial
  const current = layoutAxisKey(tuning)

  const onAxisChange = (value: string) => {
    if (value === current) return
    const chosen = axes.find(o => layoutAxisKey(o) === value)
    if (!chosen) return
    // A new axis starts from the taxonomy: the declared bands on a mapping's
    // buckets, or the declared extent as a scalar's span (nothing stored).
    onRelayout(tuningPatch(axis, chosen.kind === 'scalar'
      ? { scalar: chosen.scalar.id }
      : { mapping: chosen.option.mapping, overrides: new Map() }))
  }

  return (
    <div className={`gv-gravity-section-tools${strength > 0 && !ignored ? '' : ' inactive'}`}>
      {/* The equation varies by kind (R29): outside a band, or away from the scalar's point. */}
      <Equation>{isScalarAxis(table)
        ? <>F = <FormulaValue id={`bandStrength${label}`}>strength</FormulaValue> × d<sup><FormulaValue id="bandExp">exp</FormulaValue></sup>, d = |p − p<sub>0</sub> − s·(p<sub>1</sub> − p<sub>0</sub>)|</>
        : <>F = <FormulaValue id={`bandStrength${label}`}>strength</FormulaValue> × d<sup><FormulaValue id="bandExp">exp</FormulaValue></sup></>}</Equation>

      <div className="gv-axis-row">
        <label className="gv-axis-label" htmlFor={`gravity-axis-${axis}`}>axis</label>
        <select
          id={`gravity-axis-${axis}`}
          className="gv-axis-select"
          value={current}
          title={`What the ${label} axis keys on: one column per bucket of a mapping, or a computed scalar as a gradient`}
          onChange={e => onAxisChange(e.target.value)}
        >
          {axes.map(o => o.kind === 'scalar'
            ? <option key={layoutAxisKey(o)} value={layoutAxisKey(o)} title={o.scalar.tooltip}>{o.scalar.label} — computed</option>
            : <option key={layoutAxisKey(o)} value={layoutAxisKey(o)} disabled={o.option.pushTokens > TOKEN_CEILING}>
                {o.option.pushTokens > TOKEN_CEILING ? `${o.option.mapping.label} — ${o.option.pushTokens} columns (max ${TOKEN_CEILING})` : `${o.option.mapping.label} (${o.option.pushTokens})`}
              </option>)}
        </select>
        {ignored && <span className="gv-axis-note">ignored in radial</span>}
      </div>

      {/* The resolved axis decides the kind; the tuning is narrowed to match, loudly. */}
      {isScalarAxis(table) ? (
        <ScalarPlot
          axis={axis}
          radial={params.radial}
          label={table.scalar.label}
          tooltip={table.scalar.tooltip}
          span={table.span}
          strength={strength}
          onStrength={v => onParamChange(strengthPatch(axis, v))}
          onSpan={span => onParamChange(tuningPatch(axis, { scalar: table.scalar.id, span }))}
        />
      ) : (
        <AxisPlot
          axis={axis}
          radial={params.radial}
          tuning={mappedTuning(tuning)}
          table={table}
          present={present}
          strength={strength}
          onStrength={v => onParamChange(strengthPatch(axis, v))}
          onBand={(bucket, next) => onParamChange(tuningPatch(axis, withOverride(mappedTuning(tuning), bucket, next)))}
          hovered={hovered}
          onHover={onHover}
          color={bucket => bucketColor(ontology, mappedTuning(tuning).mapping, bucket)}
        />
      )}

      <AxisCurve axis={axis} params={params} onParamChange={onParamChange} />
    </div>
  )
}

// A scalar axis as a control: a gradient from the end where a score of 0
// rests to the end where 1 rests, in place of the columns (R31). The two ends
// are handles that move freely — past each other flips the axis. Where each
// node sits along it is the scalar's answer, not the user's.
function ScalarPlot({ axis, radial, label, tooltip, span, strength, onStrength, onSpan }: {
  axis: LayoutAxis
  radial: boolean
  label: string
  tooltip: string
  span: ScalarSpan
  strength: number
  onStrength: (v: number) => void
  onSpan: (span: ScalarSpan) => void
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const dragRef = React.useRef<keyof ScalarSpan | null>(null)
  const axisLabel = axis.toUpperCase()
  const x = (PL + PR) / 2
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
  const handleDown = (e: React.PointerEvent, end: keyof ScalarSpan) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = end
  }
  const handleMove = (e: React.PointerEvent) => {
    const end = dragRef.current
    if (!end) return
    onSpan({ ...span, [end]: clamp(snap(valForY(axis, userY(e)), W_STEP), W_MIN, W_MAX) })
  }
  const handleUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }
  const y0 = yForWorld(axis, span.zero)
  const y1 = yForWorld(axis, span.one)
  const gradientId = React.useId()
  const handle = (end: keyof ScalarSpan, y: number) => (
    <g key={end}>
      <text x={PL + 10} y={y + 4} textAnchor="middle" className="gv-gravity-band-label">{end === 'zero' ? '0' : '1'}</text>
      <circle cx={x} cy={y} r={DOT_R} className="gv-gravity-band-dot gv-gravity-scalar-dot"
        onPointerDown={e => handleDown(e, end)} onPointerMove={handleMove} onPointerUp={handleUp}>
        <title>{`where a score of ${end === 'zero' ? 0 : 1} rests on ${axisLabel}: ${span[end]}`}</title>
      </circle>
    </g>
  )
  return (
    <Plot
      yLabel={`${axisLabel} strength`}
      ySlider={
        <Slider
          orientation="vertical"
          min={0} max={0.25} step={0.005}
          value={strength}
          onChange={onStrength}
          title={`${axisLabel} pull strength (scale all); 0 switches the axis off`}
          ariaLabel={`${axisLabel} strength`}
          popId={`bandStrength${axisLabel}`}
        />
      }
      bottom={<div className="gv-ctl-plot-xlabel">{radial && axis === 'y' ? 'ring: the span’s low end innermost' : `${axisLabel} position: ${label}, 0 → 1`}</div>}
    >
      <svg
        ref={svgRef}
        className="gv-gravity-band-svg"
        viewBox={`0 0 ${AP_W} ${AP_H}`}
        role="group"
        aria-label={`${axisLabel} axis: ${label}, a computed scalar; drag the 0 and 1 ends`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1={y0} x2="0" y2={y1} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--gv-color-text-muted)" stopOpacity="0.15" />
            <stop offset="1" stopColor="var(--gv-color-text)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <rect x={PL} y={PT} width={PR - PL} height={PB - PT} className="gv-gravity-band-bg" />
        <title>{tooltip}</title>
        <rect x={PL + 24} y={Math.min(y0, y1)} width={PR - PL - 48} height={Math.abs(y1 - y0)} fill={`url(#${gradientId})`} className="gv-gravity-scalar-gradient" />
        <text x={x} y={PT - 6} textAnchor="middle" className="gv-gravity-band-label">{label}</text>
        <line x1={x} y1={PT} x2={x} y2={PB} className="gv-gravity-band-track" />
        {handle('zero', y0)}
        {handle('one', y1)}
      </svg>
    </Plot>
  )
}

function AxisPlot({ axis, radial, tuning, table, present, strength, onStrength, onBand, hovered, onHover, color }: {
  axis: LayoutAxis
  radial: boolean
  tuning: AxisTuning<BandRange>
  table: ResolvedAxis<BandRange>
  present: ReadonlySet<string>
  strength: number
  onStrength: (v: number) => void
  onBand: (bucket: string, next: BandRange) => void
  hovered: GravityHover | null
  onHover: (h: GravityHover | null) => void
  color: (bucket: string) => string
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const dragRef = React.useRef<{ bucket: string; edge: 'min' | 'max' } | null>(null)
  // Only the buckets the visible set holds (R35); the tuning keeps the rest.
  const buckets = tuning.mapping.buckets.filter(b => present.has(b.id))
  const colX = (i: number) => PL + ((i + 0.5) / Math.max(1, buckets.length)) * (PR - PL)
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
    const v = clamp(snap(valForY(axis, userY(e)), W_STEP), W_MIN, W_MAX)
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
      bottom={
        // In radial, Y reads each bucket's band CENTRE as its ring (width is
        // ignored, equal centres share a ring); the label says so in the same
        // slot, so the body does not change height when the mode flips.
        <div className="gv-ctl-plot-xlabel">{radial && axis === 'y' ? 'ring: the band centre, innermost first' : `${label} position`}</div>
      }
    >
      <svg
        ref={svgRef}
        className="gv-gravity-band-svg"
        viewBox={`0 0 ${AP_W} ${AP_H}`}
        role="group"
        aria-label={`${label} axis: one column per bucket, its rest band as two handles`}
      >
        <rect x={PL} y={PT} width={PR - PL} height={PB - PT} className="gv-gravity-band-bg" />
        <g className="gv-gravity-band-stripes">
          {buckets.map((b, i) => {
            const r = bandRangeFor(table, b.id)
            const yTop = yForWorld(axis, r.min)
            const yBot = yForWorld(axis, r.max)
            const half = (PR - PL) / buckets.length / 2
            return (
              <rect
                key={b.id}
                x={colX(i) - half} y={yTop} width={half * 2} height={Math.max(0, yBot - yTop)}
                fill={color(b.id)}
                className={`gv-gravity-band-stripe${anyHovered && !isHovered(b.id) ? ' dim' : ''}${isHovered(b.id) ? ' active' : ''}`}
              />
            )
          })}
        </g>
        {buckets.map((b, i) => {
          const x = colX(i)
          const r = bandRangeFor(table, b.id)
          const yTop = yForWorld(axis, r.min)
          const yBot = yForWorld(axis, r.max)
          const c = color(b.id)
          return (
            <g
              key={b.id}
              className={`gv-gravity-band-col${anyHovered && !isHovered(b.id) ? ' dim' : ''}${isHovered(b.id) ? ' active' : ''}`}
              onPointerEnter={() => onHover({ axis, bucket: b.id })}
              onPointerLeave={() => { if (!dragRef.current) onHover(null) }}
            >
              <title>{b.label}</title>
              <text x={x} y={PT - 6} textAnchor="middle" className="gv-gravity-band-label" style={{ fill: c }}>{b.abbreviation}</text>
              <line x1={x} y1={PT} x2={x} y2={PB} className="gv-gravity-band-track" />
              <line x1={x} y1={yTop} x2={x} y2={yBot} stroke={c} className="gv-gravity-band-stem" />
              <circle cx={x} cy={yTop} r={DOT_R} fill={c} className="gv-gravity-band-dot"
                onPointerDown={e => handleDown(e, b.id, 'min')} onPointerMove={handleMove} onPointerUp={handleUp} />
              <circle cx={x} cy={yBot} r={DOT_R} fill={c} className="gv-gravity-band-dot"
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
  const curves: CurveItem[] = [{ id: axis, points, color: 'var(--gv-color-text)', label: axis.toUpperCase() }]
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
