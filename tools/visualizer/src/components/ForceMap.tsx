// Shared force-control primitives, reused by both the Pull (spring) and Push
// (charge) tabs. These are purely presentational/interactive: all physics
// math (what each axis means, how curve points are computed) lives in the
// per-tab wrappers (SpringControls.tsx, ChargeControls.tsx) that feed these.
//
//   ForceMap2D  — a 2D map of draggable tokens on shared axes, with a global
//                 "scale all" slider on each axis. A token with a single
//                 colour renders a solid dot (Push); two colours render a
//                 split dot (Pull).
//   ForceCurves — a boxed read-out plot that renders pre-computed polylines
//                 (per item), an optional baseline, and per-item vertical
//                 markers, with one global `exp` slider beneath.
//
// Both reuse the `.spring-*` / `.force-curve-*` CSS classes (see index.css).

import React from 'react'
import { Plot } from './controls/Plot'
import { Slider } from './controls/Slider'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number, step: number) => Math.round(v / step) * step

// ── Map geometry (viewBox units) ─────────────────────────────────────────────
const MAP_W = 300
const MAP_H = 200
// Breathing room so a token at an axis extreme sits inside the plot box instead
// of straddling its edge. The gridlines/box stay at the full viewBox (so the
// sliders still align to it); only the token positions inset.
const MAP_PAD = 12
const MAP_PW = MAP_W - 2 * MAP_PAD
const MAP_PH = MAP_H - 2 * MAP_PAD
const TOKEN_R = 7

export interface AxisSpec {
  min: number
  max: number
  step: number
  label: string
}

// A global "scale all" slider that sits along one axis of the map.
export interface GlobalSlider {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  title?: string
  ariaLabel?: string
}

export interface MapToken {
  // Stable id used to link hover across the map, the curves, and the canvas.
  id: string
  // Data-space coordinates (in the axis units).
  x: number
  y: number
  // A single colour → solid token; colorA + colorB → split token.
  colorA: string
  colorB?: string
  // Solid outline (dependency) vs dashed outline (containment), mirroring the
  // canvas edge styling. For Push every token is solid.
  outline: 'solid' | 'dashed'
  label: string
  tooltip?: string
}

export function ForceMap2D({
  tokens, xAxis, yAxis, onDrag, hoveredId, onHover, xSlider, ySlider, ariaLabel,
}: {
  tokens: MapToken[]
  xAxis: AxisSpec
  yAxis: AxisSpec
  onDrag: (id: string, x: number, y: number) => void
  hoveredId: string | null
  onHover: (id: string | null) => void
  xSlider: GlobalSlider
  ySlider: GlobalSlider
  ariaLabel: string
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const draggingRef = React.useRef<string | null>(null)

  // Data ↔ viewBox mappings (token positions are inset by MAP_PAD).
  const xForVal = (v: number) =>
    MAP_PAD + ((v - xAxis.min) / (xAxis.max - xAxis.min)) * MAP_PW
  const yForVal = (v: number) =>
    (MAP_H - MAP_PAD) - ((v - yAxis.min) / (yAxis.max - yAxis.min)) * MAP_PH
  const valForX = (px: number) =>
    xAxis.min + ((px - MAP_PAD) / MAP_PW) * (xAxis.max - xAxis.min)
  const valForY = (py: number) =>
    yAxis.min + (((MAP_H - MAP_PAD) - py) / MAP_PH) * (yAxis.max - yAxis.min)

  // Pointer event → SVG user-space coords. getScreenCTM handles any responsive
  // scaling so drag tracking stays accurate.
  const toUser = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const handleDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    draggingRef.current = id
  }

  const handleMove = (e: React.PointerEvent) => {
    const id = draggingRef.current
    if (!id) return
    const { x, y } = toUser(e)
    const vx = clamp(snap(valForX(x), xAxis.step), xAxis.min, xAxis.max)
    const vy = clamp(snap(valForY(y), yAxis.step), yAxis.min, yAxis.max)
    onDrag(id, vx, vy)
  }

  const handleUp = (e: React.PointerEvent) => {
    draggingRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }

  // Gridlines frame the plot at the viewBox edges + centre (decorative box,
  // independent of the padded token mapping above).
  const vGrid = [0, MAP_W / 2, MAP_W]
  const hGrid = [0, MAP_H / 2, MAP_H]

  return (
    <Plot
      yLabel={yAxis.label}
      ySlider={
        <Slider
          orientation="vertical"
          min={ySlider.min} max={ySlider.max} step={ySlider.step}
          value={ySlider.value}
          onChange={ySlider.onChange}
          title={ySlider.title}
          ariaLabel={ySlider.ariaLabel}
        />
      }
      bottom={
        <>
          <Slider
            min={xSlider.min} max={xSlider.max} step={xSlider.step}
            value={xSlider.value}
            onChange={xSlider.onChange}
            title={xSlider.title}
            ariaLabel={xSlider.ariaLabel}
          />
          <div className="ctl-plot-xlabel">{xAxis.label}</div>
        </>
      }
    >
      <svg
        ref={svgRef}
        className="spring-map-svg"
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        role="group"
        aria-label={ariaLabel}
      >
        <rect x={0} y={0} width={MAP_W} height={MAP_H} className="spring-plot-bg" />
        {vGrid.map(x => (
          <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={MAP_H} className="spring-grid" />
        ))}
        {hGrid.map(y => (
          <line key={`gy${y}`} x1={0} y1={y} x2={MAP_W} y2={y} className="spring-grid" />
        ))}

        {tokens.map(token => {
          const cx = xForVal(token.x)
          const cy = yForVal(token.y)
          const dim = hoveredId !== null && hoveredId !== token.id
          const active = hoveredId === token.id
          return (
            <g
              key={token.id}
              transform={`translate(${cx} ${cy})`}
              className={`spring-token${dim ? ' dim' : ''}${active ? ' active' : ''}`}
              onPointerDown={e => handleDown(e, token.id)}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerEnter={() => onHover(token.id)}
              onPointerLeave={() => { if (!draggingRef.current) onHover(null) }}
            >
              {token.tooltip && <title>{token.tooltip}</title>}
              {token.colorB === undefined ? (
                <circle r={TOKEN_R} fill={token.colorA} />
              ) : (
                <>
                  <path d={`M0,${-TOKEN_R} A${TOKEN_R},${TOKEN_R} 0 0 0 0,${TOKEN_R} Z`} fill={token.colorA} />
                  <path d={`M0,${-TOKEN_R} A${TOKEN_R},${TOKEN_R} 0 0 1 0,${TOKEN_R} Z`} fill={token.colorB} />
                </>
              )}
              <circle
                r={TOKEN_R}
                fill="none"
                className="spring-token-outline"
                strokeDasharray={token.outline === 'dashed' ? '2 2' : undefined}
              />
              <text y={TOKEN_R + 11} textAnchor="middle" className="spring-token-label">{token.label}</text>
            </g>
          )
        })}
      </svg>
    </Plot>
  )
}

// ── Force-curve read-out (viewBox units) ─────────────────────────────────────
// Exported so wrappers compute their polyline points in this coordinate space.
export const CURVE_W = 300
export const CURVE_H = 130
export const CURVE_SAMPLES = 56

export interface CurveItem {
  id: string
  // Polyline points string, pre-computed by the wrapper in viewBox coords.
  points: string
  color: string
  // Optional vertical marker (e.g. rest length / core radius) in viewBox x.
  markerX?: number
  // Optional short label drawn at the curve's end point (e.g. "X" / "Y" for the
  // band curves, where there is no map token to link the identity to).
  label?: string
}

// Parse the last "x,y" pair out of a polyline points string.
function lastPoint(points: string): { x: number; y: number } | null {
  const pts = points.trim().split(/\s+/)
  const last = pts[pts.length - 1]?.split(',')
  if (!last || last.length < 2) return null
  return { x: Number(last[0]), y: Number(last[1]) }
}

export function ForceCurves({
  curves, baselineY, hoveredId, onHover, xLabel, yLabel, exp, ariaLabel,
}: {
  curves: CurveItem[]
  // y of an optional horizontal baseline; omit for none.
  baselineY?: number
  hoveredId: string | null
  onHover: (id: string | null) => void
  xLabel: string
  yLabel: string
  exp: GlobalSlider & { label?: string }
  ariaLabel: string
}) {
  return (
    <div className="spring-curves">
      <div className="spring-axis-label spring-curves-axis-y">{yLabel}</div>

      <svg
        className="spring-curves-svg"
        viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
        role="img"
        aria-label={ariaLabel}
      >
        <rect x={0} y={0} width={CURVE_W} height={CURVE_H} className="spring-curve-frame" />
        {baselineY !== undefined && (
          <line x1={0} y1={baselineY} x2={CURVE_W} y2={baselineY} className="spring-curve-baseline" />
        )}

        {curves.filter(c => c.id === hoveredId && c.markerX !== undefined).map(c => (
          <line key={`m${c.id}`} x1={c.markerX} y1={0} x2={c.markerX} y2={CURVE_H} className="spring-curve-restmark" />
        ))}

        {curves.map(c => {
          const dim = hoveredId !== null && hoveredId !== c.id
          const active = hoveredId === c.id
          return (
            <g key={c.id} className={`spring-curve${dim ? ' dim' : ''}${active ? ' active' : ''}`}>
              <polyline
                points={c.points}
                className="spring-curve-hit"
                onPointerEnter={() => onHover(c.id)}
                onPointerLeave={() => onHover(null)}
              />
              <polyline
                points={c.points}
                className="spring-curve-line"
                style={{ stroke: c.color }}
              />
              {c.label && (() => {
                const p = lastPoint(c.points)
                if (!p) return null
                return (
                  <text
                    x={Math.min(p.x + 4, CURVE_W - 2)}
                    y={clamp(p.y, 9, CURVE_H - 2)}
                    className="spring-curve-label"
                    style={{ fill: c.color }}
                    textAnchor="end"
                  >
                    {c.label}
                  </text>
                )
              })()}
            </g>
          )
        })}
      </svg>

      <div className="spring-axis-label spring-curves-axis-x">{xLabel}</div>

      <div className="spring-curves-exp" title={exp.title}>
        <span className="spring-exp-label">{exp.label ?? 'exp'}</span>
        <Slider
          min={exp.min} max={exp.max} step={exp.step}
          value={exp.value}
          onChange={exp.onChange}
        />
      </div>
    </div>
  )
}
