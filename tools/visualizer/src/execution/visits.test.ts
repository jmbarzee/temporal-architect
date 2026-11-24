import type { Graph } from '@jmbarzee/force-graph'
import type { Execution } from '@temporal-architect/wire-types'
import { describe, expect, it } from 'vitest'
import { agentSandbox } from '../sequence/fixtures/agent-sandbox'
import { script } from '../sequence/fixtures/sample'
import { spotTraining } from '../sequence/fixtures/spot-training'
import { crossedEdgeIds, timeAt, visitsOf, withVisits } from './visits'

const node = (w: string) => `workflow:${w}/worker:w/namespace:n`

/** A calls B twice and never C; the rules below each draw a variation of it. */
function calls() {
  const s = script()
  const a = s.lane({ id: 'workflow:A', node: node('A') })
  const b = s.lane({ id: 'workflow:B', node: node('B') })
  a.detach('detach workflow B()', node('B'), {})
  a.detach('detach workflow B() @2', node('B'), {})
  b.reach('step', {})
  return { s, a, b }
}

const graph: Graph = {
  nodes: ['A', 'B', 'C'].map(w => ({ id: node(w), name: w, values: {} })),
  edges: [
    { id: 'ab', sourceId: node('A'), targetId: node('B'), values: { dispatch: 'workflowCall' } },
    { id: 'bc', sourceId: node('B'), targetId: node('C'), values: { dispatch: 'workflowCall' } },
  ],
}

describe('the visited subgraph (rule-visited)', () => {
  it('holds the deployments and edges the execution reached, and not the rest', () => {
    const { s } = calls()
    const v = visitsOf(s.execution)
    expect([...v.nodes.keys()].sort()).toEqual([node('A'), node('B')])
    expect([...crossedEdgeIds(graph, v)]).toEqual(['ab'])
  })

  it('grows with the events played, in the order the contract lists them', () => {
    const { s } = calls()
    expect([...visitsOf(s.execution, 0).nodes.keys()]).toEqual([])
    expect([...visitsOf(s.execution, 1).nodes.keys()]).toEqual([node('A'), node('B')])
  })

  it.each([['agent-sandbox', agentSandbox, 9, 11], ['spot-training', spotTraining, 5, 4]] as const)('reads %s', (_, sample, nodes, edges) => {
    const v = visitsOf(sample.execution)
    expect(v.nodes.size).toBe(nodes)
    expect(v.edges.size).toBe(edges)
    expect(v.unreceived.size).toBe(0)
  })
})

describe('crossings per edge (rule-crossings)', () => {
  it('counts the events that carry an edge, and no other', () => {
    expect([...visitsOf(calls().s.execution).edges.values()].map(e => e.count)).toEqual([2])
  })

  it.each([['agent-sandbox', agentSandbox, 4], ['spot-training', spotTraining, 6]] as const)('counts the busiest edge of %s', (_, sample, busiest) => {
    expect(Math.max(...[...visitsOf(sample.execution).edges.values()].map(e => e.count))).toBe(busiest)
  })
})

describe('a message to a lane that has closed (rule-unreceived)', () => {
  function closed(sendAfterClose: boolean) {
    const s = script()
    const a = s.lane({ id: 'workflow:A', node: node('A') })
    const b = s.lane({ id: 'workflow:B', node: node('B') })
    if (!sendAfterClose) a.send('signal B.Ping()', node('B'), {})
    b.lane.endedBy = b.reach('close complete', {})
    if (sendAfterClose) a.send('signal B.Ping()', node('B'), {})
    return visitsOf(s.execution)
  }

  it('lands on nothing when each lane of the target ended first', () => {
    expect([...closed(true).unreceived.values()]).toEqual([1])
  })

  it('lands when the target was still running', () => {
    expect(closed(false).unreceived.size).toBe(0)
  })

  it('lands on a deployment while one of its instances still runs', () => {
    const s = script()
    const a = s.lane({ id: 'workflow:A', node: node('A') })
    const one = s.lane({ id: 'workflow:B @1', node: node('B') })
    s.lane({ id: 'workflow:B @2', node: node('B') })
    one.lane.endedBy = one.reach('close complete', {})
    a.send('signal B.Ping()', node('B'), {})
    expect(visitsOf(s.execution).unreceived.size).toBe(0)
  })
})

describe('instances of one deployment (rule-instances)', () => {
  const s = script()
  const a = s.lane({ id: 'workflow:A', node: node('A') })
  const one = s.lane({ id: 'workflow:B @1', node: node('B') })
  const two = s.lane({ id: 'workflow:B @2', node: node('B') })
  a.send('signal B.Ping()', node('B'), {})
  one.reach('step', {})
  two.reach('step', {})
  const execution: Execution = s.execution

  it.each([['agent-sandbox', agentSandbox], ['spot-training', spotTraining]] as const)('shows no chip where %s ran each deployment once', (_, { execution }) => {
    expect([...visitsOf(execution).nodes.values()].filter(i => i.length > 1)).toEqual([])
  })

  it('names each lane that ran on the deployment by its @n', () => {
    expect(visitsOf(execution).nodes.get(node('B'))).toEqual(['@1', '@2'])
  })

  it('carries them, the crossings and what found it ended as chips on the node, and leaves the rest alone', () => {
    const chips = (g: Graph, id: string) => g.nodes.find(n => n.id === id)!.badges
    const out = withVisits(graph, visitsOf(execution))
    expect(chips(out, node('B'))).toEqual(['@1', '@2', '×1 from A'])
    expect(chips(out, node('A'))).toBeUndefined()
    const { s: c } = calls()
    expect(chips(withVisits(graph, visitsOf(c.execution)), node('B'))).toEqual(['×2 from A'])
    expect(withVisits(graph, visitsOf({ lanes: [], events: [] }))).toBe(graph)
    const ended = script()
    const a = ended.lane({ id: 'workflow:A', node: node('A') })
    const b = ended.lane({ id: 'workflow:B', node: node('B') })
    b.lane.endedBy = b.reach('close complete', {})
    a.send('signal B.Ping()', node('B'), {})
    const lost: Graph = { ...graph, edges: [{ ...graph.edges[0], values: { dispatch: 'signalSend' } }] }
    expect(chips(withVisits(lost, visitsOf(ended.execution)), node('B'))).toEqual(['×1 from A', 'unreceived ×1'])
  })
})

describe('playback (rule-scrubber)', () => {
  it.each([['agent-sandbox', agentSandbox], ['spot-training', spotTraining]] as const)('plays %s from nothing to the whole, only ever growing', (_, { execution }) => {
    const size = (n: number) => { const v = visitsOf(execution, n); return v.nodes.size + v.edges.size }
    const sizes = execution.events.map((_, i) => size(i))
    expect(sizes[0]).toBe(0)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    expect(size(execution.events.length)).toBeGreaterThan(sizes[sizes.length - 1] - 1)
    expect(visitsOf(execution)).toEqual(visitsOf(execution, execution.events.length))
  })

  it('is the time of the last event played, when it was recorded', () => {
    const e: Execution = { lanes: [], events: [{ id: '1', lane: 'l', kind: 'occur', time: '2026-01-01T00:00:00Z' }, { id: '2', lane: 'l', kind: 'occur' }] }
    expect(timeAt(e, 1)).toBe('2026-01-01T00:00:00Z')
    expect(timeAt(e, 2)).toBeUndefined()
    expect(timeAt(e, 0)).toBeUndefined()
  })
})
