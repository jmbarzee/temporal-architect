# Visualizer Alignment Review

Align the visualizer implementation to the visualizer spec. The spec is authoritative — the TypeScript implementation is the target.

This command answers: "does the visualizer implement everything the spec requires?"

Code quality belongs in `/project:review-quality-visualizer`. Spec design belongs in `/project:review-quality-visualizer-spec`. This command is solely gap detection between spec and implementation.

## Context

- `tools/visualizer/spec/TREE_VIEW.md` — Tree View spec (authoritative)
- `tools/visualizer/spec/GRAPH_VIEW.md` — Graph View spec (authoritative)
- `tools/visualizer/spec/VIZUALIZER_PRODUCT_REVIEW_PLAN.md` — product patterns and priority tiers (authoritative)
- `VISUALIZER_SPEC_REVISIONS.md` — if present, read to avoid re-reporting known gaps
- `AST_REVISIONS.md` — parser changes in flight that may affect data availability

## Workflow

### Phase 1: Explore

Use sub-agents in parallel:
- **Spec agent**: Read all three spec documents. Build a complete inventory of every required feature, interaction, and behavior, tagged by priority tier.
- **Implementation agent**: Read all TypeScript in `tools/visualizer/src/`. For each spec feature, determine: implemented, partial, or absent? Note which features are blocked on missing parser data.

### Phase 2: Catalog

For each spec feature:
- **Status**: `implemented` | `partial` | `missing` | `blocked` (requires parser data not yet emitted)
- **Gap**: what's absent or incomplete
- **Tier**: priority tier from the product eval plan
- **Data dependency**: if `blocked`, describe the JSON fields needed from the parser

Drop `implemented` items. Focus on gaps.

### Phase 3: Group & Prioritize

Group by feature area. Order by tier first, then by whether data is already available (unblocked work before blocked).

### Phase 4: Write to `VISUALIZER_ALIGNMENT_REVISIONS.md`

Write the grouped plan to `VISUALIZER_ALIGNMENT_REVISIONS.md` at the repo root:
- Brief summary: coverage state by tier, how many features are blocked on parser data
- One `## Group N: Title` section per group
- Each group: spec features addressed, files touched, change type (`Internal`), blocked status, parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints
- **Spec is authoritative.** Don't re-evaluate design decisions — that's `/project:review-quality-visualizer-spec`.
- **Flag blocked work clearly.** Features waiting on parser data should be grouped separately and not attempted. Note the required data shape for each.
- **Code quality is out of scope.** If you notice code issues while reading the implementation, note them separately for `/project:review-quality-visualizer`, don't mix them into this review.
