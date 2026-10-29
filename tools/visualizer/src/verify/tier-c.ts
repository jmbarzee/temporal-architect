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

import { DISPATCH_DIMENSION } from '../adapter/edge-types'
import { ALL_NODE_TYPES, DEFAULT_ONTOLOGY } from '../adapter/node-types'
import { resolveSprings } from '@temporal-architect/graph-view/graph/forces'
import { pairTuning, styleIdentityMapping } from '@temporal-architect/graph-view/graph/simulation'
import type { GraphEdge } from '@temporal-architect/graph-view/graph/model'
import { RELATION_DIMENSION } from '@temporal-architect/graph-view/graph/dimension'
import type { Relation } from '@temporal-architect/graph-view/graph/dimension'
import type { Json } from './snapshot'

const EDGE_TYPES: Relation[] = ['containment', 'dependency']
const DISPATCH_KINDS: (string | undefined)[] = [undefined, 'signalSend']

export function tierC(): Json {
  // Through the ENGINE's classifier, not the shim's function directly: on the
  // style axis bucketed by identity the engine applies the host's rule, so this
  // pins the precedence as the simulation sees it, membership check included.
  const engine = resolveSprings(pairTuning(styleIdentityMapping(DEFAULT_ONTOLOGY)), DEFAULT_ONTOLOGY)
  const edgeTypeFor = (edge: GraphEdge, src: string, tgt: string) => engine.classify(edge, src, tgt) ?? '(unbucketed)'
  const rows: Record<string, string> = {}
  for (const edgeType of EDGE_TYPES) {
    for (const src of ALL_NODE_TYPES) {
      for (const tgt of ALL_NODE_TYPES) {
        for (const dispatchKind of DISPATCH_KINDS) {
          const edge: GraphEdge = {
            id: 'synthetic',
            sourceId: 'src',
            targetId: 'tgt',
            dimensions: {
              [RELATION_DIMENSION]: edgeType,
              ...(dispatchKind ? { [DISPATCH_DIMENSION]: dispatchKind } : {}),
            },
          }
          const key = `${edgeType}|${src}|${tgt}|${dispatchKind ?? '-'}`
          // The one classifier (D57): a stroke is the resolved type's, so the
          // type is the whole answer.
          rows[key] = edgeTypeFor(edge, src, tgt)
        }
      }
    }
  }

  // The `nexusEndpoint`-carrying variant of every dependency pair: the
  // classifier never reads that field, and this is where that stays pinned
  // (D3) now that no renderer rule reads it either (D57).
  const withEndpoint: Record<string, string> = {}
  for (const src of ALL_NODE_TYPES) {
    for (const tgt of ALL_NODE_TYPES) {
      const edge: GraphEdge = {
        id: 'synthetic',
        sourceId: 'src',
        targetId: 'tgt',
        dimensions: { [RELATION_DIMENSION]: 'dependency' },
        payload: { nexusEndpoint: 'SomeEndpoint' },
      }
      withEndpoint[`dependency|${src}|${tgt}|ep`] = edgeTypeFor(edge, src, tgt)
    }
  }

  return { rowCount: Object.keys(rows).length + Object.keys(withEndpoint).length, rows, withEndpoint }
}
