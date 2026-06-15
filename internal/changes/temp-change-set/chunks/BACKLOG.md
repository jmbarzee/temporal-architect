# chunks Workstream Backlog

Dedicated backlog for the **chunks** effort: topology-based graph decomposition — "what are the composable
chunks of work?" — that lets the harness skill break implementation out to author subagents at contract
boundaries. Kept separate from the per-component backlogs (`parser`, `visualizer`, `dsl`, …) so this
project's deferred work isn't lost behind slower component workstreams.

This is the un-deferral of Stage 3 #8 in
[skill-retro/ordered_implementation_plan.md](../skill-retro/ordered_implementation_plan.md). It does
**not** depend on declared inbound roots (#7, deferred — *Connecting In and Out of Temporal*); roots stay
heuristic and #7 slots in additively later.

**Active cycle work:** promoted to [`internal/changes/parser/REVISIONS_005.md`](../../parser/REVISIONS_005.md)
(the call-structure decomposition: `tools/lsp/parser/decompose` + `twf graph chunks`). When it runs, the
active `REVISIONS`/`CHANGES` work lives with the `parser` component and links back here. This file owns the
design-of-record and the genuinely-open / deferred work.

**Reading:** `internal/changes/parser/BACKLOG.md` → *Graph Decomposition: Composable Chunks / Workflow
Trees*; `tools/lsp/parser/graph/graph.go` (the resolved deployment graph this rides on).

---

## Goal

A tool that **guides implementation breakout to subagents** for the main harness skill — "what are the
composable chunks of work, and where must / where could the work be split?" The tool **informs; it does
not impose** the decomposition.

## Architecture — separate package, no parser-pipeline changes

New package **`tools/lsp/parser/decompose`** (sibling of `graph`), a *consumer* of existing types — same
posture as the validator/LSP/codegen consumers. Zero changes to lexer/parser/resolver.

- **Nodes from the AST** — definitions are naturally unique there (the *graph* is what duplicates by
  deployment context). The AST is also where the complexity metric's body counts live.
- **Structure from the graph edges** — map each edge endpoint to its **definition key** (the leftmost
  `kind:Name` segment of the node ID, already encoded by `graph/`). This collapses deployment-duplicates
  (e.g. one workflow on two workers) back to one authorable unit **without a separate "projection"
  construct** — AST + graph used together.
- Retain deployment facts (which workers / namespaces / langs host a def) as **attributes** on the node,
  so #1b (language split) and the deferred worker/namespace/nexus grouping lens can read them later.
- CLI: a thin `twf graph chunks` wrapper in `cmd/twf`, mirroring how `graph` wraps `graph.Extract`.

## The two-typed-problems model

| | **#1 Hard boundaries** | **#2 Soft divisions** |
|---|---|---|
| Nature | Discovered *facts* about the graph | Discovered *options* over a too-big chunk |
| Sources | 1a isolated components (today) · 1b enforced boundaries — language, later others (additive) | reachable-set cuts, nexus cuts, worker/ns cuts, articulation seams, community detection (last resort) |
| Harness contract | **MUST** dispatch separate subagents | **MAY** dispatch — a suggestion + ordering/dependency DAG |
| Trigger | Always emitted | Only when a chunk exceeds the **complexity ceiling** |
| Output | A partition (every node in exactly one hard chunk) | Ranked candidate cuts + inter-section dependency DAG |

Algorithm: **partition into hard chunks → score each → for any over the ceiling, emit ranked soft-division
options.**

## Complexity metric (AST-based)

A single **deterministic scalar** rolled per-definition then per-chunk — body statement count, distinct
call fan-out, branch/loop depth, handler count, child-workflow count (documented + tunable, *not* a
calibrated model for v1). Drives two thresholds:

- **Ceiling** (caller-instructed, e.g. `--ceiling N`): triggers #2 soft divisions.
- **Floor**: a #1 chunk below the floor is "too granular for its own subagent" → recommend merging into
  the chunk that dispatches into it. The floor makes #1 a **stronger boundary** (real chunks, not a spray
  of one-activity fragments) and also gates #2 (never propose a cut that yields a sub-chunk under the floor).

## Roots (heuristic; #7-additive)

Seed set = in-degree-0 ∪ `asyncBacking` targets ∪ handler-bearing workflows ∪ in-cycle-with-no-external-in-edge.
Each emitted root carries `source: heuristic|declared` from day one, so declared inbound roots (#7) later
become a higher-priority seed source without reshaping the pipeline.

Edge semantics that matter:
- **`nexusCall`** = the cleanest **contract cut** (cross-namespace/worker by construction).
- **`asyncBacking`** target = a **root** (external entry) despite having an in-edge.
- **`signalSend`** = a **soft edge** — keeps two workflows in the same blob but they are *separate*
  roots/chunks; must not be treated as a binding call edge.

## Unit & loops

Chunk unit = **SCC-collapsed reachable-set per heuristic root, shared nodes reported as overlap (not
duplicated)**. SCC condensation collapses workflow-call cycles into one node.

**Loops are never cut this pass.** The "raised loop ceiling above which a cut is enforced (via non-cutting
strategies like subtree extraction until then, then community detection)" → **deferred** (see below).

## Tool surface (sketch)

- `twf graph chunks` — hard partition (#1) + per-chunk complexity score + floor-merge recommendations.
- `twf graph chunks --ceiling N` — additionally emit ranked #2 soft divisions + dependency DAG for chunks
  over the ceiling. `--by worker|namespace|nexus|tree` selects/biases cut strategies. Many suggestions
  supported.
- Definition-collapse is **internal**; expose a `twf graph defs` lens only if a consumer asks.

## Test plan (sampler + `twf graph --history`)

Reuse the existing round-trip harness (`tools/sampler` → `twf graph --history`); add assertions over the
same graph: hard-partition grouping (isolated components), floor merges of trivial chunks, ceiling-triggered
soft divisions + dependency ordering, and SCC collapse of workflow-call cycles (one chunk, **no** cut).

---

## Deferred / open work

- **Loop cut ceiling** — the raised ceiling above which a loop's subtrees (then, last-resort, community
  detection) may be cut. Explicitly out of the first pass; loops are never cut until this lands.
- **Worker / namespace / nexus grouping lens** — an alternate grouping dimension over the same node set;
  rides the existing coarsened worker/namespace edges + nexus tiers. Parallel to the call-structure
  decomposition, not on its critical path. (Rides an existing component → its own backlog entry; likely
  promote into `parser/BACKLOG.md`.)
- **#7 declared inbound roots** — sharpens root identification additively (`source: declared`); see
  `dsl/BACKLOG.md` → *Connecting In and Out of Temporal*.
- **#1b language boundaries** — depends on `@lang` annotations (dsl/BACKLOG); reads the retained per-node
  deployment attributes; additive to the #1 partition.

## Open questions (carried, non-blocking)

- Default floor/ceiling values and metric weights — ship documented defaults, tune from real designs.
- Should `twf graph chunks` ever auto-apply the floor merge, or only *recommend* it? (Lean: recommend
  only — consistent with "informs, does not impose".)
- Multi-file designs: cross-file callers already resolve in the graph, so the chunker inherits that;
  verify in a sampler fixture.
