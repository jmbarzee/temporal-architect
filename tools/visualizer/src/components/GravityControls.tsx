// Gravity-tab controls: three sub-tabs. X Axis and Y Axis are the two layout
// axes, each the same surface (`AxisControls`): a mapping, one column per
// bucket with its rest band as two handles, the axis's strength, the force
// curve beneath. Y carries the Radial switch — the way radial mode is entered
// (R27): Y's bands become rings about the origin and X is ignored. Topological
// keeps its own switch: a depth→pull curve plus strength/exp sliders. Center
// gravity is the unexplained baseline (active when both axes are at zero
// strength and Topological is off), so it has no control here.
// See GRAPH_VIEW spec § Gravity / Control Panel.

import React from 'react'
import './GravityControls.css'
import type { ForceParams, LayoutAxisOption } from '../graph/simulation'
import type { ResolvedPhysics } from '../graph/forces'
import { Slider } from './controls/Slider'
import { Equation } from './controls/Equation'
import { FormulaValue } from './controls/PopContext'
import { SubTabs, SubTab, SubTabBodies, SubTabBody } from './controls/SubTab'
import { AxisControls } from './AxisControls'
import type { GravityHover } from './AxisControls'

export type { GravityHover, LayoutAxis } from './AxisControls'

interface GravityControlProps {
  params: ForceParams
  /** The dense tables the kernels read, resolved once by the view (T25). */
  resolved: ResolvedPhysics
  /** Every axis X or Y may key on: mappings with their bucket count, and computed scalars. */
  axes: readonly LayoutAxisOption[]
  onParamChange: (patch: Partial<ForceParams>) => void
  onRelayout: (partial: Partial<ForceParams>) => void
  hovered: GravityHover | null
  onHover: (h: GravityHover | null) => void
}

type GravitySub = 'x' | 'y' | 'topological'

export function GravityControls({ params, resolved, axes, onParamChange, onRelayout, hovered, onHover }: GravityControlProps) {
  const [sub, setSub] = React.useState<GravitySub>('y')
  return (
    <div className="gravity-controls">
      <SubTabs label="Gravity">
        <SubTab label="X Axis" active={sub === 'x'} onSelect={() => setSub('x')} />
        <SubTab label="Y Axis" active={sub === 'y'} onSelect={() => setSub('y')}
          leading={<ForceSwitch label="Radial layout: Y as distance from the centre" enabled={params.radial} onToggle={v => onRelayout({ radial: v })} />} />
        <SubTab label="Topological" active={sub === 'topological'} onSelect={() => setSub('topological')}
          leading={<ForceSwitch label="Topological gravity enabled" enabled={params.topologicalEnabled} onToggle={v => onRelayout({ topologicalEnabled: v })} />} />
      </SubTabs>

      <SubTabBodies>
        <SubTabBody active={sub === 'x'}>
          <AxisControls axis="x" params={params} resolved={resolved} axes={axes}
            onParamChange={onParamChange} onRelayout={onRelayout} hovered={hovered} onHover={onHover} />
        </SubTabBody>
        <SubTabBody active={sub === 'y'}>
          <AxisControls axis="y" params={params} resolved={resolved} axes={axes}
            onParamChange={onParamChange} onRelayout={onRelayout} hovered={hovered} onHover={onHover} />
        </SubTabBody>
        <SubTabBody active={sub === 'topological'}>
          <div className={`gravity-section-tools gravity-topo${params.topologicalEnabled ? '' : ' inactive'}`}>
            <Equation>{<>F = <FormulaValue id="topoStrength">strength</FormulaValue> × depth<sup><FormulaValue id="topoExp">exp</FormulaValue></sup> × d</>}</Equation>
            <TopologicalCurve exp={params.gravityTopologicalExp} />
            <div className="gravity-slider-row">
              <label className="graph-control-slider-label">strength</label>
              <Slider
                min={0} max={2} step={0.02}
                value={params.gravityTopological}
                onChange={v => onParamChange({ gravityTopological: v })}
                popId="topoStrength"
              />
            </div>
            <div className="gravity-slider-row">
              <label className="graph-control-slider-label">exp</label>
              <Slider
                min={1} max={6} step={0.1}
                value={params.gravityTopologicalExp}
                onChange={v => onParamChange({ gravityTopologicalExp: v })}
                popId="topoExp"
              />
            </div>
          </div>
        </SubTabBody>
      </SubTabBodies>
    </div>
  )
}

// A sliding switch led into its sub-tab. Toggling does not select the tab (the
// click stops here), so the state stays legible while another body is shown.
function ForceSwitch({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className={`switch${enabled ? ' on' : ''}`} onClick={e => e.stopPropagation()} title={label}>
      <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} aria-label={label} />
      <span className="switch-track"><span className="switch-knob" /></span>
    </label>
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
