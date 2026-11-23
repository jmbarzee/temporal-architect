// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaxonomyContext, useLinkedViews } from '@jmbarzee/force-graph'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TAXONOMY } from '../adapter/node-types'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { fixtures } from './fixtures'
import { SequenceView } from './SequenceView'

afterEach(cleanup)

function Host({ name, query = '' }: { name: string; query?: string }) {
  const linked = useLinkedViews({ taxonomy: DEFAULT_TAXONOMY, views: ['sequence'] as const, initialSearch: { query, active: true } })
  return (
    <TaxonomyContext.Provider value={DEFAULT_TAXONOMY}>
      <SequenceView execution={fixtures[name]} systemTheme="light" {...linked.of('sequence')} />
    </TaxonomyContext.Provider>
  )
}

describe('SequenceView', () => {
  it('draws each lane, the numbered messages and the queue a step runs on', () => {
    const { container } = render(<Host name="agent-sandbox" />)
    expect(screen.getAllByText('AGENT')).toHaveLength(1)
    expect(container.querySelectorAll('.seq-lane')).toHaveLength(3)
    expect([...container.querySelectorAll('.seq-arrow text')].map(t => t.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    expect(screen.getAllByText('sandbox-{id}')).toHaveLength(2)
    expect(container.querySelectorAll('.seq-span')).toHaveLength(2)
  })

  it.each(Object.keys(fixtures))('draws %s', name => {
    const { container } = render(<Host name={name} />)
    expect(container.querySelectorAll('.seq-step')).toHaveLength(fixtures[name].steps.length)
  })

  it('marks a retry in place of its verb, and a lost timer as cancelled', () => {
    expect(render(<Host name="rule-attempts" />).container.querySelectorAll('.seq-step')[2].textContent).toBe('↺ Charge')
    cleanup()
    expect(render(<Host name="rule-winners" />).container.querySelectorAll('.seq-cancelled')).toHaveLength(1)
  })

  it('dims the steps a search does not match, and none without one', () => {
    expect(render(<Host name="spot-training" />).container.querySelectorAll('.search-dimmed')).toHaveLength(0)
    cleanup()
    const { container } = render(<Host name="spot-training" query="checkbatch" />)
    const lit = [...container.querySelectorAll('.seq-step:not(.search-dimmed)')].map(g => g.textContent)
    expect(lit).toEqual(['activity CheckBatchJob', 'activity CheckBatchJob'])
  })
})

describe('the Sequence tab', () => {
  const ast = { definitions: [] }
  const tabs = () => screen.getAllByRole('button').map(b => b.textContent)

  it('exists only with an execution, and shows it when the design is empty', () => {
    render(<WorkflowCanvas ast={{ definitions: [{ type: 'workflowDef', name: 'W', site: { line: 1, column: 1 }, params: '', body: [] }] } as never} />)
    expect(tabs()).not.toContain('Sequence')
    cleanup()
    const { container } = render(<WorkflowCanvas ast={ast} execution={fixtures['agent-sandbox']} />)
    expect(tabs()).toContain('Sequence')
    expect(container.querySelector('.view-pane:not(.hidden) .sequence-view')).not.toBeNull()
  })

  it('switches away and back', () => {
    const { container } = render(<WorkflowCanvas ast={ast} execution={fixtures['agent-sandbox']} />)
    fireEvent.click(screen.getByText('Graph'))
    expect(container.querySelector('.sequence-view')!.closest('.view-pane')!.classList.contains('hidden')).toBe(true)
    fireEvent.click(screen.getByText('Sequence'))
    expect(container.querySelector('.sequence-view')!.closest('.view-pane')!.classList.contains('hidden')).toBe(false)
  })

  it('carries the Tree\'s selections through unchanged', () => {
    const withTree = { definitions: [{ type: 'workflowDef', name: 'W', site: { line: 1, column: 1 }, params: '', body: [] }] } as never
    const { container } = render(<WorkflowCanvas ast={withTree} execution={fixtures['agent-sandbox']} />)
    const active = () => container.querySelectorAll('.view-pane:not(.hidden) .gv-chip.active').length
    expect(active()).toBe(1)
    fireEvent.click(screen.getByText('Workflows'))
    expect(active()).toBe(0)
    fireEvent.click(screen.getByText('Sequence'))
    fireEvent.click(screen.getByText('Tree'))
    expect(active()).toBe(0)
  })
})
