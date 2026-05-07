# Orchestrator Revisions: Design Artifact + README

**Source:** `reflect-skill`
**Reflection file:** `REFLECTION_DESIGN.md` (consumed)

## Summary

System-level analysis of `tools/orchestrator/dev-cycle.twf` found design defects invisible at the component level: no error handling for child failures, no retry/timeout configuration, filesystem contention in the shared worktree, and missing outcome distinction. The README spec also has gaps that left these questions unanswered for the designer.

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

## Group 2: Retry and Timeout Configuration — COMPLETED

**Findings:**
- **D2** (High): Zero retry policies and zero timeout specifications on any activity call. `InvokeClaudeCode` could run for 30+ minutes with no `start_to_close_timeout` or `heartbeat_timeout`. In Go SDK, activities without `start_to_close_timeout` fail at registration time.
- **D8** (Medium): `InvokeClaudeCode` needs `heartbeat_timeout` at call sites (e.g., 60s) to detect stuck subprocesses within the 30-minute window.
- **D9** (Medium): `workflow_execution_timeout: 30m` on child workflows was forced to a comment by a parser limitation. Should be applied once the parser bug is fixed.
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

3. Once parser bug P1 is fixed, move `workflow_execution_timeout: 30m` from a comment to an actual `options:` block on the child workflow call.

## Group 3: Shared Worktree Contention

**Findings:**
- **D3** (High): Multiple `ComponentCycleWorkflow` children run `InvokeClaudeCode` subprocesses in the same worktree concurrently. The `propagate-changes` step writes REVISIONS files to `changes/{downstream}/` while another child's `address-review` might be reading from `changes/`. This is a filesystem race.
- **D4** (Medium): The worktree is a local filesystem resource. All activities must run on the same host. This is a fundamental deployment constraint not documented anywhere.
- **O2**: The README doesn't address filesystem contention between parallel children.

**Files touched:** `tools/orchestrator/dev-cycle.twf`, `tools/orchestrator/README.md`
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

1. **`dev-cycle.twf`** — Add a comment block in the header documenting the co-location constraint: all activities must run on the same host because the worktree is a local filesystem resource. Consider whether the `session` pattern (Temporal sessions for host-affinity) should be noted.

2. **`dev-cycle.twf`** — Address the filesystem race. The key insight: within a wave, children's `address-review` edits non-overlapping source directories (each component has its own scope), but `propagate-changes` writes to other components' `changes/` subdirectories. Two options:
   - (a) Restructure so `propagate-changes` runs *after* the wave (in the parent), not inside the child. This eliminates the race but changes the architecture.
   - (b) Document the invariant: `propagate-changes` writes only to `changes/{downstream}/`, and within a wave, no child reads from a downstream component's changes directory. The `BuildWaveManifest` activity must enforce this by never scheduling upstream and downstream components in the same wave.

3. **`README.md`** — Add to "Parallel Execution" section: document the filesystem safety invariant (components in the same wave must have non-overlapping read/write scopes), and note the host co-location requirement.

## Group 4: Outcome Clarity

**Findings:**
- **D5** (Low): `prURL` referenced in `DevCycleResult` but only assigned inside `if (config.createPR)`. If false, `prURL` is undefined.
- **D6** (Low): "Ran out of waves" and "completed all work" both lead to the same finalization and the same `DevCycleResult`. An operator cannot tell whether the system finished or gave up.
- **O3**: The README doesn't distinguish these outcomes.

**Files touched:** `tools/orchestrator/dev-cycle.twf`, `tools/orchestrator/README.md`
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

1. **`dev-cycle.twf`** — Add an `outcome` field to `DevCycleResult` (e.g., `"completed"` vs. `"wave_limit_reached"`). Set it based on which `break` was taken. Initialize `prURL` to a default value before the conditional.

2. **`README.md`** — Add to "Limits & Safety": when `maxWaves` is hit with REVISIONS remaining, the result indicates `wave_limit_reached` so the operator knows work was deferred.
