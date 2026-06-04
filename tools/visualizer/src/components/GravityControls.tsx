// Gravity-tab controls: a centered Cartesian/Radial mode switch, then one
// section per shaping force. Each section carries its own enable checkbox (in
// the header, next to its controls — not pooled at the top) and an approximate
// governing equation: Band is a "mini world view" pseudo-plot; Topological is a
// depth→pull curve plus strength/exp sliders. Center gravity is the unexplained
// baseline (active only when both toggles are off), so it has no control here.
// See GRAPH_VIEW spec § Gravity / Control Panel.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { BAND_MIN_KEY, BAND_MAX_KEY } from '../graph/simulation'
import type { NodeType } from '../graph/model'
import { NODE_TYPE_REGISTRY } from '../graph/node-types'
import { ForceCurves, CURVE_W, CURVE_H, CURVE_SAMPLES, type CurveItem } from './ForceMap'
import { Plot } from './controls/Plot'
import { Slider } from './controls/Slider'
import { Equation } from './controls/Equation'

// Column order: main ladder first, then the nexus ladder (after a gap).
const COL_ORDER: NodeType[] = [
  'namespace', 'worker', 'workflow', 'activity',
  'nexusEndpoint', 'nexusService', 'nexusOperation',
]
const MAIN_COUNT = 4
const ABBREV: Record<NodeType, string> = {
  namespace: 'NS', worker: 'Wk', workflow: 'Wf', activity: 'Act',
  nexusEndpoint: 'Ep', nexusService: 'Nx', nexusOperation: 'Op',
}

function typeColor(t: NodeType): string {
  return `var(--color-${NODE_TYPE_REGISTRY[t].color.cssVarSuffix})`
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number, step: number) => Math.round(v / step) * step

interface GravityControlProps {
  params: ForceParams
  onParamChange: (key: keyof ForceParams, value: number) => void
  onGravitySet: (partial: Partial<ForceParams>) => void
  hoveredType: NodeType | null
  onHoverType: (t: NodeType | null) => void
}

// ── Band "mini world view" geometry ──────────────────────────────────────────
// The plot is a small world view: vertical = world Y, horizontal = world X. The
// rest regions render as translucent stripes behind everything (full-width
// horizontal per type for the Y bands; full-height vertical for the X band).
// The interactive controls — a vertical two-handle slider per type, placed at an
// evenly-spaced column — sit on top.
const GB_W = 300
const GB_H = 210
const GB_PAD = { top: 16, right: 8, bottom: 2, left: 8 }
const PL = GB_PAD.left
const PR = GB_W - GB_PAD.right
const PT = GB_PAD.top
const PB = GB_H - GB_PAD.bottom
const W_MIN = -600
const W_MAX = 600
const W_STEP = 10
const DOT_R = 5
const SLOTS = COL_ORDER.length + 1 // one gap between main and nexus ladders

const yForWorld = (v: number) => PT + ((v - W_MIN) / (W_MAX - W_MIN)) * (PB - PT)
const valForY = (y: number) => W_MIN + ((y - PT) / (PB - PT)) * (W_MAX - W_MIN)
const xForWorld = (v: number) => PL + ((v - W_MIN) / (W_MAX - W_MIN)) * (PR - PL)
const colSlot = (i: number) => (i < MAIN_COUNT ? i : i + 1)
const colX = (i: number) => PL + ((colSlot(i) + 0.5) / SLOTS) * (PR - PL)

function GravityBandPlot({ params, onParamChange, hoveredType, onHoverType }: GravityControlProps) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const dragRef = React.useRef<{ type: NodeType; edge: 'min' | 'max' } | null>(null)
  const [xbandHover, setXbandHover] = React.useState(false)

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

  const handleDown = (e: React.PointerEvent, type: NodeType, edge: 'min' | 'max') => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { type, edge }
  }
  const handleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const minKey = BAND_MIN_KEY[drag.type]
    const maxKey = BAND_MAX_KEY[drag.type]
    const curMin = params[minKey] as number
    const curMax = params[maxKey] as number
    let v = clamp(snap(valForY(userY(e)), W_STEP), W_MIN, W_MAX)
    if (drag.edge === 'min') onParamChange(minKey, Math.min(v, curMax - W_STEP))
    else onParamChange(maxKey, Math.max(v, curMin + W_STEP))
  }
  const handleUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }

  return (
    <Plot
      yLabel="Y strength"
      ySlider={
        <Slider
          orientation="vertical"
          min={0} max={0.25} step={0.005}
          value={params.gravityY}
          onChange={v => onParamChange('gravityY', v)}
          title="Vertical band-pull strength (scale all)"
          ariaLabel="Vertical band strength"
        />
      }
      bottom={
        <>
          {/* X-range band: horizontal two-handle slider immediately under the plot. */}
          <div
            className="gravity-xband"
            onMouseEnter={() => setXbandHover(true)}
            onMouseLeave={() => setXbandHover(false)}
          >
            <DualRange
              min={W_MIN} max={W_MAX} step={W_STEP}
              valueMin={params.bandXMin} valueMax={params.bandXMax}
              onChangeMin={v => onParamChange('bandXMin', v)}
              onChangeMax={v => onParamChange('bandXMax', v)}
            />
          </div>
          <Slider
            min={0} max={0.25} step={0.005}
            value={params.gravityX}
            onChange={v => onParamChange('gravityX', v)}
            title="Horizontal band-pull strength (scale all)"
            ariaLabel="Horizontal band strength"
          />
          <div className="ctl-plot-xlabel">X strength</div>
        </>
      }
    >
      <svg
        ref={svgRef}
        className="gravity-band-svg"
        viewBox={`0 0 ${GB_W} ${GB_H}`}
        role="group"
        aria-label="Band gravity: a mini world view of the per-type rest bands"
      >
        <rect x={PL} y={PT} width={PR - PL} height={PB - PT} className="gravity-band-bg" />

        {/* Rest-region stripes — the mini world view, behind and inert. */}
        <g className="gravity-band-stripes">
          {COL_ORDER.map(t => {
            const yTop = yForWorld(params[BAND_MIN_KEY[t]] as number)
            const yBot = yForWorld(params[BAND_MAX_KEY[t]] as number)
            const dim = hoveredType !== null && hoveredType !== t
            const active = hoveredType === t
            return (
              <rect
                key={t}
                x={PL} y={yTop} width={PR - PL} height={Math.max(0, yBot - yTop)}
                fill={typeColor(t)}
                className={`gravity-band-stripe${dim ? ' dim' : ''}${active ? ' active' : ''}`}
              />
            )
          })}
          {/* X band: the horizontal range with no gravity, drawn as a vertical stripe. */}
          <rect
            x={xForWorld(params.bandXMin)} y={PT}
            width={Math.max(0, xForWorld(params.bandXMax) - xForWorld(params.bandXMin))} height={PB - PT}
            className={`gravity-xband-stripe${xbandHover ? ' active' : ''}`}
          />
        </g>

        {/* Per-type vertical sliders (track + two handles), on top. */}
        {COL_ORDER.map((t, i) => {
          const x = colX(i)
          const yTop = yForWorld(params[BAND_MIN_KEY[t]] as number)
          const yBot = yForWorld(params[BAND_MAX_KEY[t]] as number)
          const dim = hoveredType !== null && hoveredType !== t
          const active = hoveredType === t
          const color = typeColor(t)
          return (
            <g
              key={t}
              className={`gravity-band-col${dim ? ' dim' : ''}${active ? ' active' : ''}`}
              onPointerEnter={() => onHoverType(t)}
              onPointerLeave={() => { if (!dragRef.current) onHoverType(null) }}
            >
              <text x={x} y={PT - 6} textAnchor="middle" className="gravity-band-label" style={{ fill: color }}>{ABBREV[t]}</text>
              <line x1={x} y1={PT} x2={x} y2={PB} className="gravity-band-track" />
              <line x1={x} y1={yTop} x2={x} y2={yBot} stroke={color} className="gravity-band-stem" />
              <circle
                cx={x} cy={yTop} r={DOT_R} fill={color} className="gravity-band-dot"
                onPointerDown={e => handleDown(e, t, 'min')} onPointerMove={handleMove} onPointerUp={handleUp}
              />
              <circle
                cx={x} cy={yBot} r={DOT_R} fill={color} className="gravity-band-dot"
                onPointerDown={e => handleDown(e, t, 'max')} onPointerMove={handleMove} onPointerUp={handleUp}
              />
            </g>
          )
        })}
      </svg>
    </Plot>
  )
}

type GravitySub = 'band' | 'topological'

export function GravityControls({ params, onParamChange, onGravitySet, hoveredType, onHoverType }: GravityControlProps) {
  const mode = params.gravityMode
  const [sub, setSub] = React.useState<GravitySub>('band')
  return (
    <div className="gravity-controls">
      {/* Cartesian / Radial — shared above the sub-tabs so it stays visible on both. */}
      <div className="gravity-modes-row">
        <div className="gravity-modes" role="tablist" aria-label="Gravity layout mode">
          {(['cartesian', 'radial'] as const).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`gravity-mode-btn${mode === m ? ' active' : ''}`}
              onClick={() => onGravitySet({ gravityMode: m })}
            >
              {m === 'cartesian' ? 'Cartesian' : 'Radial'}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs — each carries its own enable switch, so both forces' on/off
          state is visible at all times even though only one body shows. */}
      <div className="gravity-subtabs" role="tablist" aria-label="Gravity force">
        <GravitySubTab label="Band" active={sub === 'band'} enabled={params.bandEnabled}
          onSelect={() => setSub('band')} onToggle={v => onGravitySet({ bandEnabled: v })} />
        <GravitySubTab label="Topological" active={sub === 'topological'} enabled={params.topologicalEnabled}
          onSelect={() => setSub('topological')} onToggle={v => onGravitySet({ topologicalEnabled: v })} />
      </div>

      {/* Both bodies are mounted and stacked in one grid cell; only the active
          one is visible. The cell sizes to the taller body, so switching sub-tabs
          never resizes the panel (same trick as the main force tabs). */}
      <div className="gravity-bodies">
        <div className={`gravity-body${sub === 'band' ? ' active' : ''}`} aria-hidden={sub !== 'band'}>
          <div className={`gravity-section-tools${params.bandEnabled ? '' : ' inactive'}`}>
            <Equation>{<>F = strength × d<sup>exp</sup></>}</Equation>
            <GravityBandPlot params={params} onParamChange={onParamChange} onGravitySet={onGravitySet} hoveredType={hoveredType} onHoverType={onHoverType} />
            <BandCurves params={params} onParamChange={onParamChange} />
          </div>
        </div>

        <div className={`gravity-body${sub === 'topological' ? ' active' : ''}`} aria-hidden={sub !== 'topological'}>
          <div className={`gravity-section-tools gravity-topo${params.topologicalEnabled ? '' : ' inactive'}`}>
            <Equation>{<>F = strength × depth<sup>exp</sup> × d</>}</Equation>
            <TopologicalCurve exp={params.gravityTopologicalExp} />
            <div className="gravity-slider-row">
              <label className="graph-control-slider-label">strength</label>
              <Slider
                min={0} max={2} step={0.02}
                value={params.gravityDownstream}
                onChange={v => onParamChange('gravityDownstream', v)}
              />
            </div>
            <div className="gravity-slider-row">
              <label className="graph-control-slider-label">exp</label>
              <Slider
                min={1} max={6} step={0.1}
                value={params.gravityTopologicalExp}
                onChange={v => onParamChange('gravityTopologicalExp', v)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// One gravity sub-tab: a sliding on/off switch plus a selectable label. The
// switch toggles the force; clicking the label selects which body is shown.
// They're independent (toggling doesn't switch the view) so both forces' state
// stays legible while you tune one.
function GravitySubTab({ label, active, enabled, onSelect, onToggle }: {
  label: string
  active: boolean
  enabled: boolean
  onSelect: () => void
  onToggle: (v: boolean) => void
}) {
  return (
    <div role="tab" aria-selected={active} className={`gravity-subtab${active ? ' active' : ''}`} onClick={onSelect}>
      <label className={`switch${enabled ? ' on' : ''}`} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} aria-label={`${label} gravity enabled`} />
        <span className="switch-track"><span className="switch-knob" /></span>
      </label>
      <span className="gravity-subtab-label">{label}</span>
    </div>
  )
}

// Band force-response curves: how the band pull grows with distance outside the
// rest band, for the X and Y axes. Both share the falloff `exp`; they differ in
// height by their per-axis strength (so the taller curve is the stiffer axis).
// Heights are normalized to the stronger axis so the relative shape is legible
// even when both strengths are small. Reuses the shared ForceCurves read-out so
// it matches the Pull/Push tabs, with the band `exp` slider beneath.
const BC_TOP_PAD = 4
function BandCurves({
  params, onParamChange,
}: {
  params: ForceParams
  onParamChange: (key: keyof ForceParams, value: number) => void
}) {
  const [hovered, setHovered] = React.useState<string | null>(null)
  const exp = params.gravityBandExp
  const scale = Math.max(params.gravityX, params.gravityY, 1e-6)
  const mk = (strength: number): string =>
    Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
      const d = i / CURVE_SAMPLES
      const f = (strength / scale) * Math.pow(d, exp) // 0..1, normalized to the stronger axis
      const px = d * CURVE_W
      const py = CURVE_H - BC_TOP_PAD - f * (CURVE_H - 2 * BC_TOP_PAD)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    }).join(' ')

  const curves: CurveItem[] = [
    { id: 'y', points: mk(params.gravityY), color: 'var(--color-workflow)', label: 'Y' },
    { id: 'x', points: mk(params.gravityX), color: 'var(--color-activity)', label: 'X' },
  ]

  return (
    <ForceCurves
      curves={curves}
      hoveredId={hovered}
      onHover={setHovered}
      xLabel="distance"
      yLabel="force"
      ariaLabel="Band force-response curves (X and Y)"
      exp={{
        value: exp, min: 0.5, max: 3, step: 0.1,
        onChange: v => onParamChange('gravityBandExp', v),
        title: 'Band falloff exponent. 1 = linear (Hooke); higher = softer just outside the band, stiffer far out.',
      }}
    />
  )
}

// Read-only display of the depth -> pull shaping curve (pull = depth^exp on the
// normalized [0,1] range), so the exp knob is legible. Axes are labelled:
// x = depth (root-ness), y = pull (resulting force weight).
const TC_W = 220
const TC_H = 96
const TC_PAD = 8
const TC_PAD_L = 16 // extra room on the left for the rotated y-axis label
function TopologicalCurve({ exp }: { exp: number }) {
  const x0 = TC_PAD_L
  const x1 = TC_W - TC_PAD
  const y0 = TC_PAD
  const y1 = TC_H - TC_PAD - 12 // leave room for the x label
  const yMid = (y0 + y1) / 2
  const N = 48
  const points = Array.from({ length: N + 1 }, (_, i) => {
    const s = i / N
    const w = Math.pow(s, exp)
    return `${(x0 + s * (x1 - x0)).toFixed(1)},${(y1 - w * (y1 - y0)).toFixed(1)}`
  }).join(' ')
  return (
    <svg className="gravity-topo-curve" viewBox={`0 0 ${TC_W} ${TC_H}`} role="img" aria-label="Depth-to-pull contrast curve">
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="spring-curve-frame" />
      <polyline points={points} className="gravity-topo-curve-line" />
      <text x={(x0 + x1) / 2} y={TC_H - 1} textAnchor="middle" className="gravity-topo-curve-axis">depth</text>
      <text x={5} y={yMid} textAnchor="middle" className="gravity-topo-curve-axis" transform={`rotate(-90 5 ${yMid})`}>pull</text>
    </svg>
  )
}

// Minimal two-handle range slider (the gravity X band).
function DualRange({
  min, max, step, valueMin, valueMax, onChangeMin, onChangeMax,
}: {
  min: number; max: number; step: number
  valueMin: number; valueMax: number
  onChangeMin: (v: number) => void; onChangeMax: (v: number) => void
}) {
  const range = max - min
  const minPct = ((valueMin - min) / range) * 100
  const widthPct = Math.max(0, ((valueMax - valueMin) / range) * 100)
  return (
    <div className="dual-range dual-range-namespace">
      <div className="dual-range-track" />
      <div className="dual-range-fill" style={{ left: `${minPct}%`, width: `${widthPct}%` }} />
      <input
        type="range" className="dual-range-input dual-range-input-low"
        min={min} max={max} step={step} value={valueMin}
        onChange={e => onChangeMin(Math.min(Number(e.target.value), valueMax - step))}
      />
      <input
        type="range" className="dual-range-input dual-range-input-high"
        min={min} max={max} step={step} value={valueMax}
        onChange={e => onChangeMax(Math.max(Number(e.target.value), valueMin + step))}
      />
    </div>
  )
}
