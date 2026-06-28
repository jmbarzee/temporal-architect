# chunks — shipped state (orientation for a polish pass)

A snapshot of the **completed** chunks / decomposition feature so a polish round
can start with fresh context. Forward and deferred work lives in
[`BACKLOG.md`](./BACKLOG.md); this file is "what exists and where."

## What shipped

### Engine — `tools/lsp/parser/decompose` (`twf graph chunks`)

- **Decide phase (#1, always):** hard partition (weakly-connected components of
  the binding+soft subgraph) + per-chunk complexity + floor-merge recommendations
  + a `suggestContract` advisory for a heavily-shared articulation hub.
- **Explore phase (#2, `--ceiling N`):** a ranked menu of division options per
  over-ceiling, non-loop chunk, each recursively re-divided, with a dependency
  DAG. The resolved analysis parameters (`ceiling/floor/maxDepth/strategies`) are
  echoed in the output for display.
- **Strategies:** a *use-case / balance* lens (`tree`, `nexus`, `worker`,
  `namespace`) and an *authorship-parallelism* lens (`service` = hub + dominated
  closure + remainder components; `subtree` = selective dominated child-workflow
  peel). Coupling-aware `Ec = N + Ein` drives the recursion test and a
  parallel-width ranking key; recursion uses full look-ahead.
- **File map:** `decompose.go` (front door + Options), `workgraph.go` (build,
  edge classification, `Ein`), `complexity.go` (metric + floor), `roots.go`,
  `components.go` (SCC + partition + advisory), `dominators.go` (service/subtree
  closures), `divisions.go` (explore, recursion, ranking), `parallel.go` (max
  antichain), `strategies.go` (`splitBy*`), `result.go` (wire model). Package
  doc: [`tools/lsp/parser/decompose/README.md`](../../../../tools/lsp/parser/decompose/README.md).

### Visualizer — group overlay (Graph view)

- Soft **glow overlay** drawn behind everything + a collapsible **Groups modal**
  (tree browser of chunk -> division options -> sections; read-only Params tab),
  joined to graph nodes by `definitionKey`.
- **File map:** `graph/groups.ts` (selection model + `computeActiveGroups` +
  palette), `components/GroupsModal.tsx`, the glow layer in
  `components/GraphCanvas.tsx`, wiring in `components/GraphView.tsx`,
  `types/decomposition.ts`, `types/payload.ts`. Spec:
  [`tools/visualizer/spec/GRAPH_VIEW.md`](../../../../tools/visualizer/spec/GRAPH_VIEW.md)
  § Decomposition Group Overlay.

### Extension — `temporal-architect-dist`

- `_extractChunks()` runs `twf graph chunks --json --ceiling N` and bundles a
  `decomposition` into the webview payload; gated by the `twf.decompose.ceiling`
  setting (default 60). The webview glue forwards it to `<Visualizer
  decomposition>`. The Params tab is **read-only** — no recompute.

## Key design decisions (the "why")

- **Informs, not imposes; deterministic; loops are never cut; the floor gates
  every cut.** These are the enduring invariants.
- **Two lenses,** because thin-neck composition subtrees and thick-neck shared
  services need opposite edge-count signals — no single balance metric handles
  both.
- **`Ec` augments, not replaces:** the public `complexity` scalar + ceiling/floor
  stay additive `N`; `Ec` is used only for explore-phase decisions (recursion
  test + ranking). Full replacement is a deferred option.
- **Ranking key order** (tame -> balance -> coherence -> parallel width -> ...)
  puts the coherence brake *above* parallel width, because parallel width
  measured on recursed leaves otherwise rewards gratuitous shattering.
- **Look-ahead recursion:** each candidate is fully expanded *before* ranking; the
  earlier myopic flat pick preferred "one big component" and failed to converge.

## Acceptance / calibration

The `temporal-compranda` design (separate `playground` repo) is the regression
target: rank-1 `service` extracts the `AgenticTask` articulation hub (in-degree
15) and the recursion peels the orchestrator subtrees, without shattering single
activities or cutting the outer-loop SCC. Output is deterministic. Pinned by the
saved `chunks-decomposition.*` there + the `decompose` package tests.

## Canonical records

- [`../../parser/CHANGES_005.md`](../../parser/CHANGES_005.md) — initial partition
  + explore.
- [`../../parser/CHANGES_007.md`](../../parser/CHANGES_007.md) — service/subtree +
  the coupling-aware metric + advisory.
- [`tools/lsp/parser/decompose/README.md`](../../../../tools/lsp/parser/decompose/README.md)
  — the package's own architecture doc (metric + ranking mechanics).

## Where the open work lives

[`BACKLOG.md`](./BACKLOG.md) — engine deferrals + the decomposition-overlay
(visualizer) deferrals. Generic visualizer polish:
[`../../visualizer/BACKLOG.md`](../../visualizer/BACKLOG.md).
