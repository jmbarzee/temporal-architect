// @vitest-environment happy-dom

// The sampler's {observedGraph, execution} for a run that continues as new,
// drawn as the host draws it: no AST, the design's identities alone.
import { cleanup, render, screen } from '@testing-library/react'
import type { Execution } from '@temporal-architect/wire-types'
import { afterEach, describe, expect, it } from 'vitest'
import sampled from '../../../sampler/history/testdata/order/order.golden.json'
import { VisualizerHost } from '../components/VisualizerHost'
import { fromExecution } from './fromExecution'

afterEach(cleanup)

describe('a sampled execution', () => {
  it('opens in the Sequence view with no AST', () => {
    const { container } = render(<VisualizerHost source={{ subscribe: on => { on({ type: 'ast', data: sampled }); return () => {} } }} />)
    expect(container.querySelector('.view-pane:not(.hidden) .sequence-view')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'order-1' })).toBeTruthy()
    expect(container.querySelectorAll('.seq-lane')).toHaveLength(4)
    expect([...container.querySelectorAll('.seq-step')].map(s => s.textContent)).toContain('↺ Notify')
  })

  it('starts a continued run where the run it follows ends', () => {
    const model = fromExecution(sampled.execution as Execution, sampled.observedGraph, { title: 'order-1' })
    const lane = (id: string) => model.lanes.find(l => l.id === id)!
    const end = lane('workflow:Order @1').endedAt
    expect(end).toBeDefined()
    expect(lane('workflow:Order @2').startedBy).toBe(end)
  })
})
