// Collapsible control panel for graph force parameters and simulation controls.
// Organized by force equation — each section shows its equation, then relevant sliders.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import type { NodeType } from '../graph/model'
import { SpringMap, SpringCurves } from './SpringControls'
import { ChargeMap, ChargeCurves } from './ChargeControls'
import { GravityControls } from './GravityControls'

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
  // Non-numeric gravity edits (mode, Band/Topological toggles). Routed through
  // GraphView so the simulation params update and the layout reheats.
  onGravityChange: (partial: Partial<ForceParams>) => void
  onActiveSection: (section: ForceSection) => void
  onActiveChargeType: (nodeType: NodeType | null) => void
  onActiveGravityType: (nodeType: NodeType | null) => void
  // The hovered/active pull edge category (its k-field key), forwarded to the
  // canvas so only that edge category is highlighted while tuning it.
  onActivePullEdge: (key: string | null) => void
}

// Keys of ForceParams whose value is a number (ForceParams now also has the
// boolean toggles and the string mode, which sliders must not target).
type NumericForceKey = {
  [K in keyof ForceParams]: ForceParams[K] extends number ? K : never
}[keyof ForceParams]

interface SliderDef {
  key: NumericForceKey
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

// --- GRAVITY section ---
//
// The Gravity tab's controls live in GravityControls: a Cartesian/Radial mode
// switch, Band/Topological toggles, the band pseudo-plot, and the topological
// strength + note. Center gravity is the unexplained baseline.

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
  params, onParamChange, onAdjust, onGravityChange,
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

  // Links the band pseudo-plot to the canvas band/ring highlight (and dims the
  // other columns/stripes).
  const [hoveredGravityType, setHoveredGravityType] = React.useState<NodeType | null>(null)
  const handleHoverGravityType = React.useCallback((t: NodeType | null) => {
    setHoveredGravityType(t)
    onActiveGravityType(t)
  }, [onActiveGravityType])

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
                subtitle=""
                equation=""
                onHover={h => { onActiveSection(h ? 'gravity' : null); if (!h) onActiveGravityType(null) }}
              >
                <GravityControls
                  params={params}
                  onParamChange={emitParamChange}
                  onGravitySet={onGravityChange}
                  hoveredType={hoveredGravityType}
                  onHoverType={handleHoverGravityType}
                />
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
      {equation && (typeof equation === 'string'
        ? <pre className="graph-control-equation-formula">{equation}</pre>
        : <div className="graph-control-equation-formula">{equation}</div>)}
      <div className="graph-control-equation-body">
        {children}
      </div>
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

GRAVITY — Three toggleable forces (Cartesian or Radial):
  Band (per-type rest bands = the hierarchy),
  Topological (root-ness pulls nodes inward),
  Center (radial pull to origin; the baseline
  when neither Band nor Topological is on).

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
