// The Push/Pull tab: one axis dropdown shared by both pair forces, then Push
// and Pull as sub-tabs — styled like Gravity's Band/Topological, without the
// switches, since neither force has an off. Each body is its equation, its 2D
// map, and its force-curve read-out.

import React from 'react'
import type { PresentSets } from './GraphControlPanel'
import type { ForceParams, AxisOption } from '../graph/simulation'
import { fitsCeiling, TOKEN_CEILING } from '../graph/simulation'
import type { ResolvedPhysics } from '../graph/forces'
import type { DimensionalMapping } from '../graph/dimension'
import { ChargeMap, ChargeCurves } from './ChargeControls'
import { SpringMap, SpringCurves } from './SpringControls'
import { EquationSection } from './controls/EquationSection'
import { SubTabs, SubTab, SubTabBodies, SubTabBody } from './controls/SubTab'
import { FormulaValue } from './controls/PopContext'
import type { ForceSection } from './GraphControlPanel'

type PairForce = 'push' | 'pull'

interface PushPullProps {
  params: ForceParams
  resolved: ResolvedPhysics
  /** Every axis the graph admits, with what each would cost to show. */
  axes: readonly AxisOption[]
  /** What the visible set holds: push buckets and spring categories worth a token. */
  present: Pick<PresentSets, 'push' | 'springs'>
  onParamChange: (patch: Partial<ForceParams>) => void
  onAxisChange: (mapping: DimensionalMapping) => void
  onActiveSection: (section: ForceSection) => void
  hoveredPushBucket: string | null
  onHoverPushBucket: (b: string | null) => void
  hoveredEdge: string | null
  onHoverEdge: (key: string | null) => void
}

const PUSH_EQUATION = (
  <span className="gv-eq-line">
    F =
    <span className="gv-eq-frac">
      <span className="gv-eq-num"><FormulaValue id="pushMultiplier">charge</FormulaValue></span>
      <span className="gv-eq-den">(d² + <FormulaValue id="coreRadiusMultiplier">r</FormulaValue>²)<sup><FormulaValue id="chargeExponent">exp</FormulaValue></sup></span>
    </span>
  </span>
)

const PULL_EQUATION = (
  <span className="gv-eq-line">
    F = <FormulaValue id="pullMultiplier">stiffness</FormulaValue> ×
    <span className="gv-eq-frac">
      <span className="gv-eq-num">(d − <FormulaValue id="distanceMultiplier">length</FormulaValue>)<sup><FormulaValue id="linkExponent">exp</FormulaValue></sup></span>
      <span className="gv-eq-den">d</span>
    </span>
  </span>
)

/** What the dropdown says about an axis: its cost when it fits, why not when it does not. */
function optionLabel(o: AxisOption): string {
  return fitsCeiling(o)
    ? `${o.mapping.label} (${o.pushTokens} · ${o.pullTokens})`
    : `${o.mapping.label} — ${Math.max(o.pushTokens, o.pullTokens)} tokens (max ${TOKEN_CEILING})`
}

export function PushPullControls({
  params, resolved, axes, present, onParamChange, onAxisChange, onActiveSection,
  hoveredPushBucket, onHoverPushBucket, hoveredEdge, onHoverEdge,
}: PushPullProps) {
  const [sub, setSub] = React.useState<PairForce>('push')
  const current = params.pair.mapping.dimension
  return (
    <div className="gv-pushpull-controls">
      {/* The axis both forces key on — above the sub-tabs so it stays visible
          whichever force is being edited. */}
      <div className="gv-axis-row">
        <label className="gv-axis-label" htmlFor="pushpull-axis">axis</label>
        <select
          id="pushpull-axis"
          className="gv-axis-select"
          value={current}
          title="The dimension push and pull key on. Tokens are the visible set's: a push token per bucket some visible node falls in, a pull token per spring category some sprung edge falls in; the counts measure the whole graph"
          onChange={e => {
            const option = axes.find(o => o.mapping.dimension === e.target.value)
            if (option) onAxisChange(option.mapping)
          }}
        >
          {axes.map(o => (
            <option key={o.mapping.dimension} value={o.mapping.dimension} disabled={!fitsCeiling(o)}>
              {optionLabel(o)}
            </option>
          ))}
        </select>
      </div>

      <SubTabs label="Pair force">
        <SubTab label="Push" active={sub === 'push'} onSelect={() => setSub('push')} />
        <SubTab label="Pull" active={sub === 'pull'} onSelect={() => setSub('pull')} />
      </SubTabs>

      <SubTabBodies>
        <SubTabBody active={sub === 'push'}>
          <EquationSection subtitle="" equation={PUSH_EQUATION} onHover={h => onActiveSection(h ? 'push' : null)}>
            <ChargeMap params={params} resolved={resolved} present={present.push} onParamChange={onParamChange}
              hoveredBucket={hoveredPushBucket} onHoverBucket={onHoverPushBucket} />
            <ChargeCurves params={params} resolved={resolved} present={present.push} onParamChange={onParamChange}
              hoveredBucket={hoveredPushBucket} onHoverBucket={onHoverPushBucket} />
          </EquationSection>
        </SubTabBody>
        <SubTabBody active={sub === 'pull'}>
          <EquationSection subtitle="" equation={PULL_EQUATION} onHover={h => onActiveSection(h ? 'pull' : null)}>
            <SpringMap params={params} resolved={resolved} present={present.springs} onParamChange={onParamChange}
              hoveredEdge={hoveredEdge} onHoverEdge={onHoverEdge} />
            <SpringCurves params={params} resolved={resolved} present={present.springs} onParamChange={onParamChange}
              hoveredEdge={hoveredEdge} onHoverEdge={onHoverEdge} />
          </EquationSection>
        </SubTabBody>
      </SubTabBodies>
    </div>
  )
}
