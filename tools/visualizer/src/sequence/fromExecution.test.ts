import { describe, expect, it } from 'vitest'
import { script } from './fixtures/sample'
import { layoutExecution } from './layout'
import { fromExecution, queuedId, type Knobs } from './fromExecution'

const RUN = 'promise r <- activity p.Run(x) -> y'
const node = (worker: string, queue: string) => ({ id: `worker:${worker}/namespace:n`, definition: `worker:${worker}`, name: worker, queue })
const graph = { nodes: [node('w', 'q'), node('h', 'hosts')] }

function sample(knobs: (key: (id: string) => string, ids: Record<string, string>) => Partial<Knobs> = () => ({})) {
  const s = script()
  const w = s.lane({ id: 'workflow:p.W', node: 'workflow:p.W/worker:w/namespace:n' })
  const v = s.lane({ id: 'workflow:p.V', node: 'workflow:p.V/worker:w/namespace:n' })
  const api = s.lane({ id: 'outside:API' })
  const ids = {
    computed: w.reach('x = 1'),
    sent: w.send('signal p.V.Go(x)', v.lane.node!),
    handled: v.arrive('signal Go', { visit: [1] }),
    dispatched: w.reach(RUN, { edge: { from: w.lane.node!, to: 'activity:p.Run/worker:h/namespace:n', kind: 'activityCall' } }),
    timer: w.end('await timer(1h)', { outcome: 'cancelled' }),
    started: w.start(RUN),
    timedOut: w.end(RUN, { attempt: 1, outcome: 'timedOut' }),
    retried: w.start(RUN, { attempt: 2 }),
    awaited: v.end('await signal Go'),
    called: api.occur('called'),
    detached: w.detach('detach workflow p.Child()', 'workflow:p.Child/worker:w/namespace:n'),
    closed: w.reach('close complete(x)'),
  }
  const event = (id: string) => s.execution.events.find(e => e.id === id)!
  event(ids.handled).from = ids.sent
  event(ids.awaited).from = ids.sent
  Object.assign(event(ids.called), { from: ids.retried, after: [ids.computed, ids.dispatched] })
  return { ids, model: fromExecution(s.execution, graph, { title: 'T', ...knobs(s.key, ids) }) }
}

describe('fromExecution', () => {
  it('draws an event by the head it reaches, and nothing for a statement that only computes', () => {
    const { ids, model } = sample()
    expect(model.steps.map(s => [s.id, s.kind, s.label, s.state, s.attempt])).toEqual([
      [ids.sent, 'send', 'V.Go', undefined, undefined],
      [queuedId(ids.started), 'activity', 'Run', 'queued', undefined],
      [ids.timer, 'timer', 'timer(1h)', 'cancelled', undefined],
      [ids.started, 'activity', 'Run', undefined, undefined],
      [ids.timedOut, 'event', 'timed out', 'failed', undefined],
      [ids.retried, 'activity', 'Run', undefined, 2],
      [ids.awaited, 'await', 'Go', undefined, undefined],
      [ids.called, 'event', 'called', undefined, undefined],
      [ids.detached, 'detach', 'Child', undefined, undefined],
      [ids.closed, 'close', 'complete', undefined, undefined],
    ])
  })

  it('takes a call\'s queue from the node its edge reaches, and a lane\'s from its own', () => {
    const { ids, model } = sample()
    expect(model.steps.filter(s => s.queue).map(s => [s.id, s.queue])).toEqual([
      [queuedId(ids.started), 'hosts'], [ids.started, 'hosts'], [ids.retried, 'hosts'],
    ])
    expect(model.lanes.map(l => [l.kind, l.name, l.title, l.tag?.value])).toEqual([
      ['workflow', 'W', 'W', 'q'], ['workflow', 'V', 'V', 'q'], ['external', 'API', 'API', undefined],
    ])
  })

  it('joins an event to its cause, an undrawn event standing for the last step drawn before it in its lane', () => {
    const { ids, model } = sample()
    expect(model.messages).toEqual([
      { from: ids.sent, to: ids.awaited },
      { from: ids.retried, to: ids.called },
    ])
    expect(model.steps.find(s => s.id === ids.called)!.after).toEqual([queuedId(ids.started)])
  })

  it.each([
    ['terminated', 'terminated'],
    ['timedOut', 'timed out'],
    ['cancelled', 'cancelled'],
  ] as const)('ends a run the server %s at a failed event step, where its box ends', (outcome, label) => {
    const s = script()
    const w = s.lane({ id: 'workflow:p.W', node: 'workflow:p.W/worker:w/namespace:n' })
    const sent = w.reach('close complete(x)')
    const end = `${w.lane.id}/2`
    s.execution.events.push({ id: end, lane: w.lane.id, kind: 'end', outcome })
    w.lane.endedBy = end
    const model = fromExecution(s.execution, graph, { title: 'T' })
    expect(model.steps.map(x => [x.id, x.kind, x.label, x.state])).toEqual([[sent, 'close', 'complete', undefined], [end, 'event', label, 'failed']])
    expect(model.lanes[0].endedAt).toBe(end)
    const { lanes, steps } = layoutExecution(model)
    const at = steps.find(x => x.step.id === end)!.box
    expect(lanes[0].box!.y + lanes[0].box!.height).toBeGreaterThan(at.y + at.height)
    expect(lanes[0].box!.y + lanes[0].box!.height).toBeLessThan(at.y + at.height + 20)
  })

  it('takes what an execution does not hold from its knobs', () => {
    const { ids, model } = sample()
    const knobbed = sample((key, ids) => ({
      lanes: { 'outside:API': { title: 'THE API', tag: { key: 'k', value: 'v' } } },
      labels: { [key(ids.started)]: 'Run(1) → 2' },
      pauses: { [key(ids.timer)]: 2 },
      notes: { [key(ids.computed)]: 'x is set' },
      spans: [{ lane: 'workflow:p.W', label: 'held', from: key(ids.sent), to: key(ids.closed) }],
      outside: { [key(ids.awaited)]: { outside: 'user' } },
    })).model
    const step = (id: string) => knobbed.steps.find(s => s.id === id)!
    expect(knobbed.lanes[2]).toMatchObject({ title: 'THE API', tag: { key: 'k', value: 'v' } })
    expect([step(ids.started).label, step(ids.timer).pause, step(ids.computed).kind]).toEqual(['Run(1) → 2', 2, 'note'])
    expect(knobbed.spans).toEqual([{ lane: 'workflow:p.W', label: 'held', from: ids.sent, to: ids.closed }])
    expect(knobbed.messages).toContainEqual({ from: { outside: 'user' }, to: ids.awaited })
    expect(model.spans).toEqual([])
  })
})
