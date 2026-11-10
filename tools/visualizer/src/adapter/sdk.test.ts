import { describe, expect, it } from 'vitest'
import { buildGraph } from './build'
import { crossingEdgeIds, sdkCrossings, sdkGroupsOf } from './sdk'
import { dispatchOf } from './edge-types'
import type { ParserGraph } from '../types/parser-graph'
// The Go test's fixture and its expected crossings (`go test ./parser/graph
// -run TestSDKCrossings -update` rewrites both), so this copy of the rule and
// `graph.SDKCrossings` are checked against one answer.
import fixture from '../../../lsp/parser/graph/testdata/cross_sdk.graph.json'
import expected from '../../../lsp/parser/graph/testdata/cross_sdk.crossings.json'

const pg = fixture as unknown as ParserGraph
const key = ([from, to, kind]: string[]) => `${from}\u0000${to}\u0000${kind}`

describe('sdkCrossings', () => {
  it('flags the edges graph.SDKCrossings flags', () => {
    expect(sdkCrossings(pg)).toEqual(new Set(expected.map(key)))
  })

  it('marks one view edge per crossing', () => {
    const graph = buildGraph(pg, new Map())
    const ids = crossingEdgeIds(graph, sdkCrossings(pg))
    const marked = graph.edges.filter(e => ids.has(e.id)).map(e => [e.sourceId, e.targetId, dispatchOf(e) ?? ''])
    expect(new Set(marked.map(key))).toEqual(new Set(expected.map(key)))
    expect(ids.size).toBe(expected.length)
  })
})

describe('sdkGroupsOf', () => {
  it('groups nodes by SDK set and leaves nodes with no `@sdk` out', () => {
    const groups = sdkGroupsOf(pg)
    expect(groups.map(g => g.id)).toEqual(['go', 'python', 'go + python'])
    const grouped = new Set(groups.flatMap(g => [...g.nodeIds]))
    expect(grouped.has('worker:goW/namespace:ns')).toBe(true)
    expect(grouped.has('worker:plainW/namespace:ns')).toBe(false)
    expect(grouped.has('activity:Plain/worker:plainW/namespace:ns')).toBe(false)
  })

  it('a multi-SDK set is its own group, after the single ones', () => {
    const node = (id: string, ...sdks: string[]) => ({ id, definition: `worker:${id}`, sdks: sdks.map(sdk => ({ sdk })) })
    const groups = sdkGroupsOf({ ...pg, nodes: [node('a', 'python', 'go'), node('b', 'go'), node('c', 'go', 'python')] })
    expect(groups.map(g => [g.id, [...g.nodeIds]])).toEqual([['go', ['b']], ['go + python', ['a', 'c']]])
  })
})
