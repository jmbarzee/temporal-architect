import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Execution } from './execution'
import { rules, samples } from './fixtures'
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
    const { rows } = layoutExecution(samples[name])
    expect(Object.fromEntries(rows)).toEqual(DRAWN_ROWS[name])
  })

  it('numbers the signals and the child start in time order, and no call or launch', () => {
    const agent = layoutExecution(samples['agent-sandbox']).arrows
    expect(agent.map(a => a.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(agent.map(a => a.kind).filter(k => k === 'child')).toHaveLength(1)
    const spot = layoutExecution(samples['spot-training']).arrows
    expect(spot.map(a => a.kind).sort()).toEqual(['call', 'call', 'call', 'call', 'call', 'launch', 'launch', 'launch'])
    expect(spot.every(a => a.n === undefined)).toBe(true)
  })

  it('tags a queue no column carries at its step, and not one a column carries', () => {
    const agent = layoutExecution(samples['agent-sandbox']).steps.filter(p => p.queueTag)
    expect(agent.map(p => p.step.id)).toEqual(['a-tool1', 'a-tool2'])
    const spot = layoutExecution(samples['spot-training'])
    expect(spot.steps.filter(p => p.queueTag)).toEqual([])
    const chunk = spot.steps.find(p => p.step.id === 't-c0')!
    const training = spot.steps.find(p => p.step.id === 't-submit1')!
    expect(chunk.box.x + chunk.box.width / 2).toBeGreaterThan(training.box.x + training.box.width / 2)
  })

  it('draws a host lost without notice, and one that is not', () => {
    const bars = layoutExecution(samples['spot-training']).lanes.flatMap(l => l.bar ? [l.bar.lost] : [])
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

// One block per rule of spec/SEQUENCE_VIEW.md, on its fixture in fixtures/rules.ts.
describe('the fixed rules', () => {
  it('are the fixtures the spec names, each of them', () => {
    const spec = readFileSync(new URL('../../spec/SEQUENCE_VIEW.md', import.meta.url), 'utf8')
    const named = [...spec.matchAll(/`(rule-[a-z-]+)`/g)].map(m => m[1])
    expect(new Set(named)).toEqual(new Set(Object.keys(rules)))
  })

  const draw = (name: string) => {
    const layout = layoutExecution(rules[name])
    const step = (id: string) => layout.steps.find(p => p.step.id === id)!
    const column = (title: string) => layout.columns.find(c => c.title === title)!
    const lane = (id: string) => layout.lanes.find(l => l.lane.id === id)!
    return { layout, step, column, lane, centre: (id: string) => step(id).box.x + step(id).box.width / 2 }
  }

  it('rows: a step sits below what precedes it, a pause adds rows, and `after` orders across lanes', () => {
    expect(Object.fromEntries(draw('rule-rows').layout.rows)).toEqual({ a1: 0, a2: 1, a3: 4, b1: 2 })
  })

  it('link ends: a message\'s two ends share the later row and its arrow runs between their facing edges', () => {
    const { layout, step } = draw('rule-link-ends')
    const [send, recv] = [step('a-send').box, step('b-recv').box]
    expect([layout.rows.get('b2'), layout.rows.get('a-send'), layout.rows.get('b-recv')]).toEqual([1, 2, 2])
    expect(send.y).toBe(recv.y)
    const arrow = layout.arrows.find(a => a.x1 === send.x + send.width)!
    expect([arrow.x2, arrow.y]).toEqual([recv.x - 2, send.y + send.height / 2])
  })

  it('link ends: a message from outside enters left of its lane, in clear space', () => {
    const { layout, step, lane } = draw('rule-link-ends')
    const [input] = layout.inputs
    expect(input.outside).toBe('user')
    expect(input.y).toBe(layout.arrows.find(a => a.x2 === step('a-next').box.x - 2)!.y)
    expect(input.x).toBeLessThan(lane('a').box!.x)
    expect(layout.arrows.every(a => a.x1 >= 0 && a.x2 >= 0)).toBe(true)
  })

  it('lane set: a queue only offset work lives on is a tag, not a column', () => {
    const { layout, step } = draw('rule-queue-tag')
    expect(layout.columns.map(c => c.title)).toEqual(['A'])
    expect(layout.lanes.map(l => l.lane.id)).toEqual(['a'])
    expect(step('a-run').queueTag).toMatchObject({ key: 'task_queue', value: 'pods' })
  })

  it('lane set: a queue something lives on is a column, and work for it is not tagged', () => {
    const { layout, step } = draw('rule-queue-lane')
    expect(layout.columns.map(c => c.title)).toEqual(['A', 'HOSTS'])
    expect(step('a-run').queueTag).toBeUndefined()
  })

  it('lane set: lanes sharing a title share a column, and may not overlap in life', () => {
    expect(draw('rule-grouping').layout.columns.map(c => c.title)).toEqual(['A', 'HOSTS'])
    const e = rules['rule-grouping']
    const overlapping = { ...e, lanes: e.lanes.map(l => l.id === 'h2' ? { ...l, startedBy: 'a2' } : l) }
    expect(() => layoutExecution(overlapping)).toThrow('h1 and h2 share column HOSTS and overlap')
  })

  it('lifetimes: a child begins at its start, a lost host ends in a mark, an unended host lasts, a span bars a held state', () => {
    const { layout, step, lane } = draw('rule-lifetimes')
    expect(lane('child').box!.y).toBe(step('p-spawn').box.y - 4)
    expect([lane('h1').bar!.lost, lane('h2').bar!.lost]).toEqual([true, false])
    const parent = lane('parent').box!
    expect(lane('h2').bar!.y2).toBe(parent.y + parent.height)
    const [span] = layout.spans
    expect([span.box.y, span.box.y + span.box.height]).toEqual([step('p-grant').box.y, step('p-release').box.y + step('p-release').box.height])
    expect(span.box.x).toBeGreaterThan(parent.x + parent.width)
  })

  it('offset: a step shifts toward the column that runs it, by one amount, and not on its own queue', () => {
    const { column, centre } = draw('rule-offset')
    const shift = (id: string) => centre(id) - column('MID').x
    expect(shift('m-left')).toBeLessThan(0)
    expect(shift('m-right')).toBe(-shift('m-left'))
    expect(shift('m-own')).toBe(0)
  })

  it('offset: with no column to shift toward, a step shifts left, toward its tag', () => {
    const { column, step, centre } = draw('rule-queue-tag')
    const tag = step('a-run').queueTag!.box
    expect(centre('a-run')).toBeLessThan(column('A').x)
    expect(tag.x + tag.width).toBeLessThan(step('a-run').box.x)
  })

  it('attempts: the first keeps its verb and each retry is its own box with a mark in its place', () => {
    const { layout } = draw('rule-attempts')
    expect(layout.steps.map(p => [p.verb, p.text])).toEqual([
      ['activity', 'Charge'], ['', 'timed out'], ['', '↺ Charge'], ['', '↺ Charge'],
    ])
  })

  it('winners: a cancelled timer takes its row before the signal that won, and no arrow touches it', () => {
    const { layout, step } = draw('rule-winners')
    expect(layout.rows.get('b-timer')).toBeLessThan(layout.rows.get('b-won')!)
    expect(step('b-timer').text).toBe('timer(1h) cancelled')
    expect(layout.arrows).toHaveLength(1)
  })

  it('one box per call: an activity run elsewhere, a call and a child start are one box each, in the caller\'s lane', () => {
    const { layout } = draw('rule-one-box')
    expect(layout.steps.map(p => p.step.id)).toEqual(rules['rule-one-box'].steps.map(s => s.id))
    expect(layout.steps.filter(p => p.step.lane === 'pods')).toEqual([])
    expect(layout.steps.filter(p => p.step.lane === 'child').map(p => p.step.id)).toEqual(['c1'])
    expect(layout.arrows.map(a => a.kind).sort()).toEqual(['call', 'child', 'launch'])
  })
})
