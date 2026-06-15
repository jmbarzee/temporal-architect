# Parser Revisions: Topology-based graph decomposition (`twf graph chunks`)

**Source:** ideation session captured in
`internal/changes/temp-change-set/skill-retro/ordered_implementation_plan.md`
§ "Feature design capture: Topology-based graph decomposition (the un-deferral of #8)".
Un-defers Stage 3 #8 (`parser/BACKLOG.md` → *Graph Decomposition: Composable Chunks / Workflow Trees*),
**without** depending on declared inbound roots (#7, deferred — *Connecting In and Out of Temporal*).

## Summary

A new analysis package, **`tools/lsp/parser/decompose`**, computes how a `.twf` design breaks into
independently-implementable chunks and surfaces it as `twf graph chunks`. The sole consumer is the
**harness / `temporal-architect` entry-point skill**, which uses it to break implementation work out to
author subagents at contract boundaries. **The tool informs; it does not impose** a decomposition.

It is a pure *consumer* of existing types — it reads the AST (definitions + bodies) and the resolved
graph (dispatch edges) and emits its own types. **No changes to the parser pipeline** (lexer → parser →
resolver → validator → graph); the package sits beside `graph` exactly as the validator/LSP/codegen
consumers do.

The model has two cleanly-typed outputs:
- **#1 Hard boundaries** — discovered *facts* (isolated components now; enforced boundaries like language
  later). The harness **MUST** dispatch separate subagents across these.
- **#2 Soft divisions** — discovered *options* over a chunk that exceeds an instructed complexity ceiling,
  emitted as ranked candidate cuts plus a dependency DAG. The harness **MAY** use them.

**Not in this pass:** loops are never cut (SCC-collapsed into one chunk); the "raised loop ceiling above
which a cut is enforced" goes to BACKLOG. Worker/namespace/nexus grouping (an alternate lens) goes to a
separate BACKLOG item.

## Findings

- **The graph duplicates by deployment; the AST does not.** Graph nodes are keyed on *definition ×
  deployment context*, so one workflow registered on two workers is two nodes — but **one thing to
  author**. Sourcing the chunker's node set from the **AST** (definitions, naturally unique) and its
  structure from **graph edges mapped to their definition key** (the leftmost `kind:Name` segment of the
  node ID, already encoded by `graph/`) collapses deployment-duplicates with no separate "projection"
  construct. AST + graph used together.
- **Three dispatch-edge semantics drive correctness:** `nexusCall` is the cleanest contract cut
  (cross-namespace/worker by construction); an `asyncBacking` target is a *root* (external entry) despite
  carrying an in-edge; `signalSend` is a *soft* edge — it keeps two workflows in the same blob but they
  are **separate** roots/chunks and it must not be treated as a binding call edge.
- **Roots are heuristic and that is acceptable.** The basic case is unblocked today; #7 later sharpens it
  additively by contributing a higher-priority seed source. Emitting `source: heuristic|declared` per root
  from day one is what makes #7 a non-breaking addition.
- **A complexity metric is the new load-bearing primitive.** Both the ceiling (triggers #2) and the floor
  (merges too-granular #1 chunks, making #1 a *stronger* boundary) are thresholds on a single
  deterministic AST-derived scalar.

## Group 1: `decompose` package skeleton + definition node model

**Files touched:** `tools/lsp/parser/decompose/decompose.go` (new),
`tools/lsp/parser/decompose/doc.go` (new).
**Change type:** `Internal`
**Parallelism:** Foundational — Groups 2–5 build on its types.

**Specific changes:**
1. New package importing only `parser/graph` and `parser/ast`. Public entry e.g.
   `Decompose(file *ast.File, g *graph.Graph, opts Options) *Result`.
2. Build the **definition-keyed working graph** internally: nodes from AST definitions
   (workflow/activity/nexus); edges from `g.Edges`, each endpoint collapsed to its definition key
   (strip the deployment suffix). Dedup edges. Retain per-node deployment attributes (hosting
   workers/namespaces/langs, gathered from the graph node instances) for #1b and the grouping lens.
3. Classify edges by kind into **binding** (`activityCall`, `workflowCall`, `asyncBacking`) vs **soft**
   (`signalSend`) vs **contract-cut** (`nexusCall`); `nexusRoute`/`containment` are not call structure
   and are ignored for traversal.
4. `Result` / `Chunk` / `Division` / `Root` types with `source: heuristic|declared` on roots.

## Group 2: Heuristic roots + SCC collapse + #1 hard partition

**Files touched:** `tools/lsp/parser/decompose/roots.go` (new),
`tools/lsp/parser/decompose/components.go` (new).
**Change type:** `Internal`
**Parallelism:** After Group 1.

**Specific changes:**
1. **Roots** = in-degree-0 (binding subgraph) ∪ `asyncBacking` targets ∪ handler-bearing workflows
   (signal/query/update handlers, read from AST) ∪ in-cycle-with-no-external-binding-in-edge. Tag every
   root `source: heuristic`.
2. **SCC condensation** (Tarjan) over the binding subgraph so workflow-call cycles collapse to one node;
   the condensation is a DAG.
3. **#1 hard partition (1a):** weakly-connected components of the binding+soft subgraph define the hard
   chunks — every definition lands in exactly one. (1b language split is deferred; see Additive notes.)
4. **Chunk = SCC-collapsed reachable-set per heuristic root**, with nodes reachable from multiple roots
   reported as **overlap** (listed once, referenced by each root) rather than duplicated.

## Group 3: Complexity metric + floor (merge too-granular)

**Files touched:** `tools/lsp/parser/decompose/complexity.go` (new).
**Change type:** `Internal`
**Parallelism:** After Group 1; independent of Group 2.

**Specific changes:**
1. Per-definition deterministic scalar from AST counts — body statement count, distinct call fan-out,
   branch/loop depth, handler count, child-workflow count (documented + tunable weights; **not** a
   calibrated model for v1). Roll up per chunk.
2. **Floor** (`--floor`, default tunable): a #1 chunk scoring below the floor is flagged
   "too granular for its own subagent" with a recommended merge into the chunk that dispatches into it.
   Also gates #2 — never propose a cut yielding a sub-chunk under the floor.

## Group 4: #2 soft divisions + dependency DAG (ceiling-triggered)

**Files touched:** `tools/lsp/parser/decompose/divisions.go` (new).
**Change type:** `Internal`
**Parallelism:** After Groups 2–3.

**Specific changes:**
1. When a chunk exceeds the **ceiling** (`--ceiling N`, caller-instructed), emit **ranked candidate cuts**
   and an inter-section **dependency DAG** (ordering for the subagents). Many suggestions supported.
2. Strategies, selectable/biasable via `--by tree|worker|namespace|nexus`: reachable-subtree split,
   `nexusCall`-boundary split, worker-attribute split, namespace-attribute split. **No community detection
   / min-cut this pass** (north-star: keep opaque strategies out).
3. **Loops are never cut:** an SCC-collapsed chunk is exempt from #2 regardless of score (the raised loop
   ceiling is BACKLOG).

## Group 5: CLI surface `twf graph chunks`

**Files touched:** `tools/lsp/cmd/twf/graph.go` (or a sibling `chunks.go`),
`tools/lsp/cmd/twf/twf.schema.json` (chunk output schema).
**Change type:** `API` (new CLI subcommand; additive — no existing contract changes)
**Parallelism:** After Groups 1–4.

**Specific changes:**
1. `twf graph chunks` — emits the #1 hard partition + per-chunk complexity + floor-merge recommendations.
2. `twf graph chunks --ceiling N [--floor M] [--by tree|worker|namespace|nexus]` — additionally emits #2
   ranked divisions + dependency DAG for over-ceiling chunks.
3. Thin wrapper: runs the existing parse→resolve→`graph.Extract`, then `decompose.Decompose`, wrapped in
   the standard JSON envelope. Definition-collapse stays **internal** (no `twf graph defs` lens this pass).

## Test plan (Group 6)

**Files touched:** `tools/lsp/parser/decompose/decompose_test.go` (new; unit),
`test/integration/sampler/cases_chunks_test.go` (new; round-trip).
**Change type:** `Internal`

1. **Unit (fixtures):** AST+graph fixtures asserting — definition-collapse (one workflow on two workers →
   one chunk node); heuristic root set (incl. `asyncBacking` target as root, handler-bearing as root);
   `signalSend` keeps a blob but yields two roots/chunks; overlap node reported once under two roots;
   SCC collapse of a workflow-call cycle into one chunk; floor-merge of a trivial chunk; ceiling-triggered
   division with a correct dependency DAG; loop chunk exempt from cutting even when over ceiling.
2. **Round-trip (sampler → `twf graph --history`):** reuse the existing harness
   (`test/integration/sampler/`); drive sampled histories / `<ns>/<wfType>/<id>.json` fixtures and assert
   chunk output over the same graph — connected-component grouping, cycle collapse (no cut), oversized-tree
   cuts. New assertions over the existing rig, not a new rig.
3. `GOMODCACHE=$HOME/go/pkg/mod go build ./... && go test ./...` from `tools/lsp/` green.

## Additive notes (designed to slot in, not built here)

- **#7 declared inbound roots** (*Connecting In and Out of Temporal*): becomes a higher-priority root
  seed; consumers already see `source: declared`. No pipeline reshape.
- **#1b language boundaries:** once `@lang` annotations exist (dsl/BACKLOG), a hard split keyed on the
  retained per-node language attributes — additive to the #1 partition.

## Spillover BACKLOG items (to add under `parser/BACKLOG.md`)

1. **Loop cut ceiling** — the raised ceiling above which a loop's subtrees (then, last-resort, community
   detection) may be cut. Explicitly out of this pass.
2. **Worker / namespace / nexus grouping lens** — an alternate grouping dimension over the same node set,
   riding the existing coarsened worker/namespace edges + nexus tiers. Parallel to call-structure
   decomposition, not on its critical path. (Rides an existing component → its own backlog entry.)

## Open questions (carried, non-blocking)

- Default floor/ceiling values and metric weights — ship documented defaults, tune from real designs.
- Should `twf graph chunks` ever auto-apply the floor merge, or only *recommend* it? (Lean: recommend
  only — stay consistent with "informs, does not impose".)
- Multi-file designs: cross-file callers already resolve in the graph, so the chunker inherits that;
  verify in a sampler fixture.
