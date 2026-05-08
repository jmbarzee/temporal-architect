// Collapsible control panel for graph force parameters and simulation controls.
// Organized by force equation — each section shows its equation, then relevant sliders.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import { DEFAULT_PARAMS } from '../graph/simulation'
import type { NodeType } from '../graph/model'

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
  onActiveChargeType: (nodeType: NodeType | null) => void
  onActiveGravityType: (nodeType: NodeType | null) => void
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
//
// Master parameters use modest 0–3 ranges so the default 1.0 sits well within
// the slider's working area in either direction. softening uses a 0–2000 band
// for the same reason — defaults at ~900 leave room to firm or soften charges.

const PUSH_MASTER_SLIDERS: SliderDef[] = [
  { key: 'pushMultiplier', label: 'push', min: 0, max: 3, step: 0.1,
    tooltip: 'Master multiplier for all repulsion forces' },
  { key: 'chargeExponent', label: 'exp', min: 0.5, max: 3, step: 0.1,
    tooltip: 'Power of distance in charge falloff. 2 = inverse-square' },
  { key: 'chargeSoftening', label: 'softening', min: 0, max: 2000, step: 50,
    tooltip: 'Added to dist² — prevents singularity at close range' },
]

interface ChargeSliderDef extends SliderDef {
  nodeType: NodeType
}

// Charges grouped by hierarchy depth. The 3 L3 types share a range so their
// magnitudes are visually comparable; L1 and L2 use larger ranges scaled to
// their (much heavier) defaults.
const PUSH_CHARGE_SLIDERS: ChargeSliderDef[] = [
  { key: 'chargeNamespace', nodeType: 'namespace', label: 'L1 NS',
    min: -1000, max: 0, step: 10,
    tooltip: 'Namespace node repulsion charge' },
  { key: 'chargeWorker', nodeType: 'worker', label: 'L2 Wk',
    min: -400, max: 0, step: 10,
    tooltip: 'Worker node repulsion charge' },
  { key: 'chargeWorkflow', nodeType: 'workflow', label: 'L3 Wf',
    min: -200, max: 0, step: 5,
    tooltip: 'Workflow node repulsion charge' },
  { key: 'chargeActivity', nodeType: 'activity', label: 'L3 Act',
    min: -200, max: 0, step: 5,
    tooltip: 'Activity node repulsion charge' },
  { key: 'chargeNexusService', nodeType: 'nexusService', label: 'L3 Nx',
    min: -200, max: 0, step: 5,
    tooltip: 'Nexus service node repulsion charge' },
  { key: 'chargeNexusOperation', nodeType: 'nexusOperation', label: 'L3 Op',
    min: -200, max: 0, step: 5,
    tooltip: 'Nexus operation node repulsion charge' },
]

// --- PULL section sliders ---

const PULL_MASTER_SLIDERS: SliderDef[] = [
  { key: 'pullMultiplier', label: 'pull', min: 0, max: 3, step: 0.1,
    tooltip: 'Master multiplier for all spring forces' },
  { key: 'linkExponent', label: 'exp', min: 0.5, max: 3, step: 0.1,
    tooltip: 'Power of displacement in spring force. 1 = linear (Hooke)' },
  { key: 'distanceMultiplier', label: 'dist', min: 0.05, max: 3, step: 0.05,
    tooltip: 'Master multiplier for all rest distances' },
]

interface PullEdgeDef {
  label: string
  kKey: keyof ForceParams
  restKey: keyof ForceParams
  // Endpoint node types — drive the pair of coloured dots that render
  // before each label, so the row visually matches the nodes it controls.
  sourceType: NodeType
  targetType: NodeType
  tooltip: string
}

// All edge sliders share a common range for k and rest so their values are
// directly comparable. This makes the gradient across the hierarchy
// (loose-and-long at the top, tight-and-short at L3) visually obvious.
const EDGE_K_MIN = 0
const EDGE_K_MAX = 1.5
const EDGE_K_STEP = 0.05
const EDGE_REST_MIN = 10
const EDGE_REST_MAX = 600
const EDGE_REST_STEP = 10

// Order: top-of-tree → bottom-of-tree, alternating dependency / containment as
// we walk down the hierarchy. This mirrors the layout the user reads on the
// canvas and keeps related rows adjacent.
const PULL_EDGES: PullEdgeDef[] = [
  // Level 1
  { label: 'NS↔NS', kKey: 'linkNsToNs', restKey: 'distNsToNs',
    sourceType: 'namespace', targetType: 'namespace',
    tooltip: 'Namespace ↔ Namespace dependency' },
  { label: 'NS↔Wk', kKey: 'linkNsToWorker', restKey: 'distNsToWorker',
    sourceType: 'namespace', targetType: 'worker',
    tooltip: 'Namespace ↔ Worker containment' },
  // Level 2
  { label: 'Wk↔Wk', kKey: 'linkWorkerToWorker', restKey: 'distWorkerToWorker',
    sourceType: 'worker', targetType: 'worker',
    tooltip: 'Worker ↔ Worker dependency' },
  { label: 'Wk↔Wf', kKey: 'linkWorkerToWorkflow', restKey: 'distWorkerToWorkflow',
    sourceType: 'worker', targetType: 'workflow',
    tooltip: 'Worker ↔ Workflow containment' },
  { label: 'Wk↔Act', kKey: 'linkWorkerToActivity', restKey: 'distWorkerToActivity',
    sourceType: 'worker', targetType: 'activity',
    tooltip: 'Worker ↔ Activity containment' },
  { label: 'Wk↔Nx', kKey: 'linkWorkerToNexus', restKey: 'distWorkerToNexus',
    sourceType: 'worker', targetType: 'nexusService',
    tooltip: 'Worker ↔ Nexus service containment' },
  // Level 3 (intra-L3 containment + dependencies)
  { label: 'Nx↔Op', kKey: 'linkNexusToOperation', restKey: 'distNexusToOperation',
    sourceType: 'nexusService', targetType: 'nexusOperation',
    tooltip: 'Nexus service ↔ Nexus operation containment' },
  { label: 'Wf↔Wf', kKey: 'linkWorkflowToWorkflow', restKey: 'distWorkflowToWorkflow',
    sourceType: 'workflow', targetType: 'workflow',
    tooltip: 'Workflow ↔ Workflow dependency' },
  { label: 'Wf↔Act', kKey: 'linkWorkflowToActivity', restKey: 'distWorkflowToActivity',
    sourceType: 'workflow', targetType: 'activity',
    tooltip: 'Workflow ↔ Activity dependency' },
  { label: 'Act↔Act', kKey: 'linkActivityToActivity', restKey: 'distActivityToActivity',
    sourceType: 'activity', targetType: 'activity',
    tooltip: 'Activity ↔ Activity dependency' },
]

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

// Order matches the screen-space hierarchy (top → bottom), so the slider
// stack itself reads as a vertical layout preview.
const GRAVITY_BAND_SLIDERS: GravityBandDef[] = [
  { label: 'L1 NS', nodeType: 'namespace',
    minKey: 'bandYMinNamespace', maxKey: 'bandYMaxNamespace',
    tooltip: 'Y band where namespace nodes feel zero gravity' },
  { label: 'L2 Wk', nodeType: 'worker',
    minKey: 'bandYMinWorker', maxKey: 'bandYMaxWorker',
    tooltip: 'Y band where worker nodes feel zero gravity' },
  { label: 'L2 Nx', nodeType: 'nexusService',
    minKey: 'bandYMinNexusService', maxKey: 'bandYMaxNexusService',
    tooltip: 'Y band where nexus service nodes feel zero gravity' },
  { label: 'L3 Wf', nodeType: 'workflow',
    minKey: 'bandYMinWorkflow', maxKey: 'bandYMaxWorkflow',
    tooltip: 'Y band where workflow nodes feel zero gravity' },
  { label: 'L3 Op', nodeType: 'nexusOperation',
    minKey: 'bandYMinNexusOperation', maxKey: 'bandYMaxNexusOperation',
    tooltip: 'Y band where nexus operation nodes feel zero gravity' },
  { label: 'L4 Act', nodeType: 'activity',
    minKey: 'bandYMinActivity', maxKey: 'bandYMaxActivity',
    tooltip: 'Y band where activity nodes feel zero gravity' },
]

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
  params, onParamChange, running, onToggleRunning, onReheat,
  showForceFields, onToggleForceFields, onActiveSection,
  onActiveChargeType, onActiveGravityType,
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
          <EquationSection section="push" title="PUSH" subtitle="all node pairs" equation={'F = \u03B1 \u00D7 push \u00D7 charge / eff^exp\neff = \u221A(d\u00B2 + softening)'} onHover={h => onActiveSection(h ? 'push' : null)}>
            {PUSH_MASTER_SLIDERS.map(s => (
              <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
            ))}
            <div className="graph-control-sub-header">
              <span className="graph-control-sub-label">Level</span>
              <span className="graph-control-sub-label">Charge</span>
            </div>
            {PUSH_CHARGE_SLIDERS.map(s => (
              <div
                key={s.key}
                onMouseEnter={() => onActiveChargeType(s.nodeType)}
                onMouseLeave={() => onActiveChargeType(null)}
              >
                <SliderRow
                  def={s}
                  value={params[s.key]}
                  onChange={v => onParamChange(s.key, v)}
                  nodeType={s.nodeType}
                />
              </div>
            ))}
          </EquationSection>

          {/* PULL section */}
          <EquationSection section="pull" title="PULL" subtitle="connected pairs" equation={'F = \u03B1 \u00D7 pull \u00D7 k \u00D7 sign(\u0394) \u00D7 |\u0394|^exp / d\n\u0394 = d \u2212 rest \u00D7 dist'} onHover={h => onActiveSection(h ? 'pull' : null)}>
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
          <EquationSection
            section="gravity"
            title="GRAVITY"
            subtitle="hierarchical anchor"
            equation={'F\u2093 = \u03B1 \u00D7 X \u00D7 (0 \u2212 x)\nF\u1d67 = \u03B1 \u00D7 Y \u00D7 (band \u2212 y) when y outside band'}
            onHover={h => { onActiveSection(h ? 'gravity' : null); if (!h) onActiveGravityType(null) }}
          >
            {GRAVITY_STRENGTH_SLIDERS.map(s => (
              <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => onParamChange(s.key, v)} />
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
                onChangeMin={v => onParamChange('bandXMin', v)}
                onChangeMax={v => onParamChange('bandXMax', v)}
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
                  onChangeMin={v => onParamChange(b.minKey, v)}
                  onChangeMax={v => onParamChange(b.maxKey, v)}
                />
              </div>
            ))}
          </EquationSection>

          {/* DYNAMICS section */}
          <EquationSection section="dynamics" title="DYNAMICS" subtitle="" equation={'v \u00D7= friction\n\u03B1 \u2212= cooling, stop at threshold'} onHover={h => onActiveSection(h ? 'dynamics' : null)}>
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

function EquationSection({ section, title, subtitle, equation, onHover, children }: {
  section: 'push' | 'pull' | 'gravity' | 'dynamics'
  title: string
  subtitle: string
  equation: string
  onHover: (hovered: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`graph-control-equation-section graph-control-section-${section}`}
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
  const kDisplay = EDGE_K_STEP < 1 ? String(kVal) : String(Math.round(kVal))
  const restDisplay = EDGE_REST_STEP < 1 ? String(restVal) : String(Math.round(restVal))

  return (
    <div className="graph-control-pull-edge" title={def.tooltip}>
      <span className="graph-control-pull-edge-label">
        <span className={`graph-control-edge-dot graph-control-typed-${def.sourceType}`} />
        <span className={`graph-control-edge-dot graph-control-typed-${def.targetType}`} />
        {def.label}
      </span>
      <input
        type="range"
        min={EDGE_K_MIN} max={EDGE_K_MAX} step={EDGE_K_STEP}
        value={kVal}
        onChange={e => onChange(def.kKey, Number(e.target.value))}
        className="graph-control-slider-input graph-control-pull-slider"
      />
      <span className="graph-control-pull-value">{kDisplay}</span>
      <input
        type="range"
        min={EDGE_REST_MIN} max={EDGE_REST_MAX} step={EDGE_REST_STEP}
        value={restVal}
        onChange={e => onChange(def.restKey, Number(e.target.value))}
        className="graph-control-slider-input graph-control-pull-slider"
      />
      <span className="graph-control-pull-value">{restDisplay}</span>
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
  F = α × push × charge / eff^exp
  eff = √(d² + softening)

PULL — Connected nodes attract via spring force.
  F = α × pull × k × sign(Δ) × |Δ|^exp / d
  Δ = d − rest × dist

GRAVITY — All nodes drift toward center of mass.
  F = α × gravity × (pos − COM)

DYNAMICS — Friction damps velocity, cooling reduces
  energy until the simulation stabilizes.

Hierarchy & node types:
  L1: Namespace
  L2: Worker
  L3: Workflow, Activity, NexusService

Tuning guide:
  • Start with push/pull multipliers for balance
  • If nodes overlap → increase push or charge
  • If too spread → increase pull or gravity
  • If oscillating → increase friction or cooling
  • Toggle "Show force fields" to see charge reach`
