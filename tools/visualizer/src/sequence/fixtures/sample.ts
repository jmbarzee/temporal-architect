// A sample: an execution written event by event, the graph excerpt and knobs
// fromExecution reads with it, and the names its hand drawing gives its steps.

import type { EdgeKind, Execution, ExecutionEvent, ExecutionLane, ParserGraph } from '@temporal-architect/wire-types'
import { eventKey } from '../../execution/step'
import { fromExecution, type Knobs } from '../fromExecution'
import type { Model } from '../model'

export interface Sample {
  execution: Execution
  graph: Pick<ParserGraph, 'nodes'>
  knobs: Knobs
  /** Each drawn step's name in the hand drawing, by step id. */
  names: Record<string, string>
}

type Fields = Partial<Omit<ExecutionEvent, 'id' | 'lane' | 'kind' | 'stmt'>>

/** Lanes whose events take the next handle as their id, and a stmt under the lane's definition. */
export function script() {
  const execution: Execution = { lanes: [], events: [] }
  const names: Record<string, string> = {}
  const lane = (l: ExecutionLane) => {
    execution.lanes.push(l)
    let n = 0
    const event = (kind: ExecutionEvent['kind'], stmt: string | undefined, fields: Fields = {}, name?: string) => {
      const id = `${l.id}/${++n}`
      execution.events.push({ id, lane: l.id, kind, ...(stmt !== undefined && { stmt: `${l.id.replace(/ @\d+$/, '')} › ${stmt}` }), ...fields })
      if (name) names[id] = name
      return id
    }
    const dispatch = (kind: EdgeKind) => (stmt: string, to: string, fields: Fields = {}, name?: string) =>
      event('reach', stmt, { ...fields, edge: { from: l.node!, to, kind } }, name)
    return {
      lane: l,
      reach: (stmt: string, fields?: Fields, name?: string) => event('reach', stmt, fields, name),
      start: (stmt: string, fields?: Fields, name?: string) => event('start', stmt, { attempt: 1, ...fields }, name),
      end: (stmt: string, fields?: Fields, name?: string) => event('end', stmt, fields, name),
      arrive: (stmt: string, fields?: Fields, name?: string) => event('arrive', stmt, fields, name),
      occur: (label: string, fields?: Fields, name?: string) => event('occur', undefined, { label, visit: [n + 1], ...fields }, name),
      send: dispatch('signalSend'),
      detach: dispatch('workflowCall'),
      /** An activity reached and started at once: its start's id. */
      call: (stmt: string, to: string, fields: Fields = {}, name?: string) => {
        dispatch('activityCall')(stmt, to, fields.visit && { visit: fields.visit })
        return event('start', stmt, { attempt: 1, ...fields }, name)
      },
    }
  }
  /** The key of the event with this id. */
  const key = (id: string) => eventKey(execution.events.find(e => e.id === id)!)
  return { execution, names, lane, key }
}

/** A sample's model, its steps under the names its drawing gives them. */
export function draw({ execution, graph, knobs, names }: Sample): Model {
  const name = (id: string) => names[id] ?? id
  const model = fromExecution(execution, graph, knobs)
  return {
    ...model,
    lanes: model.lanes.map(l => ({
      ...l,
      ...(l.startedBy && { startedBy: name(l.startedBy) }),
      ...(l.endedAt && { endedAt: name(l.endedAt) }),
    })),
    steps: model.steps.map(s => ({ ...s, id: name(s.id), ...(s.after && { after: s.after.map(name) }) })),
    messages: model.messages.map(m => ({ from: typeof m.from === 'string' ? name(m.from) : m.from, to: name(m.to) })),
    spans: model.spans.map(s => ({ ...s, from: name(s.from), to: name(s.to) })),
  }
}
