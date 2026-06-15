# Parser Changes: Topology-based graph decomposition (`twf graph chunks`)

**Source review(s):** `internal/changes/parser/REVISIONS_005.md` (promoted from the chunks workstream — design-of-record [chunks/BACKLOG.md](../temp-change-set/chunks/BACKLOG.md)). Un-defers the basic case of `parser/BACKLOG.md` → *Graph Decomposition: Composable Chunks / Workflow Trees*, **without** depending on declared inbound roots (#7).
**REVISIONS file(s):** `REVISIONS_005.md` (consumed)

## Summary

A new analysis package, **`tools/lsp/parser/decompose`**, computes how a `.twf` design breaks into independently-implementable chunks of work and surfaces it as **`twf graph chunks`**. The sole consumer is the temporal-architect harness skill, which uses it to fan implementation out to author subagents at contract boundaries. **The tool informs; it does not impose** a decomposition.

It is a pure *consumer* of existing types — it reads the resolved deployment graph (and the AST, when present, for the complexity metric and handler roots) and emits its own types. **No changes to the parser pipeline** (lexer → parser → resolver → validator → graph); the package sits beside `graph` exactly as the validator / LSP / codegen consumers do.

Two cleanly-typed outputs: **#1 hard boundaries** — the partition of authorable definitions into chunks (the harness MUST dispatch separate subagents across them); and **#2 soft divisions** — ranked candidate cuts plus a dependency DAG over any chunk that exceeds a caller-instructed complexity ceiling (the harness MAY use them). Loops are never cut this pass.

## Changes by Type

### API

- **`twf graph chunks`** (new CLI subcommand; `tools/lsp/cmd/twf/chunks.go`): additive — no existing contract changes. Thin wrapper that runs the existing parse → resolve → `graph.Extract` (or `history.Build` under `--history`), then `decompose.Decompose`, wrapped in the standard JSON envelope under a new `chunks` payload key. Flags: `--json`, `--ceiling N`, `--floor M`, `--by tree,nexus,worker,namespace`, `--history <dir>`. Routed from `graphCommand` when the first arg is `chunks` (`tools/lsp/cmd/twf/graph.go`). Definition-collapse stays internal — no `twf graph defs` lens this pass.
- **`decompose.Decompose(file *ast.File, g *graph.Graph, opts Options) *Result`** (new public entry; `tools/lsp/parser/decompose/decompose.go`): the package's only exported function, plus the exported result model (`Result`, `Node`, `Root`, `Chunk`, `ChunkRoot`, `ChunkEdge`, `Division`, `Section`, `SectionEdge`, `Options`) and constants (`SourceHeuristic`/`SourceDeclared`, `StrategyTree`/`Nexus`/`Worker`/`Namespace`, `DefaultFloor`). Roots carry `source: heuristic|declared` from day one so #7 slots in additively.

### Schema

- **`tools/lsp/cmd/twf/twf.schema.json`**: added the `chunks` top-level payload and the `$defs/Decomposition` family (`ChunkNode`, `ChunkRootDecl`, `Chunk`, `ChunkRootReach`, `ChunkEdge`, `Division`, `Section`, `SectionEdge`). Additive (envelope is `additionalProperties: true`); `$schemaVersion` bumped `1.0.0` → `1.1.0` (minor). No existing shapes changed.

### Internal

- **`tools/lsp/parser/decompose/decompose.go`** (new): the definition-keyed working graph. Nodes are the distinct authorable definitions in the graph (`graph.Node.Definition` already collapses deployment-duplicates back to one authorable unit — no separate "projection" construct); each is seeded to base complexity and carries its retained hosting worker/namespace attributes (parsed off the composite node ID) for #1b and the grouping lens. Edges are graph edges collapsed to definition keys and classified **binding** (`activityCall`/`workflowCall`/`asyncBacking`) vs **soft** (`signalSend`) vs **contract-cut** (`nexusCall`); `nexusRoute`/`containment` are ignored. The AST, when supplied, refines complexity and contributes handler roots, so the decomposition also runs over a history-reconstructed graph (no AST → structural-only).
- **`tools/lsp/parser/decompose/roots.go`** (new): heuristic root seed set = in-degree-0 (binding) ∪ `asyncBacking` targets ∪ handler-bearing workflows (AST) ∪ self-contained cycles; every root tagged `source: heuristic` with auditable reasons.
- **`tools/lsp/parser/decompose/components.go`** (new): Tarjan SCC condensation over the binding subgraph (workflow-call cycles collapse to one node); the **#1 hard partition** as weakly-connected components of the binding+soft subgraph (every definition in exactly one chunk); per-root SCC-collapsed reachability with shared nodes reported once as `overlap`; the inter-chunk contract dependency DAG (`nexusCall` between chunks).
- **`tools/lsp/parser/decompose/complexity.go`** (new): the deterministic AST-derived complexity scalar (documented, tunable weights — base, body statements, distinct call fan-out, branch/loop depth, handler count, child-workflow count; **not** a calibrated model) and the **floor** (`--floor`, default `2`): a below-floor chunk is flagged too-granular and recommended for merge into the chunk that dispatches into it (over a contract edge). Recommend-only — never auto-applied.
- **`tools/lsp/parser/decompose/divisions.go`** (new): **#2** for any over-ceiling chunk with a condensation seam — ranked candidate divisions (`tree`, `nexus`, `worker`, `namespace`, selectable via `--by`) each with a section dependency DAG. The floor gates #2 (no section under the floor). **Loops are never cut**: a chunk spanning fewer than two SCCs (e.g. one pure cycle) has no seam and is exempt regardless of score.
- **`tools/lsp/parser/decompose/doc.go`** (new): package overview.
- **`tools/lsp/cmd/twf/diagnostic.go`**: added the `Chunks` payload field to `Envelope`. **`tools/lsp/cmd/twf/main.go`**: usage/help mention the `graph chunks` subcommand. **`tools/lsp/cmd/twf/README.md`**: new `twf graph chunks` section.

## Tests

- **`tools/lsp/parser/decompose/decompose_test.go`** (new; unit): all eight Group-6 fixtures — definition-collapse (one workflow on two workers → one chunk node), `asyncBacking` target as root + handler-bearing as root, `signalSend` keeps a blob but yields two roots, overlap node reported once under two roots, SCC collapse of a workflow-call cycle into one chunk, floor-merge of a trivial chunk into its dispatching chunk, ceiling-triggered tree division with a correct dependency DAG, and loop-chunk exemption when over ceiling — plus a complexity-monotonicity check and a nil-input guard.
- **`tools/lsp/cmd/twf/chunks_test.go`** (new; unit): `twf graph chunks --json` / text smoke tests over the envelope.
- **`test/integration/sampler/cases_chunks_test.go`** (new; round-trip): reuses the existing sampler → `history.Build` rig (no new rig) — drives real executions, samples them, and asserts chunk output over the reconstructed graph: connected-component grouping, oversized-tree cuts, and cycle collapse (no cut) via a bounded mutual recursion. Gated behind `//go:build integration`; compiles under `-tags integration`.
- Full suite green: `GOMODCACHE=$HOME/go/pkg/mod go build ./... && go test ./...` from `tools/lsp/`.

## Open questions (resolved for this pass)

- **Floor/ceiling defaults & metric weights:** shipped documented defaults — floor `2` (negative disables), no default ceiling (#2 is opt-in via `--ceiling`), weights as constants in `complexity.go`. To be tuned from real designs; not a calibrated model.
- **Auto-merge vs recommend:** recommend-only, consistent with "informs, does not impose" — the floor flags `belowFloor` + `mergeInto` but never rewrites the partition.
- **Multi-file designs:** cross-file callers resolve in the graph, so the chunker inherits that for free; covered structurally by the unit fixtures (graph-sourced nodes) and the round-trip rig.

## Downstream propagation

- **Spillover deferred** to `internal/changes/parser/BACKLOG.md` (Graph Decomposition section, marked shipped): the **loop cut ceiling** and the standalone **worker/namespace/nexus grouping lens**. Additive future work (**#7 declared inbound roots**, **#1b language boundaries**) is designed to slot in without a pipeline reshape — roots already emit `source`, nodes already retain deployment attributes.
- **No downstream consumer changes required:** the `chunks` payload is additive (new schema `$defs`, minor `$schemaVersion` bump). The visualizer and VS Code extension read the existing `graph` payload, which is unchanged; they may adopt `chunks` later but are not broken by it.
