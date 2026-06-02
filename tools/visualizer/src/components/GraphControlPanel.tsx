// Collapsible control panel for graph force parameters and simulation controls.
// Organized by force equation — each section shows its equation, then relevant sliders.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { BAND_MIN_KEY, BAND_MAX_KEY } from '../graph/simulation'
import type { NodeType } from '../graph/model'
import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY, sliderLabelFor } from '../graph/node-types'
import { SpringMap, SpringCurves } from './SpringControls'
import { ChargeMap, ChargeCurves } from './ChargeControls'

export type ForceSection = 'push' | 'pull' | 'gravity' | 'dynamics' | null

// The four force tabs. Unlike ForceSection, a tab is always one of these —
// there is no "null" tab; exactly one section is shown at a time.
type ForceTab = 'push' | 'pull' | 'gravity' | 'dynamics'

const FORCE_TABS: { id: ForceTab; label: string }[] = [
  { id: 'push', label: 'Push' },
  { id: 'pull', label: 'Pull' },
  { id: 'gravity', label: 'Gravity' },
  { id: 'dynamics', label: 'Dynamics' },
]

interface GraphControlPanelProps {
  params: ForceParams
  onParamChange: (key: keyof ForceParams, value: number) => void
  // Shared "keep the simulation warm while tuning" signal. Fired alongside
  // every force-control edit so the layout responds live. See GraphView's
  // handleForceAdjust.
  onAdjust: () => void
  onActiveSection: (section: ForceSection) => void
  onActiveChargeType: (nodeType: NodeType | null) => void
  onActiveGravityType: (nodeType: NodeType | null) => void
  // The hovered/active pull edge category (its k-field key), forwarded to the
  // canvas so only that edge category is highlighted while tuning it.
  onActivePullEdge: (key: string | null) => void
}

interface SliderDef {
  key: keyof ForceParams
  label: string
  min: number
  max: number
  step: number
  tooltip: string
}

// --- PUSH section ---
//
// The Push tab's controls live in ChargeControls: a 2D charge map (per-type
// charge/core-radius tokens + the two global "scale all" multipliers along the
// axes) and a charge-falloff visualization (which hosts the global `exp`).

// --- PULL section ---
//
// The Pull tab's controls live in SpringControls: a 2D spring map (per-edge
// stiffness/length tokens + the two global "scale all" multipliers along the
// axes) and a force-curve visualization (which hosts the global `exp`).

// --- GRAVITY section sliders ---
//
// Hierarchical gravity decomposes into one axis-strength per dimension plus
// a per-type Y "rest band". The strengths sit on the same range so they're
// directly comparable; the bands all share a wide Y range so the user can
// re-stack the hierarchy by dragging band edges around a common axis.

const GRAVITY_STRENGTH_SLIDERS: SliderDef[] = [
  { key: 'gravityX', label: 'X strength', min: 0, max: 0.2, step: 0.005,
    tooltip: 'Pull toward the nearest edge of the global X band' },
  { key: 'gravityY', label: 'Y strength', min: 0, max: 0.2, step: 0.005,
    tooltip: 'Pull toward the nearest edge of each node type\u2019s Y band' },
  { key: 'gravityDownstream', label: 'Downstream Y', min: 0, max: 0.2, step: 0.005,
    tooltip: 'Pull toward a Y position derived from outgoing dependency reach (high reach \u2192 up). Layered on top of the per-type Y band.' },
]

interface GravityBandDef {
  label: string
  nodeType: NodeType
  minKey: keyof ForceParams
  maxKey: keyof ForceParams
  tooltip: string
}

const BAND_Y_MIN = -600
const BAND_Y_MAX = 600
const BAND_Y_STEP = 10

// Enumerate band sliders from the registry. Order matches PUSH_CHARGE_SLIDERS
// so both sections read as the same hierarchy, top to bottom.
const GRAVITY_BAND_SLIDERS: GravityBandDef[] = ALL_NODE_TYPES.map(t => ({
  label: sliderLabelFor(t),
  nodeType: t,
  minKey: BAND_MIN_KEY[t],
  maxKey: BAND_MAX_KEY[t],
  tooltip: `Y band where ${NODE_TYPE_REGISTRY[t].label.toLowerCase()} nodes feel zero gravity`,
}))

// --- DYNAMICS section sliders ---
//
// Tightened ranges so each default sits well inside its slider:
//   friction default 0.40 in 0.05–0.95
//   cooling  default 0.005 in 0.0005–0.02
//   threshold default 0.001 in 0–0.005

const DYNAMICS_SLIDERS: SliderDef[] = [
  { key: 'velocityDecay', label: 'friction', min: 0.05, max: 0.95, step: 0.05,
    tooltip: 'Damping factor per tick. Higher = more friction' },
  { key: 'alphaDecay', label: 'cooling', min: 0.0005, max: 0.02, step: 0.0005,
    tooltip: 'Energy lost per tick. Higher = settles faster' },
  { key: 'alphaMin', label: 'threshold', min: 0, max: 0.005, step: 0.0001,
    tooltip: 'Energy level below which simulation pauses' },
]

export function GraphControlPanel({
  params, onParamChange, onAdjust,
  onActiveSection,
  onActiveChargeType, onActiveGravityType, onActivePullEdge,
}: GraphControlPanelProps) {
  const [open, setOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<ForceTab>('push')
  // Links the spring map and the force-curve viz: hovering a token in one
  // brightens the matching curve in the other. The key (an edge category's
  // k-field) is also forwarded to the canvas so only that category's edges
  // highlight while tuning.
  const [hoveredPullEdge, setHoveredPullEdge] = React.useState<string | null>(null)
  const handleHoverPullEdge = React.useCallback((key: string | null) => {
    setHoveredPullEdge(key)
    onActivePullEdge(key)
  }, [onActivePullEdge])

  // Links the charge map and the charge-falloff viz: hovering a token in one
  // brightens the matching curve in the other. The node type is also forwarded
  // to the canvas so only that type's charge field rings highlight while tuning.
  const [hoveredChargeType, setHoveredChargeType] = React.useState<NodeType | null>(null)
  const handleHoverChargeType = React.useCallback((t: NodeType | null) => {
    setHoveredChargeType(t)
    onActiveChargeType(t)
  }, [onActiveChargeType])

  // Single funnel for every force control's edits. Routing all controls
  // through one wrapper means the "nudge the simulation" behaviour is
  // defined once and inherited by every present and future control
  // (sliders, dual-range bands, upcoming 2D fields) — no per-control wiring,
  // no chance of a control forgetting to keep the layout warm.
  const emitParamChange = React.useCallback((key: keyof ForceParams, value: number) => {
    onParamChange(key, value)
    onAdjust()
  }, [onParamChange, onAdjust])

  return (
    <div className={`graph-control-panel ${open ? 'open' : ''}`}>
      <button
        className="graph-control-panel-toggle"
        onClick={() => setOpen(!open)}
        title="Toggle control panel"
      >
        {open ? '▼ Forces' : '▶ Forces'}
        {open && (
          <span
            className="graph-control-help-btn"
            onClick={e => { e.stopPropagation(); setHelpOpen(!helpOpen) }}
            title="How the simulation works"
          >
            ?
          </span>
        )}
      </button>

      {open && helpOpen && (
        <div className="graph-control-help-popover">
          <pre className="graph-control-help-text">{HELP_TEXT}</pre>
        </div>
      )}

      {open && (
        <div className="graph-control-panel-body">
          {/* Force tabs — only one section is shown at a time. */}
          <div className="graph-control-tabs" role="tablist">
            {FORCE_TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`graph-control-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* All four sections are always mounted and stacked in the same grid
              cell; only the active one is visible. The grid auto-sizes to the
              tallest/widest tab, so the panel never resizes when switching
              tabs — the browser computes the "max required space" for us. */}
          <div className="graph-control-sections">
            {/* PUSH section */}
            <SectionSlot active={activeTab === 'push'}>
              <EquationSection
                subtitle=""
                equation={
                  <span className="eq-line">
                    F =
                    <span className="eq-frac">
                      <span className="eq-num">charge</span>
                      <span className="eq-den">(d² + r²)<sup>exp</sup></span>
                    </span>
                  </span>
                }
                onHover={h => onActiveSection(h ? 'push' : null)}
              >
                <ChargeMap
                  params={params}
                  onParamChange={emitParamChange}
                  hoveredType={hoveredChargeType}
                  onHoverType={handleHoverChargeType}
                />
                <ChargeCurves
                  params={params}
                  onParamChange={emitParamChange}
                  hoveredType={hoveredChargeType}
                  onHoverType={handleHoverChargeType}
                />
              </EquationSection>
            </SectionSlot>

            {/* PULL section */}
            <SectionSlot active={activeTab === 'pull'}>
              <EquationSection
                subtitle=""
                equation={
                  <span className="eq-line">
                    F = stiffness ×
                    <span className="eq-frac">
                      <span className="eq-num">(d − length)<sup>exp</sup></span>
                      <span className="eq-den">d</span>
                    </span>
                  </span>
                }
                onHover={h => onActiveSection(h ? 'pull' : null)}
              >
                <SpringMap
                  params={params}
                  onParamChange={emitParamChange}
                  hoveredEdge={hoveredPullEdge}
                  onHoverEdge={handleHoverPullEdge}
                />
                <SpringCurves
                  params={params}
                  onParamChange={emitParamChange}
                  hoveredEdge={hoveredPullEdge}
                  onHoverEdge={handleHoverPullEdge}
                />
              </EquationSection>
            </SectionSlot>

            {/* GRAVITY section */}
            <SectionSlot active={activeTab === 'gravity'}>
              <EquationSection
                subtitle="hierarchical anchor"
                equation={'F\u2093 = \u03B1 \u00D7 X \u00D7 (0 \u2212 x)\nF\u1d67 = \u03B1 \u00D7 Y \u00D7 (band \u2212 y) when y outside band'}
                onHover={h => { onActiveSection(h ? 'gravity' : null); if (!h) onActiveGravityType(null) }}
              >
                {GRAVITY_STRENGTH_SLIDERS.map(s => (
                  <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => emitParamChange(s.key, v)} />
                ))}
                <div className="graph-control-sub-header">
                  <span className="graph-control-sub-label">Axis</span>
                  <span className="graph-control-sub-label">X band (left \u2192 right)</span>
                </div>
                <div className="graph-control-band-row">
                  <span className="graph-control-band-label">X</span>
                  <DualRangeSlider
                    min={BAND_Y_MIN}
                    max={BAND_Y_MAX}
                    step={BAND_Y_STEP}
                    valueMin={params.bandXMin}
                    valueMax={params.bandXMax}
                    onChangeMin={v => emitParamChange('bandXMin', v)}
                    onChangeMax={v => emitParamChange('bandXMax', v)}
                    nodeType="namespace"
                  />
                  <span className="graph-control-band-value">{Math.round(params.bandXMin)}</span>
                  <span className="graph-control-band-value">{Math.round(params.bandXMax)}</span>
                </div>
                <div className="graph-control-sub-header">
                  <span className="graph-control-sub-label">Type</span>
                  <span className="graph-control-sub-label">Y band (top \u2192 bottom)</span>
                </div>
                {GRAVITY_BAND_SLIDERS.map(b => (
                  <div
                    key={b.nodeType}
                    onMouseEnter={() => onActiveGravityType(b.nodeType)}
                    onMouseLeave={() => onActiveGravityType(null)}
                  >
                    <BandRow
                      def={b}
                      valueMin={params[b.minKey] as number}
                      valueMax={params[b.maxKey] as number}
                      onChangeMin={v => emitParamChange(b.minKey, v)}
                      onChangeMax={v => emitParamChange(b.maxKey, v)}
                    />
                  </div>
                ))}
              </EquationSection>
            </SectionSlot>

            {/* DYNAMICS section */}
            <SectionSlot active={activeTab === 'dynamics'}>
              <EquationSection subtitle="" equation={'v \u00D7= friction\n\u03B1 \u2212= cooling, stop at threshold'} onHover={h => onActiveSection(h ? 'dynamics' : null)}>
                {DYNAMICS_SLIDERS.map(s => (
                  <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => emitParamChange(s.key, v)} />
                ))}
              </EquationSection>
            </SectionSlot>
          </div>
        </div>
      )}
    </div>
  )
}

// A stacking slot for one force section. All slots share a single grid cell
// (see .graph-control-sections), so the panel sizes to the tallest section and
// never changes size when switching tabs. Inactive slots stay mounted but
// hidden (visibility + pointer-events) so they still contribute to the grid's
// max size and keep their input state.
function SectionSlot({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className={`graph-control-section-slot${active ? ' active' : ''}`} aria-hidden={!active}>
      {children}
    </div>
  )
}

// One force section's content. The tab bar names the section, so this no
// longer renders its own title — just the optional subtitle, the governing
// equation (transparency), and the controls. The wrapper is still the hover
// target that drives the canvas force-field preview via onHover.
function EquationSection({ subtitle, equation, onHover, children }: {
  subtitle: string
  equation: React.ReactNode
  onHover: (hovered: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div
      className="graph-control-equation-section"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {subtitle && (
        <div className="graph-control-equation-header">
          <span className="graph-control-equation-subtitle">({subtitle})</span>
        </div>
      )}
      {typeof equation === 'string'
        ? <pre className="graph-control-equation-formula">{equation}</pre>
        : <div className="graph-control-equation-formula">{equation}</div>}
      <div className="graph-control-equation-body">
        {children}
      </div>
    </div>
  )
}

function BandRow({ def, valueMin, valueMax, onChangeMin, onChangeMax }: {
  def: GravityBandDef
  valueMin: number
  valueMax: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
}) {
  return (
    <div
      className={`graph-control-band-row graph-control-typed-row graph-control-typed-${def.nodeType}`}
      title={def.tooltip}
    >
      <span className="graph-control-band-label">{def.label}</span>
      <DualRangeSlider
        min={BAND_Y_MIN}
        max={BAND_Y_MAX}
        step={BAND_Y_STEP}
        valueMin={valueMin}
        valueMax={valueMax}
        onChangeMin={onChangeMin}
        onChangeMax={onChangeMax}
        nodeType={def.nodeType}
      />
      <span className="graph-control-band-value">{Math.round(valueMin)}</span>
      <span className="graph-control-band-value">{Math.round(valueMax)}</span>
    </div>
  )
}

// Two-handle range slider implemented with overlapping native inputs. Each
// thumb is grabbable thanks to pointer-events trickery in the CSS; the fill
// element between them is purely decorative. We clamp on change so the low
// thumb can never overtake the high thumb.
function DualRangeSlider({
  min, max, step, valueMin, valueMax, onChangeMin, onChangeMax, nodeType,
}: {
  min: number
  max: number
  step: number
  valueMin: number
  valueMax: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
  nodeType: NodeType
}) {
  const range = max - min
  const minPct = ((valueMin - min) / range) * 100
  const widthPct = Math.max(0, ((valueMax - valueMin) / range) * 100)

  return (
    <div className={`dual-range dual-range-${nodeType}`}>
      <div className="dual-range-track" />
      <div
        className="dual-range-fill"
        style={{ left: `${minPct}%`, width: `${widthPct}%` }}
      />
      <input
        type="range"
        className="dual-range-input dual-range-input-low"
        min={min} max={max} step={step}
        value={valueMin}
        onChange={e => {
          const v = Math.min(Number(e.target.value), valueMax - step)
          onChangeMin(v)
        }}
      />
      <input
        type="range"
        className="dual-range-input dual-range-input-high"
        min={min} max={max} step={step}
        value={valueMax}
        onChange={e => {
          const v = Math.max(Number(e.target.value), valueMin + step)
          onChangeMax(v)
        }}
      />
    </div>
  )
}

function SliderRow({ def, value, onChange, nodeType }: {
  def: SliderDef
  value: number
  onChange: (v: number) => void
  nodeType?: NodeType
}) {
  const display = def.step < 1 ? String(value) : String(Math.round(value))
  const className = nodeType
    ? `graph-control-slider graph-control-typed-row graph-control-typed-${nodeType}`
    : 'graph-control-slider'

  return (
    <div className={className} title={def.tooltip}>
      <label className="graph-control-slider-label">{def.label}</label>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="graph-control-slider-input"
      />
      <span className="graph-control-slider-value">{display}</span>
    </div>
  )
}

const HELP_TEXT = `Force-directed graph layout:

PUSH — Nodes repel each other via charge force.
  F = charge / (d² + r²)^exp
  Drag a token on the charge map to set one
  node type's charge & core radius (r); the
  axis sliders scale all at once.

PULL — Connected nodes attract via spring force.
  F = stiffness × (d − length)^exp / d
  Drag a token on the spring map to set one
  edge type; the axis sliders scale all at once.

GRAVITY — All nodes drift toward center of mass.
  F = α × gravity × (pos − COM)

DYNAMICS — Friction damps velocity, cooling reduces
  energy until the simulation stabilizes.

Node types:
  Namespace
  NexusEndpoint (top-level routing alias)
  Worker, NexusService
  Workflow, NexusOperation
  Activity

Tuning guide:
  • Start with push/pull multipliers for balance
  • If nodes overlap → increase push or charge
  • If too spread → increase pull or gravity
  • If oscillating → increase friction or cooling
  • Hover a tab or token to see its force on the canvas`
