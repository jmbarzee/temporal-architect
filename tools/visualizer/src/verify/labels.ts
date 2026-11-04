// Checks for adapter/build's canvas labels: package name plus node name, from
// the graph's packages table, never parsed out of the id.

import { displayNameFor, nodeLabel } from '../adapter/build'
import type { ParserGraph, ParserNode } from '../types/parser-graph'
import { check, equal } from './check'

const node = (over: Partial<ParserNode>): ParserNode => ({ id: 'x', definition: 'workflow:x', ...over })

export function labelChecks(): void {
  const packages = {
    'example.com/demo/fabric/v1': { name: 'fabric' },
    'example.com/demo/cluster/fabric/v1': { name: 'fabric' },
    'example.com/demo/top': { name: 'top' },
  }
  check('a packaged node shows its package name, with its path when the name is shared', () => {
    const pn = node({ definition: 'workflow:example.com/demo/fabric/v1.Setup', name: 'Setup', packageId: 'example.com/demo/fabric/v1' })
    equal(displayNameFor('workflow', pn, packages), 'fabric.Setup (example.com/demo/fabric/v1)')
    const top = node({ definition: 'workflow:example.com/demo/top.Main', name: 'Main', packageId: 'example.com/demo/top' })
    equal(displayNameFor('workflow', top, packages), 'top.Main')
  })
  check('an operation shows the op alone', () => {
    const pn = node({ definition: 'nexusOperation:example.com/demo/top.Svc.Op', name: 'Svc.Op', packageId: 'example.com/demo/top' })
    equal(displayNameFor('nexusOperation', pn, packages), 'Op')
  })
  check('a default-package node shows its bare name', () => {
    equal(displayNameFor('workflow', node({ definition: 'workflow:Setup', name: 'Setup' }), undefined), 'Setup')
  })
  check('a node from an older twf, with no name, falls back to its definition key', () => {
    equal(displayNameFor('workflow', node({ definition: 'workflow:billing.Charge' }), undefined), 'billing.Charge')
    equal(displayNameFor('nexusOperation', node({ definition: 'nexusOperation:billing.Svc.Op' }), undefined), 'Op')
  })
  check('a finding names its node by label', () => {
    const pg = { nodes: [node({ id: 'workflow:top.Main/worker:w/namespace:ns', definition: 'workflow:top.Main', name: 'Main', packageId: 'top' })], packages: { top: { name: 'top' } } } as unknown as ParserGraph
    equal(nodeLabel(pg, 'workflow:top.Main/worker:w/namespace:ns'), 'top.Main')
    equal(nodeLabel(pg, 'missing'), 'missing')
  })
}
