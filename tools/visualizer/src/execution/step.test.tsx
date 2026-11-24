// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Execution } from '@temporal-architect/wire-types'
import { afterEach, describe, expect, it } from 'vitest'
import { DEF_TYPE_DIMENSION } from '../adapter/dimensions'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { agentSandbox } from '../sequence/fixtures/agent-sandbox'
import { spotTraining } from '../sequence/fixtures/spot-training'
import type { Sample } from '../sequence/fixtures/sample'
import { fromExecution } from '../sequence/fromExecution'
import { pathOf } from '../tree/path'
import agentSandboxAst from '../tree/designs/agent-sandbox.ast.json'
import spotTrainingAst from '../tree/designs/spot-training.ast.json'
import type { Definition, TWFFile } from '../types/ast'
import { linkOf, parseLink } from './link'
import { eventKey, eventOf, familyOf, focusOf } from './step'

afterEach(cleanup)

const samples: Record<string, { sample: Sample; ast: TWFFile }> = {
  'agent-sandbox': { sample: agentSandbox, ast: agentSandboxAst as unknown as TWFFile },
  'spot-training': { sample: spotTraining, ast: spotTrainingAst as unknown as TWFFile },
}
const names = Object.keys(samples)

/** The key of the sample's step named in its hand drawing. */
const named = (sample: Sample, name: string) => eventKey(sample.execution.events.find(e => e.id === Object.entries(sample.names).find(([, n]) => n === name)![0])!)

const SUBMIT = 't-submit1'
const view = (c: HTMLElement) => c.querySelector('.view-pane:not(.hidden)')!
const stepEl = (c: HTMLElement, key: string) => [...view(c).querySelectorAll('[data-step]')].find(g => g.getAttribute('data-step') === key)!
const tab = (c: HTMLElement, name: string) => fireEvent.click([...c.querySelectorAll('.tab-bar-btn')].find(b => b.textContent === name)!)

function canvas(name: string, props: { link?: string } = {}) {
  const { sample, ast } = samples[name]
  // A graph holding every deployment the execution runs on or dispatches to, each named by its definition.
  const ids = new Set([...sample.execution.lanes.map(l => l.node), ...sample.execution.events.map(e => e.edge?.to)].filter(Boolean) as string[])
  const node = (id: string) => ({ id, definition: id.split('/')[0], name: id.match(/\.(\w+)\/worker:/)?.[1] ?? id })
  const parserGraph = {
    summary: { nodes: ids.size, edges: 0, coarsenedEdges: 0, unresolved: 0, diagnostics: 0 },
    nodes: [...ids].map(node),
    edges: [], coarsenedEdges: [], unresolved: [], diagnostics: [],
  } as never
  return render(<WorkflowCanvas ast={ast} execution={sample.execution as Execution} parserGraph={parserGraph} sequence={fromExecution(sample.execution, sample.graph, sample.knobs)} {...props} />)
}

describe('a step as a focus', () => {
  it.each(names)('names the lane, the step and the definition of every event of %s that has one', name => {
    const { sample, ast } = samples[name]
    for (const e of sample.execution.events.filter(e => e.stmt !== undefined)) {
      const focus = focusOf(sample.execution, ast.definitions as Definition[], eventKey(e))!
      expect([focus.lane, focus.step]).toEqual([e.lane, eventKey(e)])
      expect(focus.values[DEF_TYPE_DIMENSION], e.stmt).toBeDefined()
    }
  })

  it('has no definition for a lane outside the design, and none for an event it does not hold', () => {
    const { sample, ast } = samples['spot-training']
    const outside = sample.execution.events.find(e => e.lane.startsWith('outside:'))!
    expect(focusOf(sample.execution, ast.definitions as Definition[], eventKey(outside))!.values).toEqual({})
    expect(focusOf(sample.execution, ast.definitions as Definition[], 'nothing')).toBeUndefined()
  })

  it('takes the events of one visit of a statement as the step\'s family', () => {
    const { sample } = samples['spot-training']
    const key = named(sample, SUBMIT)
    expect(familyOf(sample.execution, key).map(e => e.kind)).toEqual(['reach', 'start'])
    expect(eventOf(sample.execution, key)!.kind).toBe('start')
  })
})

describe('the link', () => {
  it('names a step and a view, beside what the page already has', () => {
    const search = linkOf('?ast=a.json&execution=spot-training', { step: '["a",1]', view: 'graph' })
    expect(search).toBe('?ast=a.json&execution=spot-training&step=%5B%22a%22%2C1%5D&view=graph')
    expect(parseLink(search)).toEqual({ step: '["a",1]', view: 'graph' })
    expect(parseLink('?view=nowhere')).toEqual({})
  })
})

describe.each(names)('a step selected in %s', name => {
  const { sample } = samples[name]
  const key = named(sample, name === 'spot-training' ? SUBMIT : 'a-assign')

  it('selected in the sequence is outlined on its block in the tree', () => {
    const { container } = canvas(name)
    tab(container, 'Sequence')
    fireEvent.click(stepEl(container, key))
    tab(container, 'Tree')
    fireEvent.click(container.querySelector('.block-header')!)
    expect([...view(container).querySelectorAll('.path-selected')].map(m => m.getAttribute('data-stmt'))).toEqual([eventOf(sample.execution, key)!.stmt])
  })

  it('selected in the tree is marked in the sequence, and let go by selecting it again', () => {
    const { container } = canvas(name)
    fireEvent.click(container.querySelector('.block-header')!)
    // A block whose step the sequence draws.
    const path = pathOf(sample.execution)
    const drawn = new Set(fromExecution(sample.execution, sample.graph, sample.knobs).steps.map(s => s.key))
    const mark = [...container.querySelectorAll('.path-mark')].find(m => drawn.has(path.step(m.getAttribute('data-stmt')!)) && m.querySelector('.path-note:not(:disabled)'))!
    fireEvent.click(mark.querySelector('.path-note')!)
    tab(container, 'Sequence')
    expect(view(container).querySelectorAll('.seq-selected').length).toBeGreaterThan(0)
    fireEvent.click(view(container).querySelector('.seq-selected')!)
    expect(container.querySelector('.step-panel')).toBeNull()
  })

  it('opens from a link on its view, and the link is the one that opens it', async () => {
    const link = (v: string) => `?step=${encodeURIComponent(key)}&view=${v}`
    const sequence = canvas(name, { link: link('sequence') }).container
    expect(view(sequence).querySelector('.sequence-view')).not.toBeNull()
    expect(view(sequence).querySelectorAll('.seq-selected').length).toBeGreaterThan(0)
    expect(parseLink(new URL(sequence.querySelector<HTMLAnchorElement>('.step-panel a')!.href, 'http://x').search)).toEqual({ step: key, view: 'sequence' })
    cleanup()

    const tree = canvas(name, { link: link('tree') }).container
    await waitFor(() => expect(view(tree).querySelectorAll('.path-selected').length).toBeGreaterThan(0))
  })

  it('moves the scrubber to it, and the scrubber moves the selection', () => {
    const { container } = canvas(name, { link: `?step=${encodeURIComponent(key)}&view=graph` })
    const at = sample.execution.events.findIndex(e => eventKey(e) === key) + 1
    expect(screen.getByText(`${at} / ${sample.execution.events.length}`)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Step back'))
    expect(screen.getByText(`${at - 1} / ${sample.execution.events.length}`)).toBeTruthy()
    const previous = eventKey(sample.execution.events[at - 2])
    const href = container.querySelector<HTMLAnchorElement>('.step-panel a')!.href
    expect(parseLink(new URL(href, 'http://x').search).step).toBe(previous)
    fireEvent.click(screen.getByLabelText('Clear step'))
    expect(container.querySelector('.step-panel')).toBeNull()
    expect(screen.getByText(`${sample.execution.events.length} / ${sample.execution.events.length}`)).toBeTruthy()
  })
})

describe('the info panel', () => {
  const { sample } = samples['spot-training']
  const key = named(sample, SUBMIT)

  it('shows the events of the step, with its lane and where else it can be shown', () => {
    const { container } = canvas('spot-training', { link: `?step=${encodeURIComponent(key)}&view=tree` })
    const panel = container.querySelector('.step-panel')!
    expect(panel.querySelector('.step-lane')!.textContent).toContain('Training')
    expect([...panel.querySelectorAll('li')].map(li => li.textContent)).toEqual([
      'reach activityCall Training → SubmitBatchJob',
      'start attempt 1',
    ])
    expect(panel.querySelector('.step-this')!.textContent).toBe('start attempt 1')
    expect([...panel.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Graph', 'Sequence', '×'])
  })

  it('shows the step in the view a link names', () => {
    const { container } = canvas('spot-training', { link: `?step=${encodeURIComponent(key)}&view=tree` })
    fireEvent.click([...container.querySelectorAll('.step-panel button')].find(b => b.textContent === 'Sequence')!)
    expect(view(container).querySelector('.sequence-view')).not.toBeNull()
    expect([...container.querySelectorAll('.step-panel button')].map(b => b.textContent)).toEqual(['Tree', 'Graph', '×'])
  })
})
