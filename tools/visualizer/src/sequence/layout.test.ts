import { describe, expect, it } from 'vitest'
import type { Execution } from './execution'
import { fixtures } from './fixtures'
import { layoutExecution } from './layout'

// Each step's row in the sample's hand drawing, docs/workflows.svg of its repository.
const DRAWN_ROWS: Record<string, Record<string, number>> = {
  'agent-sandbox': {
    'a-request': 0, 'a-assign': 2, 'a-lease1': 5, 'a-grant1': 6, 'a-model1': 7, 'a-tool1': 8, 'a-model2': 9, 'a-release1': 10,
    'a-prompt': 12, 'a-lease2': 13, 'a-grant2': 14, 'a-model3': 15, 'a-tool2': 16, 'a-model4': 17, 'a-release2': 18, 'a-close': 19,
    'o-request': 0, 'o-detach': 1, 'o-assign': 2, 'o-next': 3,
    's-render': 2, 's-create': 3, 's-ready': 4, 's-lease1': 5, 's-grant1': 6, 's-release1': 10, 's-timer1': 11,
    's-lease2': 13, 's-grant2': 14, 's-release2': 18, 's-timer2': 19, 's-delete': 20, 's-close': 21,
  },
  'spot-training': {
    't-submit1': 0, 't-c0': 2, 't-c1000': 3, 't-c2000': 4, 't-c3000': 5, 't-q1': 7, 't-timer1': 8, 't-check1': 9, 't-wait': 10,
    't-c3400b': 12, 't-fail': 13, 't-q2': 14, 't-timer2': 15, 't-check2': 16, 't-submit2': 17, 't-c3400c': 19, 't-c4400': 20,
    't-terminate': 21, 't-close': 22,
    'b-submit1': 0, 'b-launch-a': 1, 'b-notice': 5, 'b-reclaimed': 6, 'b-runnable': 7, 'b-describe1': 9, 'b-launch-b': 11,
    'b-lost': 12, 'b-failed': 13, 'b-describe2': 16, 'b-submit2': 17, 'b-launch-c': 18, 'b-terminate': 21,
  },
}

describe('layoutExecution', () => {
  it.each(Object.keys(DRAWN_ROWS))('puts every step of %s on its drawn row', name => {
    const { rows } = layoutExecution(fixtures[name])
    expect(Object.fromEntries(rows)).toEqual(DRAWN_ROWS[name])
  })

  it('numbers the signals and the child start in time order, and no call or launch', () => {
    const agent = layoutExecution(fixtures['agent-sandbox']).arrows
    expect(agent.map(a => a.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(agent.map(a => a.kind).filter(k => k === 'child')).toHaveLength(1)
    const spot = layoutExecution(fixtures['spot-training']).arrows
    expect(spot.map(a => a.kind).sort()).toEqual(['call', 'call', 'call', 'call', 'call', 'launch', 'launch', 'launch'])
    expect(spot.every(a => a.n === undefined)).toBe(true)
  })

  it('tags a queue no column carries at its step, and not one a column carries', () => {
    const agent = layoutExecution(fixtures['agent-sandbox']).steps.filter(p => p.queueTag)
    expect(agent.map(p => p.step.id)).toEqual(['a-tool1', 'a-tool2'])
    const spot = layoutExecution(fixtures['spot-training'])
    expect(spot.steps.filter(p => p.queueTag)).toEqual([])
    const chunk = spot.steps.find(p => p.step.id === 't-c0')!
    const training = spot.steps.find(p => p.step.id === 't-submit1')!
    expect(chunk.box.x + chunk.box.width / 2).toBeGreaterThan(training.box.x + training.box.width / 2)
  })

  it('draws a host lost without notice, and one that is not', () => {
    const bars = layoutExecution(fixtures['spot-training']).lanes.flatMap(l => l.bar ? [l.bar.lost] : [])
    expect(bars).toEqual([false, true, false])
  })

  it('refuses an order that is a cycle, and a step it does not know', () => {
    const at = (id: string, after: string[]) => ({ id, lane: 'l', kind: 'event' as const, label: id, after })
    const lane = { id: 'l', kind: 'external' as const, name: 'l', title: 'L' }
    const base: Execution = { title: '', lanes: [lane], steps: [at('a', ['b']), at('b', ['a'])], messages: [], spans: [] }
    expect(() => layoutExecution(base)).toThrow('cycle')
    expect(() => layoutExecution({ ...base, steps: [at('a', ['x'])] })).toThrow('unknown step x')
  })
})
