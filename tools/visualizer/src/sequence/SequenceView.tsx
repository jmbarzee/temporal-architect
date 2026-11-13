import { FilterBar } from '@jmbarzee/force-graph'
import type { LinkedViewProps, Theme } from '@jmbarzee/force-graph'
import React from 'react'
import './SequenceView.css'
import type { Execution, StepKind } from './execution'
import { layoutExecution, PITCH, type PlacedArrow, type PlacedColumn, type PlacedLane, type PlacedStep, type Rect } from './layout'

// What the bar shows of the other views' axes: none, but it keeps their selections for the switch back.
const NO_VALUES = new Map<string, readonly string[]>()
const NO_AXES: readonly string[] = []
const HEADER_R = 8

const TONE: Record<StepKind, string> = {
  send: 'signal', await: 'signal', handler: 'signal', activity: 'activity', timer: 'timer',
  detach: 'workflow-call', close: 'control', event: 'control', note: 'control',
}
const AWAITING: ReadonlySet<StepKind> = new Set(['await', 'handler'])
const HEADS: PlacedArrow['kind'][] = ['signal', 'call', 'child', 'launch']
const ARROW_TONE: Record<PlacedArrow['kind'], string> = { signal: 'signal', call: 'activity', child: 'workflow-call', launch: 'control' }

interface SequenceViewProps extends LinkedViewProps {
  execution: Execution
  systemTheme: Theme
}

export function SequenceView({ execution, systemTheme, filter, onFilterChange, search, onSearchChange }: SequenceViewProps) {
  const layout = React.useMemo(() => layoutExecution(execution), [execution])
  const query = search.query.toLowerCase()
  const dimmed = (text: string) => query !== '' && !text.toLowerCase().includes(query)

  return (
    <div className="sequence-view">
      <FilterBar
        filter={filter}
        onFilterChange={onFilterChange}
        search={search}
        onSearchChange={onSearchChange}
        systemTheme={systemTheme}
        values={NO_VALUES}
        axes={NO_AXES}
        searchTitle="Search steps"
        searchPlaceholder="Filter by label..."
      />
      <div className="sequence-canvas">
        <h2 className="sequence-title">{execution.title}</h2>
        <svg className="sequence-svg" width={layout.width} height={layout.height} role="img" aria-label={execution.title}>
          <defs>
            {HEADS.map(kind => (
              <marker key={kind} id={`seq-head-${kind}`} className={`seq-tone-${ARROW_TONE[kind]}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" className="seq-head" />
              </marker>
            ))}
          </defs>
          {layout.columns.map(c => <Column key={c.title} column={c} />)}
          {layout.lanes.map(l => <path key={l.lane.id} className="seq-lifeline" d={`M${l.x} ${l.lifeline[0]} V${l.lifeline[1]}`} />)}
          {layout.lanes.map(l => <Lane key={l.lane.id} placed={l} />)}
          {layout.spans.map((s, i) => <rect key={i} className="seq-span" {...s.box} rx={2}><title>{s.label}</title></rect>)}
          {layout.steps.map(p => <Step key={p.step.id} placed={p} dim={dimmed(`${p.verb} ${p.text}`)} />)}
          {layout.arrows.map((a, i) => <Arrow key={i} arrow={a} />)}
          {layout.inputs.map((input, i) => (
            <text key={i} className="seq-muted" x={input.x} y={input.y} textAnchor="end">
              <tspan x={input.x} dy="-0.2em">{input.outside}</tspan>
              {input.note && <tspan x={input.x} dy="1.2em">{input.note}</tspan>}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

function Tag({ box, label, value }: { box: Rect; label: string; value: string }) {
  const x = box.x + box.width / 2
  return (
    <g className="seq-tag">
      <rect {...box} rx={4} />
      <text className="seq-muted" x={x} y={box.y + 9} textAnchor="middle">{label}</text>
      <text x={x} y={box.y + 23} textAnchor="middle">{value}</text>
    </g>
  )
}

function Column({ column: { title, x, tag, tagBox } }: { column: PlacedColumn }) {
  return (
    <g>
      <text className="seq-column-title" x={x} y={20} textAnchor="middle">{title}</text>
      {tag && <Tag box={tagBox} label={tag.key} value={tag.value} />}
    </g>
  )
}

function Lane({ placed: { lane, x, box, bar } }: { placed: PlacedLane }) {
  return (
    <g>
      {box && (
        <g className="seq-lane seq-tone-workflow">
          <rect {...box} rx={HEADER_R} />
          <path className="seq-lane-header" d={`M${box.x + HEADER_R} ${box.y} H${box.x + box.width - HEADER_R} a${HEADER_R} ${HEADER_R} 0 0 1 ${HEADER_R} ${HEADER_R} V${box.y + PITCH} H${box.x} V${box.y + HEADER_R} a${HEADER_R} ${HEADER_R} 0 0 1 ${HEADER_R} -${HEADER_R} Z`} />
          <text x={x} y={box.y + PITCH / 2} textAnchor="middle"><tspan fontWeight="700">workflow</tspan> {lane.name}</text>
        </g>
      )}
      {bar && (
        <g className="seq-host seq-tone-workflow">
          <rect x={x - 3} y={bar.y1} width={6} height={bar.y2 - bar.y1} rx={3} />
          <text className="seq-muted" x={x + 10} y={bar.y1 + 15}>{lane.name}</text>
          {bar.lost && <path className="seq-lost" d={`M${x - 7} ${bar.y2} H${x + 7}`} />}
        </g>
      )}
    </g>
  )
}

function Step({ placed: { step, box, verb, text, queueTag }, dim }: { placed: PlacedStep; dim: boolean }) {
  const className = ['seq-step', `seq-${step.kind}`, `seq-tone-${TONE[step.kind]}`, step.state && `seq-${step.state}`, AWAITING.has(step.kind) && 'seq-awaiting', dim && 'search-dimmed'].filter(Boolean).join(' ')
  return (
    <g className={className}>
      {step.kind !== 'note' && <rect {...box} rx={6} />}
      <text x={box.x + box.width / 2} y={box.y + box.height / 2} textAnchor="middle">
        {verb && <tspan fontWeight="700">{verb} </tspan>}{text}
      </text>
      {queueTag && <Tag box={queueTag.box} label={queueTag.key} value={queueTag.value} />}
    </g>
  )
}

function Arrow({ arrow: { kind, x1, x2, y, n, badgeX } }: { arrow: PlacedArrow }) {
  return (
    <g className={`seq-arrow seq-${kind} seq-tone-${ARROW_TONE[kind]}`}>
      <path d={`M${x1} ${y} H${x2}`} markerEnd={`url(#seq-head-${kind})`} />
      {n !== undefined && (
        <>
          <circle cx={badgeX} cy={y} r={9} />
          <text x={badgeX} y={y} textAnchor="middle">{n}</text>
        </>
      )}
    </g>
  )
}
