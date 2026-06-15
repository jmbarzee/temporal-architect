Ordered implementation plan
0. (early, parallel) — G1 baseline reflection pass. Run the zero-context baseline + case sub-agents on the original .twf artifacts before locking the Stage 1 skill rewrites — it's meant to surface blind spots first. No REVISIONS; it's a task. (Optional but recommended; doesn't block anything.)

Stage 1 — independent skill content (parallelizable):

design-skill/REVISIONS_002.md → Group 2 first: the shared project-discovery subagent (B1c). It's the cross-dependency — build it before the author-go Orient that consumes it.
design-skill/REVISIONS_002.md → Groups 1 & 3 (reverse-engineering parallel path; one-package + comment conventions).
author-go-skill/REVISIONS_001.md — Group 1 (Orient, depends on #1) then Groups 2–4 (proto-driven.md, three-layer-testing.md, worker expansion), in parallel. Distill from temp-change-set/skill-retro/PROTO_DRIVEN_TEMPORAL.md + THREE_LAYER_TESTING.md, then delete those.
packaging.md M3 (extension symlinks twf into ~/.local/bin) — fully independent, do anytime.
AGENTS.md (F1) — dev-repo North Star — independent.


Stage 2 — new skill (after Stage 1's discovery subagent): 6. author-infra-skill/REVISIONS_001.md — Group 1 (skeleton+Orient, needs the discovery subagent) then Groups 2–4 (terraform.md, tcld.md, not-yet-modeled intent).

Stage 3 — DSL/parser: 7. dsl/REVISIONS_001.md Entry Point Annotation — DEFERRED this cycle. The narrow `@entry` marker is being reframed as a general "connect in and out of Temporal" boundary concept (inbound triggers + outbound "declared elsewhere"); back to dsl/BACKLOG.md → *Connecting In and Out of Temporal*. 8. parser/REVISIONS_002.md reachability + tree/chunk tooling — DEFERRED with #7 (it hard-depended on declared roots). Chunk identification stays in parser/BACKLOG.md → *Graph Decomposition*: basic graph traversal of connected components works today; loops/cycles and oversized trees are the harder open cases needing a more sophisticated strategy. 9. dsl/REVISIONS_001.md Group 1 + parser/REVISIONS_002.md Group 1 (worker options, parser-permissive) — independent pair; now the only Stage 3 work.

Stage 4 — capstone (after 1–2, ideally after 8): 10. harness-skill/REVISIONS_001.md (ships as temporal-architect) — Groups 1–4, then Group 5 (trim design). 11. F2/F3 — echo the North Star into README + published package descriptions.

Critical-path summary
B1c discovery subagent (#1) gates author-go Orient (#3) and author-infra (#6).
Entry Point Annotation (#7) and the graph-tree tooling that hard-depended on it (#8) are DEFERRED this cycle (see Stage 3). The harness (#10) ships without tool-computed tree decomposition, falling back to basic connected-component graph traversal (parser/BACKLOG.md → Graph Decomposition); precise root-based trees return with the reframed inbound boundary.
Everything else in Stage 1 (packaging M3, AGENTS.md, the reference docs, worker section) is independent and parallelizable.
The deep DSL designs (packages/@ref/extern/access-policy/search-attrs, plus the reframed inbound/outbound boundary — dsl/BACKLOG.md → Connecting In and Out of Temporal) stay in the dsl/parser BACKLOGs — promote to REVISIONS later, not on this path.
Each REVISIONS file has its own Findings / Files-touched / Parallelism / Specific-changes, so they're ready for /project:address-review one at a time. The plan now carries the REVISIONS index up top for traceability.

---

# Feature design capture: Topology-based graph decomposition (the un-deferral of #8)

Parked design for the chunk/decomposition tooling that Stage 3 #8 deferred. This is the brainstormed
design-of-record; promote to `parser/REVISIONS_NNN.md` when planning resumes. Does **not** depend on
declared inbound roots (#7) — roots stay heuristic and #7 slots in additively later.

**Reading:** `internal/changes/parser/BACKLOG.md` → *Graph Decomposition: Composable Chunks / Workflow
Trees*; `tools/lsp/parser/graph/graph.go` (the resolved deployment graph this rides on).

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
strategies like subtree extraction until then, then community detection)" → **BACKLOG**, not this pass.

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

## Spillover backlog items

- **Loop cut ceiling** (parser/BACKLOG) — raised ceiling above which a loop's subtrees, then
  community-detection cuts, apply. Not this pass.
- **Worker / namespace / nexus grouping lens** (separate parser/BACKLOG item) — an alternate grouping
  dimension over the same node set; rides existing coarsened worker/namespace edges + nexus tiers. Parallel
  to the call-structure decomposition, not on its critical path.
- **#7 declared inbound roots** — sharpens root identification additively (`source: declared`).
- **#1b language boundaries** — depends on lang annotations (dsl/BACKLOG); reads the retained deployment
  attributes; additive.