// Execution → the view's model. What an execution holds is read through the
// graph; what it does not (titles, the labels a value says better, pauses,
// notes, spans, sources outside the design) is the knobs', written by hand
// until #762 gives them a home.

import type { Execution, ExecutionEvent, ParserGraph } from '@temporal-architect/wire-types'
import { eventKey } from '../execution/step'
import type { Lane, Message, Model, Span, Step, StepKind } from './model'

/** What the view draws that an execution does not hold. Lanes are keyed by id; steps by eventKey, a queued box by queuedId of its start's. */
export interface Knobs {
  title: string
  lanes?: Record<string, { title?: string; tag?: Lane['tag'] }>
  labels?: Record<string, string>
  pauses?: Record<string, number>
  /** Events drawn as a note with this label, which nothing else draws. */
  notes?: Record<string, string>
  spans?: Span[]
  /** Where a message an event receives comes from, outside the design. */
  outside?: Record<string, Exclude<Message['from'], string>>
}

const LANE_KIND: Record<string, Lane['kind']> = { workflow: 'workflow', worker: 'host', outside: 'external' }
const OUTCOME_LABEL = { failed: 'failed', timedOut: 'timed out', cancelled: 'cancelled' }

/** The box drawn waiting for an attempt that does not start when it is dispatched. */
export const queuedId = (start: string) => `${start} queued`

/** The statement that ends an event's stmt, without its rank. */
const head = (e: ExecutionEvent) => {
  const path = e.stmt!.split(' › ')
  return path[path.length - 1].replace(/ @\d+$/, '')
}

/** A call's name, its last `parts` dotted segments: without its package. */
const callee = (call: string, parts: number) => call.slice(0, call.indexOf('(')).split('.').slice(-parts).join('.')

const ACTIVITY = /^(?:promise \w+ <- |await )?activity (.*)$/

/** What an event draws as, if anything. */
function drawn(e: ExecutionEvent): { kind: StepKind; label: string } | undefined {
  if (e.kind === 'occur') return { kind: 'event', label: e.label ?? '' }
  const h = head(e)
  const call = h.match(ACTIVITY)?.[1]
  switch (e.kind) {
    case 'reach':
      if (h.startsWith('signal ')) return { kind: 'send', label: callee(h.slice('signal '.length), 2) }
      if (h.startsWith('detach workflow ')) return { kind: 'detach', label: callee(h.slice('detach workflow '.length), 1) }
      if (h.startsWith('close ')) return { kind: 'close', label: h.slice('close '.length).split('(')[0] }
      return undefined
    case 'start':
      return call === undefined ? undefined : { kind: 'activity', label: callee(call, 1) }
    case 'end': {
      if (call !== undefined) return e.outcome && { kind: 'event', label: OUTCOME_LABEL[e.outcome] }
      const awaited = h.replace(/^await /, '')
      if (awaited.startsWith('timer(')) return { kind: 'timer', label: awaited }
      if (awaited.startsWith('signal ')) return { kind: 'await', label: awaited.split(' ')[1] }
      return undefined
    }
    case 'arrive':
      return { kind: 'handler', label: h.split(' ')[1] }
  }
}

export function fromExecution({ lanes, events }: Execution, { nodes }: Pick<ParserGraph, 'nodes'>, knobs: Knobs): Model {
  const queueOf = (node: string) => {
    const worker = node.startsWith('worker:') ? node : node.slice(node.indexOf('/worker:') + 1)
    return nodes.find(n => n.id === worker)?.queue
  }
  const handle = new Map(events.map(e => [eventKey(e), e.id]))
  const where = (e: ExecutionEvent) => `${e.lane}\n${e.stmt}\n${e.visit ?? []}`
  const dispatch = new Map(events.filter(e => e.edge).map(e => [where(e), e.edge!]))

  // An attempt waits, queued, from the event that dispatched it when it does not start next in its lane.
  const queued = new Map<string, ExecutionEvent>()
  const next = new Map<string, ExecutionEvent>()
  const last = new Map<string, ExecutionEvent>()
  for (const e of events) {
    const before = last.get(e.lane)
    if (before) next.set(before.id, e)
    last.set(e.lane, e)
    if (e.kind !== 'start') continue
    const from = events.find(p => where(p) === where(e) && (e.attempt === 1 ? p.kind === 'reach' : p.kind === 'end' && p.attempt === e.attempt! - 1))
    if (from && next.get(from.id) !== e) queued.set(from.id, e)
  }

  // A signal that runs a handler and resolves an await is one box: the handler
  // when its body draws something, else the await.
  const folded = new Set<string>()
  for (const arrival of events.filter(e => e.kind === 'arrive' && e.from)) {
    const awaited = events.find(e => e.lane === arrival.lane && e.kind === 'end' && e.from === arrival.from)
    if (!awaited) continue
    const body = events.some(e => e.lane === arrival.lane && e.stmt?.startsWith(`${arrival.stmt} › `) && e.visit?.[0] === arrival.visit?.[0] && drawn(e))
    folded.add(body ? awaited.id : arrival.id)
  }

  // Each event stands for the last step drawn at or before it in its lane.
  const stand = new Map<string, string>()
  const drawnLast = new Map<string, string>()
  const steps: Step[] = []
  const messages: Message[] = []
  const step = (id: string, key: string, e: ExecutionEvent, kind: StepKind, label: string, extra: Partial<Step>) => {
    steps.push({
      id, key: eventKey(e), lane: e.lane, kind, label: knobs.labels?.[key] ?? label, ...extra,
      ...(knobs.pauses?.[key] !== undefined && { pause: knobs.pauses[key] }),
    })
    drawnLast.set(e.lane, id)
  }
  const resolve = (ids: string[] = []) => ids.flatMap(id => stand.get(id) ?? [])
  for (const e of events) {
    const key = eventKey(e)
    const note = knobs.notes?.[key]
    const draw = folded.has(e.id) ? undefined : drawn(e) ?? (note !== undefined ? { kind: 'note' as const, label: note } : undefined)
    const after = resolve(e.after)
    const edge = dispatch.get(where(e))
    const queue = e.kind === 'start' && edge ? queueOf(edge.to) : undefined
    if (draw) {
      step(e.id, key, e, draw.kind, draw.label, {
        ...(e.outcome && { state: e.outcome === 'cancelled' ? 'cancelled' : 'failed' }),
        ...(e.attempt !== undefined && e.attempt > 1 && { attempt: e.attempt }),
        ...(after.length > 0 && { after }),
        ...(queue && { queue }),
      })
    }
    const waiting = queued.get(e.id)
    if (waiting) {
      const to = dispatch.get(where(waiting))?.to
      step(queuedId(waiting.id), queuedId(eventKey(waiting)), waiting, 'activity', drawn(waiting)!.label, {
        state: 'queued',
        ...(waiting.attempt! > 1 && { attempt: waiting.attempt }),
        ...(!draw && after.length > 0 && { after }),
        ...(to && { queue: queueOf(to) }),
      })
    }
    const at = drawnLast.get(e.lane)
    if (at !== undefined) stand.set(e.id, at)
    if (!draw) continue
    const outside = knobs.outside?.[key]
    if (outside) messages.push({ from: outside, to: e.id })
    if (e.from && stand.has(e.from)) messages.push({ from: stand.get(e.from)!, to: e.id })
  }

  return {
    title: knobs.title,
    lanes: lanes.map(l => {
      const kind = LANE_KIND[l.id.slice(0, l.id.indexOf(':'))]
      const key = l.id.slice(l.id.indexOf(':') + 1)
      const name = kind === 'workflow' ? key.slice(key.lastIndexOf('.') + 1) : key
      const queue = l.node && queueOf(l.node)
      const knob = knobs.lanes?.[l.id]
      const tag = knob?.tag ?? (queue ? { key: 'task_queue', value: queue } : undefined)
      return {
        id: l.id, kind, name, title: knob?.title ?? name.toUpperCase(),
        ...(tag && { tag }),
        ...(l.startedBy && { startedBy: stand.get(l.startedBy) }),
        ...(l.endedBy && { endedAt: stand.get(l.endedBy) }),
      }
    }),
    steps,
    messages,
    spans: (knobs.spans ?? []).map(s => ({ ...s, from: handle.get(s.from)!, to: handle.get(s.to)! })),
  }
}
