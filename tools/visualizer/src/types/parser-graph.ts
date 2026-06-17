// Graph wire types for the visualizer.
//
// The structural shapes are generated from `tools/lsp/parser/graph/graph.go`
// and live in `@temporal-architect/wire-types` (single source of truth;
// CI-gated). This file is a thin façade: it re-exports the ergonomic
// `Parser*`-prefixed names the visualizer uses (prefixed to avoid colliding
// with the view-layer's own graph model) and provides the empty-graph default.

export type {
  ParserGraph,
  ParserGraphSummary,
  ParserNode,
  ParserEdge,
  ParserEdgeKind,
  ParserRouting,
  ParserTier,
  CoarsenedEdge,
  ParserUnresolved,
  ParserGraphDiagnostic,
  ParserGraphDiagnosticCode,
  ParserGraphDiagnosticSeverity,
  DefinitionKey,
} from '@temporal-architect/wire-types'

import type { ParserGraph } from '@temporal-architect/wire-types'

/** Empty parser graph — used as a fallback when no graph is available. */
export const EMPTY_PARSER_GRAPH: ParserGraph = {
  summary: { nodes: 0, edges: 0, coarsenedEdges: 0, unresolved: 0, diagnostics: 0 },
  nodes: [],
  edges: [],
  coarsenedEdges: [],
  unresolved: [],
  diagnostics: [],
}
