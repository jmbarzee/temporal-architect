// Collapsible control panel for graph force parameters and simulation controls.
// Organized by force equation — each section shows its equation, then relevant sliders.

import React from 'react'
import './GraphControlPanel.css'
import type { ForceParams } from '../graph/simulation'
import type { ResolvedPhysics } from '../graph/forces'
import type { DimensionValue } from '../graph/dimension'

import type { NodeScaleParams } from '../graph/node-scale'
import { PushPullControls } from './PushPullControls'
import { GravityControls } from './GravityControls'
import type { GravityHover } from './GravityControls'
import { Slider } from './controls/Slider'
import { EquationSection } from './controls/EquationSection'
import { PopProvider } from './controls/PopContext'
import type { AxisOption } from '../graph/simulation'
import type { DimensionalMapping } from '../graph/dimension'

export type ForceSection = 'push' | 'pull' | 'gravity' | 'dynamics' | null

// The three control tabs. Unlike ForceSection, a tab is always one of these —
// there is no "null" tab; exactly one section is shown at a time. The "forces"
// tab holds both pair forces under one axis (push and pull are its sub-tabs,
// and still drive their own ForceSection previews); the "misc" tab groups
// non-force controls (simulation dynamics + render-time node scaling), its
// dynamics sub-section driving the 'dynamics' preview.
type ControlTab = 'forces' | 'gravity' | 'misc'

const CONTROL_TABS: { id: ControlTab; label: string }[] = [
  { id: 'forces', label: 'Push/Pull' },
  { id: 'gravity', label: 'Gravity' },
  { id: 'misc', label: 'Misc' },
]

interface GraphControlPanelProps {
  params: ForceParams
  /** The dense tables the kernels read, resolved once by the view (T25). */
  resolved: ResolvedPhysics
  // Patch-based: a control emits the subset of params it changed. (handleGravityChange
  // already used this shape; unifying lets nested map params be written too.)
  onParamChange: (patch: Partial<ForceParams>) => void
  // Shared "keep the simulation warm while tuning" signal. Fired alongside
  // every force-control edit so the layout responds live. See GraphView's
  // handleForceAdjust.
  onAdjust: () => void
  // Edits that relocate nodes — gravity's mode and toggles, the push/pull axis.
  // Routed through GraphView so the simulation params update and the layout
  // reheats harder than a numeric nudge.
  onRelayout: (partial: Partial<ForceParams>) => void
  /** Every axis push/pull may key on for this graph, with its measured cost. */
  axes: readonly AxisOption[]
  /** The spring categories some edge of the graph falls in. */
  presentSprings: ReadonlySet<string>
  onAxisChange: (mapping: DimensionalMapping) => void
  onActiveSection: (section: ForceSection) => void
  onActivePushBucket: (bucket: string | null) => void
  onActiveGravityBucket: (hover: GravityHover | null) => void
  // The hovered/active pull edge category (its k-field key), forwarded to the
  // canvas so only that edge category is highlighted while tuning it.
  onActivePullEdge: (key: string | null) => void
  // Render-time node sizing (Misc → Node scaling). Separate from ForceParams
  // because it never touches the simulation — it only affects how big nodes
  // are drawn at a given zoom.
  nodeScale: NodeScaleParams
  onNodeScaleChange: (patch: Partial<NodeScaleParams>) => void
}

// Keys of ForceParams whose value is a number (ForceParams now also has the
// boolean toggles and the string mode, which sliders must not target).
type NumericForceKey = {
  [K in keyof ForceParams]: ForceParams[K] extends number ? K : never
}[keyof ForceParams]

// Shared shape for a labelled range row. Key types differ per param family
// (force params vs. node-scale params), so the key lives on the extending
// interfaces and SliderRow itself only needs the range/label/tooltip.
interface RangeDef {
  label: string
  min: number
  max: number
  step: number
  tooltip: string
}

interface SliderDef extends RangeDef {
  key: NumericForceKey
}

interface NodeScaleSliderDef extends RangeDef {
  key: keyof NodeScaleParams
}

// --- PUSH/PULL section ---
//
// The pair forces live in PushPullControls: the shared axis dropdown, then Push
// (ChargeControls: a 2D charge map + a charge-falloff read-out) and Pull
// (SpringControls: a 2D spring map + a force-curve read-out) as sub-tabs.

// --- GRAVITY section ---
//
// The Gravity tab's controls live in GravityControls: X Axis and Y Axis (the
// same per-axis surface, Y carrying the Radial switch) and Topological. Center
// gravity is the unexplained baseline.

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

// --- NODE SCALING section sliders ---
//
// Render-time controls for how big nodes are drawn. On-screen size is
// `baseR × size × clamp(zoom, shrink-floor, grow-cap)`. Lowering "grow cap"
// makes nodes start shrinking sooner as the user zooms out (the common fix for
// "nodes are too big when zoomed out").
const NODE_SCALE_SLIDERS: NodeScaleSliderDef[] = [
  { key: 'baseMul', label: 'size', min: 0.3, max: 2.0, step: 0.05,
    tooltip: 'Overall node + label size. 1 = default.' },
  { key: 'maxZoomMul', label: 'grow cap', min: 0.5, max: 3.0, step: 0.05,
    tooltip: 'Zoom past which nodes stop growing. Lower = nodes start shrinking sooner as you zoom out.' },
  { key: 'minZoomMul', label: 'shrink floor', min: 0.1, max: 1.0, step: 0.05,
    tooltip: 'Smallest nodes may get when zoomed all the way out.' },
]

export function GraphControlPanel({
  params, resolved, onParamChange, onAdjust, onRelayout, axes, presentSprings, onAxisChange,
  onActiveSection,
  onActivePushBucket, onActiveGravityBucket, onActivePullEdge,
  nodeScale, onNodeScaleChange,
}: GraphControlPanelProps) {
  const [open, setOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<ControlTab>('forces')
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
  // brightens the matching curve in the other. The bucket is also forwarded to
  // the canvas so only that bucket's charge field rings highlight while tuning.
  const [hoveredPushBucket, setHoveredPushBucket] = React.useState<string | null>(null)
  const handleHoverPushBucket = React.useCallback((b: string | null) => {
    setHoveredPushBucket(b)
    onActivePushBucket(b)
  }, [onActivePushBucket])

  // Links the band pseudo-plot to the canvas band/ring highlight (and dims the
  // other columns/stripes).
  const [hoveredGravityBucket, setHoveredGravityBucket] = React.useState<GravityHover | null>(null)
  const handleHoverGravityBucket = React.useCallback((h: GravityHover | null) => {
    setHoveredGravityBucket(h)
    onActiveGravityBucket(h)
  }, [onActiveGravityBucket])

  // Single funnel for every force control's edits. Routing all controls
  // through one wrapper means the "nudge the simulation" behaviour is
  // defined once and inherited by every present and future control
  // (sliders, dual-range bands, upcoming 2D fields) — no per-control wiring,
  // no chance of a control forgetting to keep the layout warm.
  const emitParamChange = React.useCallback((patch: Partial<ForceParams>) => {
    onParamChange(patch)
    onAdjust()
  }, [onParamChange, onAdjust])

  return (
    <div className={`graph-control-panel ${open ? 'open' : ''}`}>
      <button
        className="graph-control-panel-toggle"
        onClick={() => setOpen(!open)}
        title="Toggle control panel"
      >
        {open ? '▼ Controls' : '▶ Controls'}
      </button>

      {open && (
        <PopProvider>
        <div className="graph-control-panel-body">
          {/* Control tabs — only one section is shown at a time. */}
          <div className="graph-control-tabs" role="tablist">
            {CONTROL_TABS.map(t => (
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
            {/* PUSH/PULL section */}
            <SectionSlot active={activeTab === 'forces'}>
              <PushPullControls
                params={params}
                resolved={resolved}
                axes={axes}
                presentSprings={presentSprings}
                onParamChange={emitParamChange}
                onAxisChange={onAxisChange}
                onActiveSection={onActiveSection}
                hoveredPushBucket={hoveredPushBucket}
                onHoverPushBucket={handleHoverPushBucket}
                hoveredEdge={hoveredPullEdge}
                onHoverEdge={handleHoverPullEdge}
              />
            </SectionSlot>

            {/* GRAVITY section */}
            <SectionSlot active={activeTab === 'gravity'}>
              <EquationSection
                subtitle=""
                equation=""
                onHover={h => { onActiveSection(h ? 'gravity' : null); if (!h) onActiveGravityBucket(null) }}
              >
                <GravityControls
                  params={params}
                  resolved={resolved}
                  axes={axes}
                  onParamChange={emitParamChange}
                  onRelayout={onRelayout}
                  hovered={hoveredGravityBucket}
                  onHover={handleHoverGravityBucket}
                />
              </EquationSection>
            </SectionSlot>

            {/* MISC section — non-force controls: simulation dynamics and
                render-time node scaling, each in its own labelled sub-section. */}
            <SectionSlot active={activeTab === 'misc'}>
              <div className="graph-control-subsection">
                <div className="graph-control-subsection-title">Dynamics</div>
                <EquationSection subtitle="" equation={'v \u00D7= friction\n\u03B1 \u2212= cooling, stop at threshold'} onHover={h => onActiveSection(h ? 'dynamics' : null)}>
                  {DYNAMICS_SLIDERS.map(s => (
                    <SliderRow key={s.key} def={s} value={params[s.key]} onChange={v => emitParamChange({ [s.key]: v } as Partial<ForceParams>)} />
                  ))}
                </EquationSection>
              </div>
              <div className="graph-control-subsection">
                <div className="graph-control-subsection-title">Node scaling</div>
                <EquationSection subtitle="" equation={'size = base \u00D7 clamp(zoom, floor, cap)'} onHover={() => {}}>
                  {NODE_SCALE_SLIDERS.map(s => (
                    <SliderRow key={s.key} def={s} value={nodeScale[s.key]} onChange={v => onNodeScaleChange({ [s.key]: v } as Partial<NodeScaleParams>)} />
                  ))}
                </EquationSection>
              </div>
            </SectionSlot>
          </div>
        </div>
        </PopProvider>
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

function SliderRow({ def, value, onChange, nodeType }: {
  def: RangeDef
  value: number
  onChange: (v: number) => void
  nodeType?: DimensionValue
}) {
  const display = def.step < 1 ? String(value) : String(Math.round(value))
  const className = nodeType
    ? `graph-control-slider graph-control-typed-row graph-control-typed-${nodeType}`
    : 'graph-control-slider'

  return (
    <div className={className} title={def.tooltip}>
      <label className="graph-control-slider-label">{def.label}</label>
      <Slider min={def.min} max={def.max} step={def.step} value={value} onChange={onChange} />
      <span className="graph-control-slider-value">{display}</span>
    </div>
  )
}
