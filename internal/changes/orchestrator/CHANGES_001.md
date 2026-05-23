# Orchestrator Changes: Failure Handling + Retry/Timeout Configuration

**Source:** Originally `ORCHESTRATOR_REVISIONS.md` Groups 1 + 2 (renamed into the `internal/changes/` flow). Groups 3 + 4 of the original file are now `internal/changes/orchestrator/REVISIONS_001.md` (pending work).
**Reflection file:** `REFLECTION_DESIGN.md` (consumed)

## Summary

These two groups were marked **COMPLETED** in the original revision plan. They captured the first pass of hardening `tools/orchestrator/dev-cycle.twf`: child failure handling and retry/timeout configuration on every activity call. One sub-item (Group 2 / D9) remains deferred — it is blocked on the parser fix tracked in `internal/changes/parser/REVISIONS_001.md`.

## Group 1: Child Workflow Failure Handling — COMPLETED

**Findings:**
- **D1** (High): `await all` in `DevCycleWorkflow` has no error handling. In Temporal, `await all` is `Promise.all` — if one `ComponentCycleWorkflow` fails, the parent gets an immediate `ChildWorkflowFailure`, the commit loop is never reached, and all other children's results are lost.
- **O1**: The README doesn't specify what happens when a child workflow fails mid-wave. The design had to guess and guessed wrong (no handling at all).

**Files touched:** `tools/orchestrator/dev-cycle.twf`, `tools/orchestrator/README.md`
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

1. **`dev-cycle.twf`** — The `await all` wave block needs partial-failure handling. Options: (a) use individual promises per child and collect results (allowing some to fail), or (b) document that one child failure fails the wave and add cleanup logic. The design should decide whether a failed child means "skip it and continue" or "abort the wave."

2. **`README.md`** — Add a "Failure Handling" section or expand "Limits & Safety" to specify: what happens when a child workflow fails (skip vs. abort wave), what happens when `InvokeClaudeCode` returns a non-zero exit code, and whether the main workflow cleans up the worktree on failure.

## Group 2: Retry and Timeout Configuration — COMPLETED (except D9)

**Findings:**
- **D2** (High): Zero retry policies and zero timeout specifications on any activity call. `InvokeClaudeCode` could run for 30+ minutes with no `start_to_close_timeout` or `heartbeat_timeout`. In Go SDK, activities without `start_to_close_timeout` fail at registration time.
- **D8** (Medium): `InvokeClaudeCode` needs `heartbeat_timeout` at call sites (e.g., 60s) to detect stuck subprocesses within the 30-minute window.
- **D9** (Medium, **deferred**): `workflow_execution_timeout: 30m` on child workflows was forced to a comment by a parser limitation. Should be applied once the parser bug is fixed. **Tracked in `internal/changes/parser/REVISIONS_001.md` Group 1.**
- **D7** (Medium): `GitCommit` idempotency not addressed. Retrying a commit on an empty diff (changes already committed) should be a no-op, not an error.

**Files touched:** `tools/orchestrator/dev-cycle.twf`
**Change type:** `Internal`
**Parallelism:** Independent of Group 1.

**Specific changes:**

1. Add `options:` blocks to activity calls in both workflows:
   - `InvokeClaudeCode`: `start_to_close_timeout: 30m`, `heartbeat_timeout: 60s`, `retry_policy: maximum_attempts: 1` (non-idempotent filesystem edits)
   - `GitCommit`: `start_to_close_timeout: 30s`, `retry_policy: maximum_attempts: 3` (idempotent if no-op on empty diff)
   - `CreateWorktree`, `CleanupWorktree`: `start_to_close_timeout: 1m`
   - `ScanRevisions`, `BuildWaveManifest`: `start_to_close_timeout: 30s`
   - `CreatePullRequest`: `start_to_close_timeout: 2m`, `retry_policy: maximum_attempts: 3`

2. Add idempotency comment to `GitCommit` activity body: "Idempotent: if no changes to stage, returns empty SHA without error."

3. **Deferred — D9.** Once parser bug P1 (`internal/changes/parser/REVISIONS_001.md` Group 1) is fixed, move `workflow_execution_timeout: 30m` from a comment to an actual `options:` block on the child workflow call.
