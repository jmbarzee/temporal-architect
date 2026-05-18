# Orchestrator Revisions: Filesystem Contention + Outcome Clarity

**Source:** Originally `ORCHESTRATOR_REVISIONS.md` Groups 3 + 4 (extracted on migration into the `changes/` flow). Groups 1 + 2 from the original file are now `changes/orchestrator/CHANGES_001.md` (completed work).
**Reflection file:** `REFLECTION_DESIGN.md` (consumed)

## Summary

Two open design defects remain on `tools/orchestrator/dev-cycle.twf` after the initial hardening pass: filesystem contention between parallel children sharing the worktree, and the inability to distinguish "completed all work" from "ran out of waves" in the result. Both have matching gaps in `tools/orchestrator/README.md` that the original designer would have benefited from.

## Group 1: Shared Worktree Contention

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

## Group 2: Outcome Clarity

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
