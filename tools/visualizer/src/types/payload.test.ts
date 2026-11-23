import { describe, expect, it } from 'vitest'
import { nodeLabel } from '../adapter/build'
import { normalizePayload } from './payload'

// An observed graph of a packaged design carries the packages table, so its
// nodes are labelled as the design graph's are, with no AST to ask.
describe('normalizePayload of an observed graph', () => {
  const process = (pkg: string, queue: string) => ({
    id: `workflow:${pkg}.Process/worker:${queue}/namespace:shop`,
    definition: `workflow:${pkg}.Process`,
    name: 'Process',
    packageId: pkg,
  })
  const observedGraph = {
    window: { buckets: 1 },
    summary: { nodes: 2, edges: 0, coarsenedEdges: 0, unresolved: 0, diagnostics: 0 },
    nodes: [process('acme/orders', 'shopfloor'), process('acme/billing', 'ledger')],
    edges: [],
    coarsenedEdges: [],
    unresolved: [],
    diagnostics: [],
    packages: { 'acme/orders': { name: 'orders' }, 'acme/billing': { name: 'billing' } },
  }

  it('labels each packaged node with its package name', () => {
    const { parserGraph } = normalizePayload({ observedGraph })!
    expect(parserGraph!.nodes.map(n => nodeLabel(parserGraph!, n.id))).toEqual(['orders.Process', 'billing.Process'])
  })
  it('labels a node bare when the graph has no table', () => {
    const { packages: _, ...bare } = observedGraph
    const { parserGraph } = normalizePayload({ observedGraph: bare })!
    expect(nodeLabel(parserGraph!, parserGraph!.nodes[0].id)).toBe('acme/orders.Process')
  })
})
