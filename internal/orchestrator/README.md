# Orchestrator

Temporal workflows automating the dev-cycle. A human triggers a starting review, the system loops through review → execute → propagate until no `REVISIONS` files remain or protective limits are hit.

## Architecture

Three layers:

- **DevCycleWorkflow** (main workflow): owns the worktree, manages the loop, serializes commits
- **ComponentCycleWorkflow** (child workflow): processes one component's REVISIONS files per round
- **Activities**: individual operations — Claude Code invocations, git operations, filesystem scans

```
DevCycleWorkflow
  ├─ CreateWorktree
  ├─ ScanRevisions          ← discover pending work
  ├─ ComponentCycleWorkflow ← one per component with pending REVISIONS
  │    ├─ InvokeClaudeCode (address-review)
  │    └─ InvokeClaudeCode (propagate-changes)
  ├─ GitCommit              ← serialize each child's changes
  ├─ ScanRevisions          ← check for new work from propagation
  │   ... loop ...
  ├─ InvokeClaudeCode (summarize-changes)
  └─ CleanupWorktree
```

## Components

The authoritative component graph lives in `internal/harness/components.md`; the table below is an illustrative summary (and omits `author-infra-skill`, which the manifest includes).

Each component maps to a directory scope, review commands, and downstream edges:

| Component | Scope | Quality Review | Alignment Review(s) | Downstream |
|-----------|-------|----------------|---------------------|------------|
| `dsl` | `tools/spec/sections/` | `review-quality-dsl-spec` | — | parser |
| `parser` | `tools/lsp/` | `review-quality-parser` | `review-alignment-parser` | visualizer, design-skill |
| `visualizer-spec` | `tools/visualizer/spec/` | `review-quality-visualizer-spec` | — | visualizer |
| `visualizer` | `tools/visualizer/` (minus spec/) | `review-quality-visualizer` | `review-alignment-visualizer`, `review-alignment-parser-visualizer` | — |
| `design-skill` | `skills/temporal-architect-design/` | `review-quality-skill` | `review-alignment-design-skill` | author-go-skill |
| `author-go-skill` | `skills/temporal-architect-author-go/` | `review-quality-skill` | `review-alignment-author-skills` | — |

## File Conventions

All coordination files live under `internal/changes/` with component subdirectories:

```
internal/changes/
  parser/
    quality_REVISIONS_001.md       ← pending (from review-quality-parser)
    alignment_REVISIONS_001.md     ← pending (from review-alignment-parser)
    CHANGES_001.md                 ← completed round 1
  visualizer/
    quality_REVISIONS_001.md
    parser-output_REVISIONS_001.md
    CHANGES_001.md
  design-skill/
    quality_REVISIONS_001.md
    alignment_REVISIONS_001.md
```

**Rules:**

- **REVISIONS = pending work.** Presence of any `*_REVISIONS_*.md` file triggers a child workflow for that component.
- **CHANGES = completed work.** Persists as the historical record. Never deleted during the workflow.
- A child processes **all** `*_REVISIONS_*.md` files in its component directory, merging them into one execution sequence.
- After processing, REVISIONS files are deleted and a `CHANGES_{NNN}.md` file is written.
- Propagation reads the CHANGES file and writes new REVISIONS files into downstream component directories.

**Naming conventions:**

| Pattern | Meaning |
|---------|---------|
| `{type}_REVISIONS_{NNN}.md` | Pending work. `{type}` = review type (quality, alignment, parser-output). `{NNN}` = sequence number. |
| `CHANGES_{NNN}.md` | Completed round. `{NNN}` = round number. |

## Main Workflow Loop

```
DevCycleWorkflow(initialScope):
  1. CreateWorktree
  2. ScanRevisions → group by component
  3. For each component with pending REVISIONS:
       spawn ComponentCycleWorkflow (parallel where independent)
  4. WaitForAny child completion
  5. GitCommit child's changes (scoped to component directory + internal/changes/)
  6. ScanRevisions → queue or spawn new children from propagation
  7. Repeat from 4 until: no children running AND no REVISIONS remain
  8. InvokeClaudeCode(summarize-changes)
  9. Optionally create PR
 10. CleanupWorktree
```

Step 5 serializes commits — only the main workflow touches git. Each child's work becomes one commit scoped to its component directory.

## Child Workflow

Two activities in sequence:

```
ComponentCycleWorkflow(component, revisionsFiles):
  1. InvokeClaudeCode(address-review, component, revisionsFiles)
     → edits source files, writes CHANGES_{NNN}.md, deletes consumed REVISIONS files
  2. InvokeClaudeCode(propagate-changes, component, changesFile)
     → writes downstream REVISIONS files into other component directories
```

## Parallel Execution

Components with no upstream/downstream relationship run in parallel. The dependency DAG determines waves:

```
Wave 1: dsl, parser (independent — dsl is spec-only, parser is implementation)
Wave 2: visualizer + design-skill + visualizer-spec (parallel, non-overlapping directories)
Wave 3: author-go-skill
```

Within a wave, children are independent and run concurrently. Between waves, the main workflow waits for all children to complete, commits their changes, and scans for new REVISIONS before starting the next wave.

Leaf nodes (visualizer, author-go-skill) terminate the propagation chain.

### Filesystem safety invariant

All children in a wave share one worktree. A child's `address-review` step **reads** from `internal/changes/{self}/` (and edits its own source directory), while its `propagate-changes` step **writes** REVISIONS into `internal/changes/{downstream}/`. If an upstream component and its downstream ran in the same wave, one child's propagation write would race another child's review read.

`BuildWaveManifest` enforces the invariant that prevents this: **a component and any of its downstream components are never scheduled in the same wave.** Because each component owns a distinct source directory and a distinct `internal/changes/{self}/` directory, and no in-wave sibling is downstream of another, every child's read/write scope is disjoint from every sibling's. Deferred components surface in the next `ScanRevisions` and run in a later wave. This is why propagation always lands a wave *later* than the change that triggered it.

### Host co-location requirement

The worktree is a **local filesystem resource, not shared storage.** Every activity and child workflow reads and writes that single directory, so the entire worker fleet for this design must run on the one host that owns the worktree — the orchestrator is **not horizontally scalable across machines** as designed. If a future version must span hosts, the worktree has to move to shared storage, or the worktree-touching activities must be pinned to the owning worker via Temporal **sessions** for host-affinity (sticky routing to a single worker).

## Commit Strategy

The main workflow serializes all commits. No child workflow touches git directly.

Each child's work produces one commit scoped to:
- The component's source directory (e.g., `tools/lsp/` for parser)
- The `internal/changes/` coordination directory

Git history reads as a sequence of component-scoped changes, making review straightforward.

**Final cleanup before PR:**

1. Run `summarize-changes` — reads all CHANGES files, generates consolidated summary
2. Commit the summary
3. Delete the entire `internal/changes/` directory
4. Commit the cleanup ("remove orchestration artifacts")
5. Create PR using the summary as the PR description

This preserves the full trail in git history (REVISIONS → CHANGES → summary) while keeping the PR's final state clean.

## Limits & Safety

| Limit | Default | Purpose |
|-------|---------|---------|
| Max iterations (total waves) | 4 | Prevent infinite propagation loops |
| Max child workflows total | 15 | Bound total compute |
| Per-child timeout | 30 min | Prevent stuck children |
| Human approval between waves | off (configurable) | Optional manual gate between waves |

All limits are configurable via workflow input parameters.

### Outcome reporting

The two ways the main loop exits are not the same, and `DevCycleResult.outcome` records which one happened:

| `outcome` | Meaning |
|-----------|---------|
| `completed` | A `ScanRevisions` found no remaining REVISIONS — all work drained. |
| `wave_limit_reached` | `maxWaves` was hit with REVISIONS still pending — work was **deferred**, not finished. |

When `outcome` is `wave_limit_reached`, the operator knows the system stopped on a protective limit rather than because the work was done; the leftover REVISIONS persist in the worktree and a follow-up run (or a higher `maxWaves`) can resume them. Without this field both exits produced an identical result, so "finished" and "gave up" were indistinguishable.

## Failure Handling

Child workflow failures use the saga compensation pattern:

1. **Activity retry** — `InvokeClaudeCode` has a retry policy for transient failures (subprocess crash, OOM). Temporal retries automatically.
2. **Saga compensation** — When an activity ultimately fails, the child workflow rolls back file changes in LIFO order: remove downstream REVISIONS written by `propagate-changes`, then revert source edits and restore REVISIONS in `internal/changes/{component}/`. The worktree is left clean.
3. **Workflow retry** — The child workflow call has a retry policy. After compensation cleans up, Temporal retries the entire child on a clean worktree.
4. **Ultimate failure** — If all retries are exhausted, the child fails. The parent skips it (no commit) and continues with successful children. The worktree is clean because compensation already ran.

`InvokeClaudeCode` returns a non-zero exit code as an activity failure, not a result — this lets Temporal's retry policy handle it. Infrastructure failures (heartbeat timeout, worker crash) are also retried by Temporal.

## Starting Points

Three ways to kick off the workflow:

1. **Manual review → workflow:** Run a review command manually (e.g., follow `.claude/skills/dev-cycle/references/review-quality-parser.md`). It writes REVISIONS to `internal/changes/parser/`. Then start DevCycleWorkflow — it picks up existing REVISIONS and begins the loop.

2. **Workflow with initial scope:** Start DevCycleWorkflow with an initial scope parameter (e.g., `["parser", "visualizer"]`). The workflow runs the appropriate review commands as the first wave, generating the initial REVISIONS files.

3. **Resume from existing state:** If `internal/changes/` already has REVISIONS and/or CHANGES files from a previous run, start DevCycleWorkflow — it scans `internal/changes/` and resumes from the current state.

## Activities

| Activity | Input | Output | Side Effects |
|----------|-------|--------|--------------|
| `CreateWorktree` | branch name | worktree path | Creates git worktree |
| `CleanupWorktree` | worktree path | — | Removes git worktree |
| `ScanRevisions` | `internal/changes/` path | `map[component][]revisionsFile` | None (read-only) |
| `InvokeClaudeCode` | command name, args | exit code, stdout | Reads/writes files in worktree |
| `GitCommit` | message, file paths | commit SHA | Creates git commit |
