# Visualizer Changes

**Source review(s):** visualizer/REVISIONS_003 (consume `twf graph` deployment graph)
**REVISIONS file(s):** internal/changes/visualizer/REVISIONS_003.md

## Summary

The visualizer's graph view now renders the resolved deployment graph emitted by
`twf graph` instead of re-deriving the same data from the AST. `tools/visualizer/src/graph/build.ts`
collapses from ~480 lines of statement walking, copy expansion, fan-out, and
manual coarsening down to ~195 lines of pure parser-graph translation. A new
`nexusEndpoint` node type surfaces the routing alias as its own tier on the
canvas. The data-model spec adopts a parallel-ladder mental model (main: NS →
Worker → Workflow → Activity; nexus: Endpoint → Service → Operation) that
matches the data the parser actually emits.

## Changes by Type

### Schema

- **New TS types mirroring `tools/lsp/parser/graph/graph.go`** in
  `tools/visualizer/src/types/parser-graph.ts`: `ParserGraph`, `ParserNode`,
  `ParserEdge` (with discriminated `kind: 'containment' | 'activityCall' |
  'workflowCall' | 'nexusCall' | 'asyncBacking'`), `ParserRouting`,
  `CoarsenedEdge`, `ParserUnresolved`, `ParserGraphDiagnostic`,
  `ParserGraphSummary`, plus `EMPTY_PARSER_GRAPH` constant for the fallback
  path. Re-exported through `lib.ts` for npm consumers.

### API

- **`buildGraph` signature change** in `tools/visualizer/src/graph/build.ts`:
  `(ast: TWFFile) => Graph` → `(parserGraph: ParserGraph, ast: TWFFile) =>
  Graph`. AST is now secondary input (sourceFile lookup, hover details);
  parser graph is primary.
- **New `parserGraph?: ParserGraph` prop on `WorkflowCanvas`**
  (`tools/visualizer/src/components/WorkflowCanvas.tsx`). Optional — when
  absent, the graph view falls back to `EMPTY_PARSER_GRAPH` and renders empty.
- **New required `parserGraph: ParserGraph` prop on `GraphView`**
  (`tools/visualizer/src/components/GraphView.tsx`). Threaded from
  `WorkflowCanvas` with the empty-graph fallback applied at the boundary.
- **`NodeType` union gained `'nexusEndpoint'`** in
  `tools/visualizer/src/graph/model.ts`.
- **`NodeLevel` type extended** from `1 | 2 | 3 | 4` to `1 | 1.5 | 2 | 3 | 4`
  to slot endpoints between the namespace and worker bands. Acknowledged as
  transient implementation detail in the spec; full removal of the `level`
  field is queued for REVISIONS_006.
- **`GraphNode` gained view-only deployment metadata fields**: `worker?`,
  `namespace?`, `queue?`. Populated from the parser node; used for hover /
  tooltip rendering.
- **Removed helpers** from `tools/visualizer/src/graph/model.ts`:
  `workerScopedNodeId`, `nexusOperationName`, the standalone `nodeId` /
  `definitionKey` helpers. The parser owns ID construction now.

### Semantic

- **No more AST-side semantic work in the graph view.** Statement walking,
  per-worker copy expansion, dependency edge fan-out, namespace inference,
  worker-tier / namespace-tier coarsening, and orphan detection all moved
  upstream to `tools/lsp/parser/graph/`. The visualizer is a thin renderer
  over the parser's output.
- **Loader fans out one `twf graph --json <all-files>` call per refresh.**
  `packages/vscode/src/extension.ts` runs the call alongside its existing
  per-file `twf parse` loop and posts `{ ast, parserGraph }` to the webview.
  Graph extraction failures are non-fatal: the graph view degrades to empty
  while the tree view continues to work.
- **Standalone and webview entry points accept either payload shape.** Both
  `App.tsx` and `webview.tsx` recognize the legacy bare-AST payload and the
  new `{ ast, parserGraph }` wrapper via a small type guard.
- **`computeGraphNodeSummary` at L1 now reports endpoints separately**
  (`"5 workers · 2 endpoints"` instead of `"5 workers"`).

### Internal

- **Per-node-type wiring for `nexusEndpoint`** added wherever the existing
  node-type switches live (charge, Y band, charge slider, gravity-band
  slider, NODE_STYLES, NODE_SIZES, theme PrimitiveKind, DEF_TYPE_CONFIGS,
  CSS color variables for both light/dark themes, control-panel typed
  classes, dual-range slider styles, filter chip styles). The scattered
  control flow this cycle exposed motivates the registry refactor scoped
  in REVISIONS_006.
- **Endpoint physics defaults**: charge `-180` (weaker than worker's `-220`,
  matching the "routing alias, not orchestration host" semantics);
  Y band `-180..-60` (between the namespace and worker bands); size r=15
  (visually subordinate to the L1/L2 r=20 nodes).

### Documentation

- **`tools/visualizer/spec/GRAPH_VIEW.md` rewrites the Graph Data Model
  section** around the parallel-ladder framing — two ladders (main / nexus)
  that align at the container, host, and orchestrator tiers and cross-connect
  via two distinct edge kinds (cross-ladder containment, cross-ladder
  dispatch). Acknowledges the current `level` numeric field as transient
  implementation detail with a forward reference to REVISIONS_006.
- **New "Data Flow: Two Views, Two Commands" section** maps the tree view
  to `twf parse` and the graph view to `twf graph`, documenting that the
  graph view is a renderer over the parser's deployment graph rather than
  a re-walker of the AST.
- **"Graph Construction Order" rewritten** from a 6-step parser-equivalent
  algorithm to a 4-step translation pass (nodes, edges, coarsened edges,
  duplicate groups).
