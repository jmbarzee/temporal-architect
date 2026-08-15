# Align Visualizer Implementation to Visualizer Spec

This command answers: "does the visualizer implement everything the spec requires?"

Code quality belongs in `.claude/skills/dev-cycle/references/review-quality-visualizer.md`. Spec design belongs in `.claude/skills/dev-cycle/references/review-quality-visualizer-spec.md`. This command is solely gap detection between spec and implementation.

## Context

- `tools/visualizer/spec/TREE_VIEW.md` — Tree View spec (authoritative)
- `tools/visualizer/spec/GRAPH_VIEW.md` — Graph View spec (authoritative)
- `tools/visualizer/spec/` (all other files) — product patterns, view framework
- `tools/visualizer/src/` — TypeScript implementation (target under review)
- in-flight files in `internal/changes/parser/` — parser changes in flight that may affect data availability
- All existing files in `internal/changes/visualizer/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting known gaps or already-addressed issues

## Workflow

### Phase 1: Orient

Briefly scan all spec files and the TypeScript source directory structure. Confirm the comparison units below still apply — add topics for new spec features, note any topics now unblocked by recent parser changes. Mark any topic that requires parser data not yet emitted as `blocked`.

**Standard comparison units:**

| # | Topic | Source (spec) | Target (TypeScript) |
|---|-------|---------------|---------------------|
| 1 | Header & filter controls | TREE_VIEW.md §Header and filtering | `WorkflowCanvas.tsx`, `FilterBar.tsx`, `filter/` |
| 2 | Block rendering & anatomy | TREE_VIEW.md §Block rendering | `DefinitionBlock.tsx`, `StatementBlock.tsx`, all block component files, `blocks.css` |
| 3 | Definition types & color scheme | `PRODUCT.md` §Visual Identity; TREE_VIEW.md §Definition types | `temporal-theme.tsx`, `blocks.css` CSS variables |
| 4 | Statement block routing & dispatch | TREE_VIEW.md §Statement types | `StatementBlock.tsx` dispatch logic + all specialized block files |
| 5 | Call blocks with inline expansion | TREE_VIEW.md §Call blocks, §Cross-reference resolution | `CallBlocks.tsx`, `DefinitionContext` |
| 6 | Await blocks & handler resolution | TREE_VIEW.md §Await blocks | `AwaitBlocks.tsx`, `HandlerContext` |
| 7 | Workflow content (state, handlers, body sections) | TREE_VIEW.md §Workflow definition | `WorkflowContent.tsx` |
| 8 | Keyboard navigation | TREE_VIEW.md §Keyboard Navigation | Event handlers in canvas + block components, focus ring styling |
| 9 | Cross-reference reverse index & navigation | TREE_VIEW.md §Contextual navigation buttons | `ContextualNav.tsx`, `WorkflowCanvas.tsx` |
| 10 | View framework & tab switching | `VIEW_FRAMEWORK.md` §View Model, §Shared Filter Vocabulary | `App.tsx`, `TreeView.tsx`, `GraphView.tsx`, view state management |
| 11 | Error handling & display | TREE_VIEW.md §Errors header; `VIEW_FRAMEWORK.md` §Error Handling | `WorkflowCanvas.tsx`, `types/ast.ts` FileError |
| 12 | Live reload & state preservation | `VIEW_FRAMEWORK.md` §Live Reload | Reload logic in `App.tsx`/`WorkflowCanvas.tsx` |
| 13 | Graph view model, layout & interaction | `GRAPH_VIEW.md` | `GraphView.tsx`, `components/graph-view/`, `graph/` |

### Phase 2: Parallel Alignment

Launch one sub-agent per **unblocked** topic. For blocked topics, document the required parser data and skip the sub-agent — no implementation work is possible yet.

Each sub-agent reads the relevant **spec sections AND the corresponding TypeScript source** for its topic, then answers:

- Is this feature implemented? (`implemented` / `partial` / `missing`)
- If partial: what specifically is absent or wrong?
- Does the implementation match the spec's described behavior and interactions?

Sub-agents run in parallel. **Every sub-agent reads both sides** — spec sections and TypeScript source — for its topic.

### Phase 3: Catalog

Merge all findings. For each issue:
- **Status**: `implemented` | `partial` | `missing` | `blocked`
- **Gap**: what's absent or incomplete
- **Severity**: how far the implementation diverges from what the spec claims — a spec that asserts a behavior the code lacks outranks an unbuilt enhancement the spec marks as deferred
- **Data dependency**: if `blocked`, describe the parser JSON fields required

Drop anything already tracked in existing `internal/changes/visualizer/*_REVISIONS_*.md` or `internal/changes/visualizer/CHANGES_*.md` files.

### Phase 4: Group & Prioritize

Group by feature area. Order by severity first, then unblocked work before blocked.

### Phase 5: Write to `internal/changes/visualizer/alignment_REVISIONS_{NNN}.md`

Write the grouped plan to `internal/changes/visualizer/alignment_REVISIONS_{NNN}.md` (create the `internal/changes/visualizer/` directory if needed). Use the sequence number the dispatching agent gave you. If none was given (a human running this directly), use `_001` and increment past any file that already exists.
- `**Source:**` immediately after the H1 — the upstream `CHANGES` path when this review was triggered by a propagation, `—` when it was not. Required; `propagate-changes` dedups on it. See `.claude/skills/dev-cycle/SKILL.md` § REVISIONS file contract.
- Brief summary: coverage state per spec file, how many features are blocked on parser data
- One `## Group N: Title` section per group
- Each group: spec features addressed, files touched, change type (`Internal`), blocked status, parallelism notes

**Return the REVISIONS file path and a one-line summary of each group.** Do not begin executing them — that is `.claude/skills/dev-cycle/references/address-review.md`, dispatched separately.

## Constraints

- **Spec is authoritative.** Don't re-evaluate design decisions — that's `.claude/skills/dev-cycle/references/review-quality-visualizer-spec.md`.
- **Sub-agents are scoped by topic, not by artifact.** Every sub-agent reads both spec and TypeScript source for its topic.
- **Flag blocked work clearly.** Features waiting on parser data go in a separate group. Note the required JSON fields for each.
- **Code quality is out of scope.** Note issues separately for `.claude/skills/dev-cycle/references/review-quality-visualizer.md` — don't mix them in here.
