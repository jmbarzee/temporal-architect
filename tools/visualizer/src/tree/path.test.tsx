// @vitest-environment happy-dom

// The designs under ./designs are the two sample executions' designs, cut to the
// statements those executions reach; each .ast.json is the `definitions` of
// `twf parse <design dir>`, regenerated after editing a .twf there.

import { cleanup, fireEvent, render } from '@testing-library/react'
import { TaxonomyContext } from '@jmbarzee/force-graph'
import type { Execution } from '@temporal-architect/wire-types'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TAXONOMY } from '../adapter/node-types'
import { DefinitionBlock } from '../components/blocks/DefinitionBlock'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { fromExecution } from '../sequence/fromExecution'
import { agentSandbox } from '../sequence/fixtures/agent-sandbox'
import { spotTraining } from '../sequence/fixtures/spot-training'
import type { Sample } from '../sequence/fixtures/sample'
import type { Definition, TWFFile } from '../types/ast'
import { qualifiedNameOf } from '../types/ast'
import agentSandboxAst from './designs/agent-sandbox.ast.json'
import spotTrainingAst from './designs/spot-training.ast.json'
import { blockIds, segments } from './identity'
import { nodeOf, pathOf } from './path'
import { PathContext } from './PathContext'

afterEach(cleanup)

const AGENT = 'workflow:github.com/jmbarzee/temporal-agent-sandbox/twf/agent/v1.Agent'
const ORCHESTRATOR = 'workflow:github.com/jmbarzee/temporal-agent-sandbox/twf/sandbox/v1.SandboxOrchestrator'
const SANDBOX = 'workflow:github.com/jmbarzee/temporal-agent-sandbox/twf/sandbox/v1.Sandbox'
const TRAINING = 'workflow:github.com/jmbarzee/temporal-spot-training/twf/training/v1.Training'

const samples: Record<string, { sample: Sample; ast: TWFFile }> = {
  'agent-sandbox': { sample: agentSandbox, ast: agentSandboxAst as unknown as TWFFile },
  'spot-training': { sample: spotTraining, ast: spotTrainingAst as unknown as TWFFile },
}

const detail = (name: string, id: string) => pathOf(samples[name].sample.execution).detail(id)
const on = (name: string, id: string) => pathOf(samples[name].sample.execution).on(id)

describe('a block\'s identity', () => {
  it.each(Object.keys(samples))('joins every statement %s reaches to a block', name => {
    const { sample, ast } = samples[name]
    const known = new Set(blockIds(ast.definitions).values())
    const missing = sample.execution.events.flatMap(e => (e.stmt === undefined || known.has(e.stmt) ? [] : [e.stmt]))
    expect(missing).toEqual([])
  })

  it('ranks the heads siblings share and names a handler without its parameters', () => {
    const ids = [...blockIds(agentSandboxAst.definitions as unknown as Definition[]).values()]
    expect(ids).toContain(`${AGENT} › for @2 › for (call in reply.toolCalls) › activity sandbox.RunTool(call) -> output`)
    expect(ids).toContain(`${AGENT} › signal SandboxAssign › assigned = id`)
    expect(ids).toContain(`${AGENT} › if (resume == null) › await one @2 › signal SandboxLeaseGrant`)
  })

  it('splits an identity at separators outside strings', () => {
    expect(segments('workflow:a.B › signal x("a › b") @2 › if (c)')).toEqual(['workflow:a.B', 'signal x("a › b") @2', 'if (c)'])
  })
})

describe('the path an execution takes', () => {
  it('lights what ran and leaves off what did not', () => {
    expect(on('agent-sandbox', `${AGENT} › if (resume == null) › await one @1 › signal SandboxAssign`)).toBe(true)
    expect(on('agent-sandbox', `${AGENT} › if (resume == null) › await one @1 › timer(leaseWait)`)).toBe(false)
    expect(on('agent-sandbox', `${AGENT} › signal SandboxLeaseDeny`)).toBe(false)
    expect(on('agent-sandbox', `${AGENT} › signal SandboxAssign`)).toBe(true)
    expect(on('spot-training', `${TRAINING} › for (start < job.totalSteps) › for › await one › chunk`)).toBe(false)
  })

  it('counts the passes of a loop', () => {
    expect(detail('agent-sandbox', `${AGENT} › for @1`)).toEqual(['2 passes'])
    expect(detail('agent-sandbox', `${AGENT} › for @1 › for (call in reply.toolCalls)`)).toEqual(['1 pass'])
    expect(detail('agent-sandbox', `${SANDBOX} › for`)).toEqual(['5 passes'])
    expect(detail('spot-training', `${TRAINING} › for (start < job.totalSteps)`)).toEqual(['6 passes'])
  })

  it('names the case an await one took, and how often', () => {
    const lease = `${SANDBOX} › for › await one › signal LeaseRequest -> requester`
    expect(detail('agent-sandbox', lease)).toEqual(['won ×2', 'ran handler LeaseRequest ×2'])
    expect(detail('agent-sandbox', `${SANDBOX} › for › await one › signal LeaseRelease`)).toEqual(['won ×2', 'ran handler LeaseRelease ×2'])
    expect(detail('agent-sandbox', `${AGENT} › if (resume == null) › await one @1 › signal SandboxAssign`)).toEqual(['won', 'ran handler SandboxAssign'])
    expect(detail('spot-training', `${TRAINING} › for (start < job.totalSteps) › for › await one › timer(checkEvery)`)).toEqual(['won ×2'])
  })

  it('names the branch an if took', () => {
    expect(detail('agent-sandbox', `${SANDBOX} › for › await one › signal LeaseRequest -> requester › if (lease == null or lease.owner == requester or workflow.now() >= lease.expiry)`)).toEqual(['then ×2'])
    expect(detail('spot-training', `${TRAINING} › for (start < job.totalSteps) › for › await one › timer(checkEvery) › if (status.terminal)`)).toEqual(['then'])
    expect(detail('agent-sandbox', `${AGENT} › if (resume == null)`)).toEqual(['then'])
  })

  it('counts the attempts of a call and how each ended', () => {
    expect(detail('spot-training', `${TRAINING} › for (start < job.totalSteps) › promise chunk <- activity RunTrainingChunk(job, start)`)).toEqual(['#5 2 attempts: timed out, ok'])
    expect(detail('spot-training', `${TRAINING} › activity TerminateBatchJob(batchJob)`)).toEqual([])
  })

  it('shows a handler at the await where it ran', () => {
    expect(detail('agent-sandbox', `${AGENT} › await signal SandboxLeaseGrant`)).toEqual(['ran handler SandboxLeaseGrant'])
    expect(detail('agent-sandbox', `${ORCHESTRATOR} › for › await signal Request`)).toEqual(['ran handler Request'])
  })

  it('finds the graph node of a step: what it dispatches to, else its lane\'s', () => {
    const { execution } = agentSandbox
    const dispatch = execution.events.find(e => e.edge)!
    expect(nodeOf(execution, dispatch.id)).toBe(dispatch.edge!.to)
    const arrival = execution.events.find(e => e.kind === 'arrive')!
    expect(nodeOf(execution, arrival.id)).toBe(execution.lanes.find(l => l.id === arrival.lane)!.node)
    expect(nodeOf(execution, 'nothing')).toBeUndefined()
  })
})

function Drawn({ name, selected, onSelect }: { name: string; selected?: string; onSelect?: (s?: string) => void }) {
  const { sample, ast } = samples[name]
  const def = ast.definitions.find(d => qualifiedNameOf(d).endsWith(name === 'spot-training' ? '.Training' : '.Sandbox')) as Definition
  const value = React.useMemo(() => ({ ids: blockIds(ast.definitions), path: pathOf(sample.execution), selected, onSelect }), [ast, sample, selected, onSelect])
  return (
    <TaxonomyContext.Provider value={DEFAULT_TAXONOMY}>
      <PathContext.Provider value={value}>
        <DefinitionBlock definition={def} expanded />
      </PathContext.Provider>
    </TaxonomyContext.Provider>
  )
}

describe('the tree', () => {
  it.each(['agent-sandbox', 'spot-training'])('dims what %s did not run and notes what it did', name => {
    const { container } = render(<Drawn name={name} />)
    expect(container.querySelectorAll('.path-off').length).toBeGreaterThan(0)
    expect([...container.querySelectorAll('.path-note')].map(n => n.textContent)).toContain(name === 'spot-training' ? '6 passes' : '5 passes')
  })

  it('draws no path without an execution', () => {
    const { sample, ast } = samples['spot-training']
    const def = ast.definitions[0] as Definition
    const { container } = render(
      <TaxonomyContext.Provider value={DEFAULT_TAXONOMY}>
        <DefinitionBlock definition={def} expanded />
      </TaxonomyContext.Provider>,
    )
    expect(sample.execution.events.length).toBeGreaterThan(0)
    expect(container.querySelector('.path-mark')).toBeNull()
  })

  it('selects a step by its note, and selects it again to let go', () => {
    const chosen: (string | undefined)[] = []
    const { container, rerender } = render(<Drawn name="spot-training" onSelect={s => chosen.push(s)} />)
    const note = [...container.querySelectorAll('.path-note')].find(n => n.textContent === '6 passes')!
    fireEvent.click(note)
    const step = chosen[0]!
    expect(samples['spot-training'].sample.execution.events.some(e => e.id === step)).toBe(true)
    rerender(<Drawn name="spot-training" selected={step} onSelect={s => chosen.push(s)} />)
    expect(container.querySelectorAll('.path-selected')).toHaveLength(1)
    fireEvent.click(container.querySelector('.path-selected > .path-note')!)
    expect(chosen[1]).toBeUndefined()
  })
})

describe('a step selected in the tree', () => {
  it('is the step the Sequence view marks', () => {
    const { sample, ast } = samples['agent-sandbox']
    const execution: Execution = sample.execution
    const model = fromExecution(execution, sample.graph, sample.knobs)
    const { container } = render(<WorkflowCanvas ast={ast} run={execution} execution={model} />)
    fireEvent.click(container.querySelector('.block-header')!)
    fireEvent.click([...container.querySelectorAll('.path-note')].find(n => n.textContent === 'won · ran handler SandboxAssign')!)
    fireEvent.click(container.querySelectorAll('.tab-bar-btn')[2])
    expect(container.querySelectorAll('.seq-selected').length).toBe(1)
  })
})
