// Tier C — the synthetic edge-classification table.
//
// `linkSignalSend` is unreachable from every `.twf` file in the repository, and
// it is the rule whose *precedence* matters most: it is checked before every
// node-type rule because both its endpoints are `workflow` and nothing else
// separates a fire-and-forget send from a child-workflow call. No fixture can
// cover it, so the coverage is synthesised instead: every reachable combination
// of (edge type, source type, target type, dispatch kind), 2 × 7 × 7 × 2 rows.
//
// The table fully pins the fall-through order, both catch-all branches, and the
// operation ↔ operation case that resolves to the workflow → operation spring.

import { ALL_NODE_TYPES } from '../adapter/node-types'
import { edgeTypeFor } from '../adapter/edge-types'
import { edgeStyleKeyFor } from '../graph/edge-styles'
import type { EdgeType, GraphEdge } from '../graph/model'
import type { Json } from './snapshot'

const EDGE_TYPES: EdgeType[] = ['containment', 'dependency']
const DISPATCH_KINDS: (GraphEdge['dispatchKind'] | undefined)[] = [undefined, 'signalSend']

export function tierC(): Json {
  const rows: Record<string, string> = {}
  for (const edgeType of EDGE_TYPES) {
    for (const src of ALL_NODE_TYPES) {
      for (const tgt of ALL_NODE_TYPES) {
        for (const dispatchKind of DISPATCH_KINDS) {
          const edge: GraphEdge = {
            id: 'synthetic',
            edgeType,
            sourceId: 'src',
            targetId: 'tgt',
            ...(dispatchKind ? { dispatchKind } : {}),
          }
          const key = `${edgeType}|${src}|${tgt}|${dispatchKind ?? '-'}`
          // Both classifiers, side by side. They are independent and already
          // disagree; the table is where that disagreement is enumerated.
          rows[key] = `${edgeTypeFor(edge, src, tgt).id}|${edgeStyleKeyFor(edge, src, tgt)}`
        }
      }
    }
  }

  // The `nexusEndpoint`-carrying variant of every dependency pair: the renderer
  // reads that field and the physics classifier never does, so it is a second
  // axis on which the two can diverge.
  const withEndpoint: Record<string, string> = {}
  for (const src of ALL_NODE_TYPES) {
    for (const tgt of ALL_NODE_TYPES) {
      const edge: GraphEdge = {
        id: 'synthetic',
        edgeType: 'dependency',
        sourceId: 'src',
        targetId: 'tgt',
        nexusEndpoint: 'SomeEndpoint',
      }
      withEndpoint[`dependency|${src}|${tgt}|ep`] =
        `${edgeTypeFor(edge, src, tgt).id}|${edgeStyleKeyFor(edge, src, tgt)}`
    }
  }

  return { rowCount: Object.keys(rows).length + Object.keys(withEndpoint).length, rows, withEndpoint }
}
