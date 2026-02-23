// Collapsible control panel for graph force parameters and simulation controls.
// Implements GRAPH_VIEW.md § Control Panel.

import React from 'react'
import type { ForceParams } from '../graph/simulation'

interface GraphControlPanelProps {
  params: ForceParams
  onParamChange: (key: keyof ForceParams, value: number) => void
  running: boolean
  onToggleRunning: () => void
  onReheat: () => void
}

interface SliderDef {
  key: keyof ForceParams
  label: string
  min: number
  max: number
  step: number
}

const CHARGE_SLIDERS: SliderDef[] = [
  { key: 'chargeL1', label: 'L1 Namespace', min: -1000, max: 0, step: 10 },
  { key: 'chargeL2', label: 'L2 Worker', min: -500, max: 0, step: 10 },
  { key: 'chargeL3', label: 'L3 Definitions', min: -200, max: 0, step: 5 },
]

const LINK_SLIDERS: SliderDef[] = [
  { key: 'linkNsToNs', label: 'NS \u2194 NS', min: 0, max: 1, step: 0.05 },
  { key: 'linkNsToWorker', label: 'NS \u2194 Worker', min: 0, max: 1, step: 0.05 },
  { key: 'linkWorkerToWorker', label: 'Worker \u2194 Worker', min: 0, max: 1, step: 0.05 },
  { key: 'linkWorkerToL3', label: 'Worker \u2194 L3', min: 0, max: 1, step: 0.05 },
  { key: 'linkL3ToL3', label: 'L3 \u2194 L3', min: 0, max: 1, step: 0.05 },
]

export function GraphControlPanel({
  params, onParamChange, running, onToggleRunning, onReheat,
}: GraphControlPanelProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={`graph-control-panel ${open ? 'open' : ''}`}>
      <button
        className="graph-control-panel-toggle"
        onClick={() => setOpen(!open)}
        title="Toggle control panel"
      >
        {open ? '\u25BC Controls' : '\u25B6 Controls'}
      </button>

      {open && (
        <div className="graph-control-panel-body">
          <div className="graph-control-group">
            <div className="graph-control-group-label">Node Repulsion</div>
            {CHARGE_SLIDERS.map(s => (
              <SliderRow
                key={s.key}
                def={s}
                value={params[s.key]}
                onChange={v => onParamChange(s.key, v)}
              />
            ))}
          </div>

          <div className="graph-control-group">
            <div className="graph-control-group-label">Edge Attraction</div>
            {LINK_SLIDERS.map(s => (
              <SliderRow
                key={s.key}
                def={s}
                value={params[s.key]}
                onChange={v => onParamChange(s.key, v)}
              />
            ))}
          </div>

          <div className="graph-control-group">
            <div className="graph-control-group-label">Simulation</div>
            <div className="graph-control-sim-buttons">
              <button className="graph-header-btn" onClick={onToggleRunning}>
                {running ? 'Pause' : 'Play'}
              </button>
              <button className="graph-header-btn" onClick={onReheat}>
                Reheat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SliderRow({ def, value, onChange }: {
  def: SliderDef
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="graph-control-slider">
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
      <span className="graph-control-slider-value">{value}</span>
    </div>
  )
}
