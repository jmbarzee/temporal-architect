// Collapsible control panel for graph force parameters and simulation controls.
// Organized by force equation — each section shows its equation, then relevant sliders.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { DEFAULT_PARAMS } from '../graph/simulation'

export type ForceSection = 'push' | 'pull' | 'gravity' | 'dynamics' | null

interface GraphControlPanelProps {
  params: ForceParams
  onParamChange: (key: keyof ForceParams, value: number) => void
  running: boolean
  onToggleRunning: () => void
  onReheat: () => void
  showForceFields: boolean
  onToggleForceFields: () => void
  onActiveSection: (section: ForceSection) => void
  onActiveChargeLevel: (level: number | null) => void
}

interface SliderDef {
  key: keyof ForceParams
  label: string
  min: number
  max: number
  step: number
  tooltip: string
}

// --- PUSH section sliders ---

const PUSH_MASTER_SLIDERS: SliderDef[] = [
  { key: 'pushMultiplier', label: 'push', min: 0, max: 5, step: 0.1,
    tooltip: 'Master multiplier for all repulsion forces' },
  { key: 'chargeExponent', label: 'exp', min: 0.5, max: 4, step: 0.1,
    tooltip: 'Power of distance in charge falloff. 2 = inverse-square' },
  { key: 'chargeSoftening', label: 'softening', min: 0, max: 5000, step: 50,
    tooltip: 'Added to dist² — prevents singularity at close range' },
]

const PUSH_CHARGE_SLIDERS: SliderDef[] = [
  { key: 'chargeL1', label: 'L1 NS', min: -2000, max: 0, step: 10,
    tooltip: 'Namespace node repulsion charge' },
  { key: 'chargeL2', label: 'L2 Wk', min: -1000, max: 0, step: 10,
    tooltip: 'Worker node repulsion charge' },
  { key: 'chargeL3', label: 'L3 Def', min: -500, max: 0, step: 5,
    tooltip: 'Definition node repulsion charge' },
]

// --- PULL section sliders ---

const PULL_MASTER_SLIDERS: SliderDef[] = [
  { key: 'pullMultiplier', label: 'pull', min: 0, max: 5, step: 0.1,
    tooltip: 'Master multiplier for all spring forces' },
  { key: 'linkExponent', label: 'exp', min: 0.5, max: 3, step: 0.1,
    tooltip: 'Power of displacement in spring force. 1 = linear (Hooke)' },
  { key: 'distanceMultiplier', label: 'dist', min: 0.1, max: 5, step: 0.1,
    tooltip: 'Master multiplier for all rest distances' },
]

interface PullEdgeDef {
  label: string
  kKey: keyof ForceParams
  restKey: keyof ForceParams
  kMin: number; kMax: number; kStep: number
  restMin: number; restMax: number; restStep: number
  tooltip: string
}

const PULL_EDGES: PullEdgeDef[] = [
  { label: 'NS↔NS', kKey: 'linkNsToNs', restKey: 'distNsToNs',
    kMin: 0, kMax: 1, kStep: 0.05, restMin: 20, restMax: 600, restStep: 10,
    tooltip: 'Namespace-to-Namespace dependency' },
  { label: 'NS↔Wk', kKey: 'linkNsToWorker', restKey: 'distNsToWorker',
    kMin: 0, kMax: 1, kStep: 0.05, restMin: 20, restMax: 400, restStep: 10,
    tooltip: 'Namespace-to-Worker containment' },
  { label: 'Wk↔Wk', kKey: 'linkWorkerToWorker', restKey: 'distWorkerToWorker',
    kMin: 0, kMax: 1, kStep: 0.05, restMin: 20, restMax: 400, restStep: 10,
    tooltip: 'Worker-to-Worker dependency' },
  { label: 'Wk↔L3', kKey: 'linkWorkerToL3', restKey: 'distWorkerToL3',
    kMin: 0, kMax: 1, kStep: 0.05, restMin: 10, restMax: 300, restStep: 5,
    tooltip: 'Worker-to-Definition containment' },
  { label: 'L3↔L3', kKey: 'linkL3ToL3', restKey: 'distL3ToL3',
    kMin: 0, kMax: 1, kStep: 0.05, restMin: 10, restMax: 300, restStep: 5,
    tooltip: 'Definition-to-Definition dependency' },
]

// --- GRAVITY section sliders ---

const GRAVITY_SLIDERS: SliderDef[] = [
  { key: 'centerStrength', label: 'gravity', min: 0, max: 0.1, step: 0.002,
    tooltip: 'Strength of drift toward center of mass' },
]

// --- DYNAMICS section sliders ---

const DYNAMICS_SLIDERS: SliderDef[] = [
  { key: 'velocityDecay', label: 'friction', min: 0.1, max: 0.95, step: 0.05,
    tooltip: 'Damping factor per tick. Higher = more friction' },
  { key: 'alphaDecay', label: 'cooling', min: 0.001, max: 0.05, step: 0.001,
    tooltip: 'Energy lost per tick. Higher = settles faster' },
  { key: 'alphaMin', label: 'threshold', min: 0, max: 0.01, step: 0.001,
    tooltip: 'Energy level below which simulation pauses' },
]

export function GraphControlPanel({
  params, onParamChange, running, onToggleRunning, onReheat,
  showForceFields, onToggleForceFields, onActiveSection, onActiveChargeLevel,
}: GraphControlPanelProps) {
  const [open, setOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)

  const handleReset = () => {
    for (const key of Object.keys(DEFAULT_PARAMS) as (keyof ForceParams)[]) {
      if (params[key] !== DEFAULT_PARAMS[key]) {
        onParamChange(key, DEFAULT_PARAMS[key])
      }
    }
  }

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
          {/* PUSH section */}
          <EquationSection title="PUSH" subtitle="all node pairs" equation={'F = \u03B1 \u00D7 push \u00D7 charge / eff^exp\neff = \u221A(d\u00B2 + softening)'} onHover={h => onActiveSection(h ? 'push' : null)}>
            {PUSH_MASTER_SLIDERS.map(s => (
              <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
            ))}
            <div className="graph-control-sub-header">
              <span className="graph-control-sub-label">Level</span>
              <span className="graph-control-sub-label">Charge</span>
            </div>
            {PUSH_CHARGE_SLIDERS.map(s => {
              const level = s.key === 'chargeL1' ? 1 : s.key === 'chargeL2' ? 2 : 3
              return (
                <div
                  key={s.key}
                  onMouseEnter={() => onActiveChargeLevel(level)}
                  onMouseLeave={() => onActiveChargeLevel(null)}
                >
                  <SliderRow def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
                </div>
              )
            })}
          </EquationSection>

          {/* PULL section */}
          <EquationSection title="PULL" subtitle="connected pairs" equation={'F = \u03B1 \u00D7 pull \u00D7 k \u00D7 sign(\u0394) \u00D7 |\u0394|^exp / d\n\u0394 = d \u2212 rest \u00D7 dist'} onHover={h => onActiveSection(h ? 'pull' : null)}>
            {PULL_MASTER_SLIDERS.map(s => (
              <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
            ))}
            <div className="graph-control-sub-header">
              <span className="graph-control-sub-label" style={{ minWidth: 52 }}>Edge</span>
              <span className="graph-control-sub-label">k</span>
              <span className="graph-control-sub-label">rest</span>
            </div>
            {PULL_EDGES.map(e => (
              <PullEdgeRow key={e.label} def={e} params={params} onChange={onParamChange} />
            ))}
          </EquationSection>

          {/* GRAVITY section */}
          <EquationSection title="GRAVITY" subtitle="toward center of mass" equation={'F = \u03B1 \u00D7 gravity \u00D7 (pos \u2212 COM)'} onHover={h => onActiveSection(h ? 'gravity' : null)}>
            {GRAVITY_SLIDERS.map(s => (
              <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
            ))}
          </EquationSection>

          {/* DYNAMICS section */}
          <EquationSection title="DYNAMICS" subtitle="" equation={'v \u00D7= friction\n\u03B1 \u2212= cooling, stop at threshold'} onHover={h => onActiveSection(h ? 'dynamics' : null)}>
            {DYNAMICS_SLIDERS.map(s => (
              <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
            ))}
          </EquationSection>

          {/* Simulation controls */}
          <div className="graph-control-group">
            <div className="graph-control-sim-buttons">
              <button className="graph-header-btn" onClick={onToggleRunning}>
                {running ? 'Pause' : 'Play'}
              </button>
              <button className="graph-header-btn" onClick={onReheat}>
                Reheat
              </button>
              <button className="graph-header-btn" onClick={handleReset} title="Reset all parameters to defaults">
                Reset
              </button>
            </div>
            <label className="graph-control-checkbox" title="Show charge field rings around nodes">
              <input type="checkbox" checked={showForceFields} onChange={onToggleForceFields} />
              Show force fields
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

function EquationSection({ title, subtitle, equation, onHover, children }: {
  title: string
  subtitle: string
  equation: string
  onHover: (hovered: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div
      className="graph-control-equation-section"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="graph-control-equation-header">
        <span className="graph-control-equation-title">{title}</span>
        {subtitle && <span className="graph-control-equation-subtitle">({subtitle})</span>}
      </div>
      <pre className="graph-control-equation-formula">{equation}</pre>
      <div className="graph-control-equation-body">
        {children}
      </div>
    </div>
  )
}

function PullEdgeRow({ def, params, onChange }: {
  def: PullEdgeDef
  params: ForceParams
  onChange: (key: keyof ForceParams, value: number) => void
}) {
  const kVal = params[def.kKey]
  const restVal = params[def.restKey]
  const kDisplay = def.kStep < 1 ? String(kVal) : String(Math.round(kVal))
  const restDisplay = def.restStep < 1 ? String(restVal) : String(Math.round(restVal))

  return (
    <div className="graph-control-pull-edge" title={def.tooltip}>
      <span className="graph-control-pull-edge-label">{def.label}</span>
      <input
        type="range"
        min={def.kMin} max={def.kMax} step={def.kStep}
        value={kVal}
        onChange={e => onChange(def.kKey, Number(e.target.value))}
        className="graph-control-slider-input graph-control-pull-slider"
      />
      <span className="graph-control-pull-value">{kDisplay}</span>
      <input
        type="range"
        min={def.restMin} max={def.restMax} step={def.restStep}
        value={restVal}
        onChange={e => onChange(def.restKey, Number(e.target.value))}
        className="graph-control-slider-input graph-control-pull-slider"
      />
      <span className="graph-control-pull-value">{restDisplay}</span>
    </div>
  )
}

function SliderRow({ def, value, onChange }: {
  def: SliderDef
  value: number
  onChange: (v: number) => void
}) {
  const display = def.step < 1 ? String(value) : String(Math.round(value))

  return (
    <div className="graph-control-slider" title={def.tooltip}>
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
  F = α × push × charge / eff^exp
  eff = √(d² + softening)

PULL — Connected nodes attract via spring force.
  F = α × pull × k × sign(Δ) × |Δ|^exp / d
  Δ = d − rest × dist

GRAVITY — All nodes drift toward center of mass.
  F = α × gravity × (pos − COM)

DYNAMICS — Friction damps velocity, cooling reduces
  energy until the simulation stabilizes.

Three hierarchy levels:
  L1: Namespaces — L2: Workers — L3: Definitions

Tuning guide:
  • Start with push/pull multipliers for balance
  • If nodes overlap → increase push or charge
  • If too spread → increase pull or gravity
  • If oscillating → increase friction or cooling
  • Toggle "Show force fields" to see charge reach`
