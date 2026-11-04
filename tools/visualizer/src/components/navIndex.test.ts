import { describe, expect, it } from 'vitest'
import { buildNavIndex } from './navIndex'
import type { Definition } from '../types/ast'

// A name declared twice (DUPLICATE_*) relates to other definitions only
// through its first declaration, as the resolver keeps it: what a dropped
// definition, handler or operation calls or holds has no caller or container.
describe('buildNavIndex', () => {
  const call = (name: string) => ({ type: 'activityCall', name })
  const definitions = [
    {
      type: 'workflowDef', name: 'W', body: [call('Kept')],
      signals: [{ name: 'Ping', body: [call('KeptSignal')] }, { name: 'Ping', body: [call('DroppedSignal')] }],
      updates: [{ name: 'Bump', body: [call('KeptUpdate')] }, { name: 'Bump', body: [call('DroppedUpdate')] }],
    },
    { type: 'workflowDef', name: 'W', body: [call('DroppedWorkflow')] },
    {
      type: 'nexusServiceDef', name: 'S',
      operations: [{ name: 'Op', opType: 'sync', body: [call('KeptOp')] }, { name: 'Op', opType: 'async', workflowName: 'Backing' }],
    },
    { type: 'workerDef', name: 'w', workflows: [{ name: 'W' }] },
    { type: 'workerDef', name: 'w', workflows: [{ name: 'Z' }] },
    { type: 'namespaceDef', name: 'n', workers: [{ workerName: 'w' }] },
    { type: 'namespaceDef', name: 'n', workers: [{ workerName: 'x' }] },
  ] as unknown as Definition[]
  const { callers, workerOf, namespaceOf } = buildNavIndex(definitions)

  it('indexes what the kept declarations call and hold', () => {
    for (const a of ['Kept', 'KeptSignal', 'KeptUpdate']) {
      expect(callers.get(`activityDef:${a}`)).toEqual([{ defName: 'W', defType: 'workflowDef' }])
    }
    expect(callers.get('activityDef:KeptOp')).toEqual([{ defName: 'S', defType: 'nexusServiceDef' }])
    expect(workerOf.get('workflowDef:W')).toEqual(['w'])
    expect(namespaceOf.get('workerDef:w')).toEqual(['n'])
  })

  it('leaves out what the dropped declarations call and hold', () => {
    for (const key of ['activityDef:DroppedWorkflow', 'activityDef:DroppedSignal', 'activityDef:DroppedUpdate', 'workflowDef:Backing']) {
      expect(callers.get(key)).toBeUndefined()
    }
    expect(workerOf.get('workflowDef:Z')).toBeUndefined()
    expect(namespaceOf.get('workerDef:x')).toBeUndefined()
  })
})
