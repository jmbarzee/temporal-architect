import type { Execution } from '@temporal-architect/wire-types'
import './step-panel.css'
import type { ViewName } from './link'
import { eventKey, eventOf, familyOf } from './step'

const OUTCOME: Record<string, string> = { failed: 'failed', timedOut: 'timed out', cancelled: 'cancelled' }

interface StepPanelProps {
  execution: Execution
  /** The selected step's key. */
  step: string
  /** A graph node's name, by its id. */
  nodeName: (id: string) => string
  /** Where the step can be shown, each view as the action that shows it there. */
  show: Partial<Record<ViewName, () => void>>
  /** The link that opens the visualizer on this step. */
  href: string
  onClose: () => void
}

const VIEW_LABEL: Record<ViewName, string> = { tree: 'Tree', graph: 'Graph', sequence: 'Sequence' }

/** What the selected step is: its lane, the events of its visit and the places to show it. A host that holds no event of the step draws none. */
export function StepPanel({ execution, step, nodeName, show, href, onClose }: StepPanelProps) {
  const event = eventOf(execution, step)
  if (!event) return null
  const cause = (id: string) => execution.events.find(e => e.id === id)
  return (
    <aside className="step-panel" aria-label="Step" onClick={e => e.stopPropagation()}>
      <header>
        <span className="step-lane">{event.lane}</span>
        {event.stmt !== undefined && <span className="step-stmt">{event.stmt.split(' › ').pop()}</span>}
        <span className="step-links">
          {(Object.keys(VIEW_LABEL) as ViewName[]).map(view => show[view] && <button key={view} onClick={show[view]}>{VIEW_LABEL[view]}</button>)}
          <a href={href}>Link</a>
          <button aria-label="Clear step" onClick={onClose}>×</button>
        </span>
      </header>
      <ul>
        {familyOf(execution, step).map(e => {
          const from = e.from && cause(e.from)
          return (
            <li key={e.id} className={eventKey(e) === step ? 'step-this' : undefined}>
              <b>{e.kind}</b>
              {e.attempt !== undefined && ` attempt ${e.attempt}`}
              {e.label && ` ${e.label}`}
              {e.outcome && ` ${OUTCOME[e.outcome] ?? e.outcome}`}
              {e.edge && ` ${e.edge.kind} ${nodeName(e.edge.from)} → ${nodeName(e.edge.to)}`}
              {from && ` from ${from.lane} ${from.kind}`}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
