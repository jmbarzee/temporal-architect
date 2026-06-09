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