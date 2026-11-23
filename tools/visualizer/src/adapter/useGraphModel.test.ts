import { describe, expect, it } from 'vitest'
import { graphFindingsToDiagnostics } from './useGraphModel'
import type { ParserGraph } from '../types/parser-graph'

describe('graphFindingsToDiagnostics', () => {
  const site = { file: 'b.twf', line: 4, column: 3 }
  const pg = {
    nodes: [],
    diagnostics: [{ severity: 'warning', code: 'DISPATCH_NO_REACHABLE_DEPLOYMENT', message: 'm', from: 'workflow:W', site }],
    unresolved: [
      { from: 'workflow:W', name: 'Gone', kind: 'activityCall', site },
      { from: 'workflow:W', name: 'Sig', kind: 'signalSend' },
    ],
  } as unknown as ParserGraph

  it('keeps each finding at its site, and one observed in history at none', () => {
    expect(graphFindingsToDiagnostics(pg).map(d => d.site)).toEqual([site, site, { line: 0, column: 0 }])
  })

  it('leaves out the not-sampled finding of a signal whose target ID is ambiguous', () => {
    const ambiguous = (from: string, id: string) => ({
      severity: 'warning',
      code: 'SIGNAL_TARGET_AMBIGUOUS',
      message: `workflow ID "${id}" fits the id_schemes of A on queue q, B on queue q`,
      from,
    })
    const ambiguousPg = {
      nodes: [],
      diagnostics: [ambiguous('workflow:W', 'ship-1')],
      unresolved: [
        { from: 'workflow:W', name: 'ship-1', kind: 'signalSend' },
        { from: 'workflow:W', name: 'ship-2', kind: 'signalSend' },
        { from: 'workflow:V', name: 'ship-1', kind: 'signalSend' },
      ],
    } as unknown as ParserGraph

    const found = graphFindingsToDiagnostics(ambiguousPg).map(d => [d.code, d.name])
    expect(found).toEqual([
      ['SIGNAL_TARGET_AMBIGUOUS', 'workflow:W'],
      ['SIGNAL_TARGET_NOT_SAMPLED', 'workflow:W'],
      ['SIGNAL_TARGET_NOT_SAMPLED', 'workflow:V'],
    ])
  })
})
