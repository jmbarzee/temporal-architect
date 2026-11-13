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
})
