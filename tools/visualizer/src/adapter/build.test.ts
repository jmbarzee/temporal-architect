import { describe, expect, it } from 'vitest'
import { buildAstLookup, displayNameFor, nodeLabel } from './build'
import { nodeTypeForDefType } from './node-types'
import type { TWFFile } from '../types/ast'
import type { ParserGraph, ParserNode } from '../types/parser-graph'

// Canvas labels: package name plus node name, from the graph's packages table,
// never parsed out of the id.
describe('displayNameFor', () => {
  const node = (over: Partial<ParserNode>): ParserNode => ({ id: 'x', definition: 'workflow:x', ...over })
  const packages = {
    'example.com/demo/fabric/v1': { name: 'fabric' },
    'example.com/demo/cluster/fabric/v1': { name: 'fabric' },
    'example.com/demo/top': { name: 'top' },
  }

  it('a packaged node shows its package name, with its path when the name is shared', () => {
    const pn = node({ definition: 'workflow:example.com/demo/fabric/v1.Setup', name: 'Setup', packageId: 'example.com/demo/fabric/v1' })
    expect(displayNameFor('workflow', pn, packages)).toBe('fabric.Setup (example.com/demo/fabric/v1)')
    const top = node({ definition: 'workflow:example.com/demo/top.Main', name: 'Main', packageId: 'example.com/demo/top' })
    expect(displayNameFor('workflow', top, packages)).toBe('top.Main')
  })
  it('an operation shows the op alone', () => {
    const pn = node({ definition: 'nexusOperation:example.com/demo/top.Svc.Op', name: 'Svc.Op', packageId: 'example.com/demo/top' })
    expect(displayNameFor('nexusOperation', pn, packages)).toBe('Op')
  })
  it('a default-package node shows its bare name', () => {
    expect(displayNameFor('workflow', node({ definition: 'workflow:Setup', name: 'Setup' }), undefined)).toBe('Setup')
  })
  it('a node from an older twf, with no name, falls back to its definition key', () => {
    expect(displayNameFor('workflow', node({ definition: 'workflow:billing.Charge' }), undefined)).toBe('billing.Charge')
    expect(displayNameFor('nexusOperation', node({ definition: 'nexusOperation:billing.Svc.Op' }), undefined)).toBe('Op')
  })
  it('a finding names its node by label', () => {
    const pg = { nodes: [node({ id: 'workflow:top.Main/worker:w/namespace:ns', definition: 'workflow:top.Main', name: 'Main', packageId: 'top' })], packages: { top: { name: 'top' } } } as unknown as ParserGraph
    expect(nodeLabel(pg, 'workflow:top.Main/worker:w/namespace:ns')).toBe('top.Main')
    expect(nodeLabel(pg, 'missing')).toBe('missing')
  })
})

describe('nodeTypeForDefType', () => {
  it('maps a Tree focus definition type to the graph kind of its key', () => {
    expect(nodeTypeForDefType('workflowDef')).toBe('workflow')
    expect(nodeTypeForDefType('nexusServiceDef')).toBe('nexusService')
    expect(nodeTypeForDefType('nope')).toBeUndefined()
  })
})

// #243 / #249: Show in Tree resolves a graph node to the top-level definition
// that owns it and, for a nested node, the row inside it to reveal.
describe('buildAstLookup', () => {
  const ast = {
    definitions: [
      { type: 'workflowDef', name: 'Charge', qualifiedName: 'billing.Charge' },
      { type: 'workerDef', name: 'billing-worker' },
      {
        type: 'nexusServiceDef', name: 'Payments', qualifiedName: 'billing.Payments',
        operations: [{ name: 'GetPaymentStatus' }, { name: 'Refund' }],
      },
      { type: 'nexusServiceDef', name: 'Notifications', operations: [{ name: 'SendConfirmation' }] },
      { type: 'namespaceDef', name: 'notifications', endpoints: [{ endpointName: 'NotificationsEndpoint' }] },
    ],
  } as unknown as TWFFile
  const lookup = buildAstLookup(ast)
  const owner = (key: string) => {
    const o = lookup.get(key)
    return o && { name: o.def.name, type: o.def.type, child: o.child }
  }

  it('maps a top-level node to its own definition, with no nested row', () => {
    expect(owner('workflow:billing.Charge')).toEqual({ name: 'Charge', type: 'workflowDef', child: undefined })
    expect(owner('worker:billing-worker')).toEqual({ name: 'billing-worker', type: 'workerDef', child: undefined })
    expect(owner('nexusService:billing.Payments')).toEqual({ name: 'Payments', type: 'nexusServiceDef', child: undefined })
  })
  it('maps a nexus operation to its service and names its row', () => {
    expect(owner('nexusOperation:billing.Payments.Refund')).toEqual({ name: 'Payments', type: 'nexusServiceDef', child: 'Refund' })
    expect(owner('nexusOperation:Notifications.SendConfirmation')).toEqual({ name: 'Notifications', type: 'nexusServiceDef', child: 'SendConfirmation' })
  })
  it('maps a nexus endpoint to its namespace and names its row', () => {
    expect(owner('nexusEndpoint:NotificationsEndpoint')).toEqual({ name: 'notifications', type: 'namespaceDef', child: 'NotificationsEndpoint' })
  })
})

// A name declared twice (DUPLICATE_*) is its first declaration's, as the
// resolver keeps it: Show in Tree reveals the first.
describe('buildAstLookup with duplicates', () => {
  const ast = {
    definitions: [
      { type: 'workflowDef', name: 'W', line: 1 },
      { type: 'workflowDef', name: 'W', line: 5 },
      { type: 'activityDef', name: 'A', line: 9 },
      { type: 'activityDef', name: 'A', line: 12 },
      { type: 'workerDef', name: 'w', line: 15 },
      { type: 'workerDef', name: 'w', line: 18 },
      { type: 'nexusServiceDef', name: 'S', line: 21, operations: [{ name: 'Op' }] },
      { type: 'nexusServiceDef', name: 'S', line: 24, operations: [{ name: 'Op' }] },
      { type: 'namespaceDef', name: 'n', line: 27, endpoints: [{ endpointName: 'e' }] },
      { type: 'namespaceDef', name: 'm', line: 31, endpoints: [{ endpointName: 'e' }] },
      { type: 'namespaceDef', name: 'n', line: 35, endpoints: [] },
    ],
  } as unknown as TWFFile
  const lookup = buildAstLookup(ast)
  it.each([
    ['workflow:W', 1],
    ['activity:A', 9],
    ['worker:w', 15],
    ['nexusService:S', 21],
    ['nexusOperation:S.Op', 21],
    ['namespace:n', 27],
    ['nexusEndpoint:e', 27],
  ])('maps %s to the first declaration', (key, line) => {
    expect((lookup.get(key)?.def as unknown as { line: number }).line).toBe(line)
  })
})
