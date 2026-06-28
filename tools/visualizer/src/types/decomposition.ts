// Decomposition wire types for the visualizer.
//
// The structural shapes are generated from `tools/lsp/parser/decompose/result.go`
// and live in `@temporal-architect/wire-types` (single source of truth,
// CI-gated). This file is a thin façade — the same pattern as parser-graph.ts —
// re-exporting the `twf graph chunks` payload shapes the Graph view's group
// overlay consumes. `Decomposition` is the top-level `Result`.

export type {
  Decomposition,
  Chunk,
  Division,
  Section,
  SectionEdge,
  Advisory,
} from '@temporal-architect/wire-types'
