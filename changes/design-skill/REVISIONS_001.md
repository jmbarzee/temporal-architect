# Design Skill Revisions: Alignment to DSL Changes

**Source:** `propagate-changes` from `changes/dsl/CHANGES_001.md`
**Focus:** `await one` cancellation semantics correction, `parent_close_policy` descriptions

## Summary

The design skill files are largely silent on `await one` non-winning-case lifecycle. No file explicitly states the old incorrect semantics ("non-winning cases are automatically cancelled"), but several files present `await one` race patterns without noting that non-winning operations continue running. The `parent_close_policy` table in `child-workflows.md` needs value descriptions to match the LANGUAGE_SPEC additions. Two files mirror the skill across `skills/design/` and `packages/vscode/skills/design/` -- all changes must be applied to both locations.

## Group 1: `await one` Lifecycle Annotation

**Findings:**

- `skills/design/reference/notation-reference.md:25` — `await one:` is described as "Race: first to complete wins (timeouts, signal-or-timer patterns)". **Severity: Low.** The description is correct but silent on non-winning case lifecycle. A parenthetical note that non-winning operations continue running would prevent the common misconception.
- `skills/design/topics/timers-scheduling.md:51-58` — "Operation Deadline Pattern" shows `await one:` racing an activity against a timer. **Severity: Medium.** If the timer wins, the activity (`LongOperation`) continues running in the background. This is a key place where users would assume cancellation. A comment or note should clarify: the losing activity is NOT cancelled and continues until workflow run ends.
- `skills/design/topics/timers-scheduling.md:62-74` — "Timeout on Signal Wait" shows `await one:` with three signal/timer cases. **Severity: Low.** These are signal waits and timers, not operations that persist. No change strictly needed, but a general note in the timers-scheduling topic about `await one` non-cancellation would cover all patterns.
- `skills/design/topics/timers-scheduling.md:107-119` — "Deadline with Periodic Check" shows `await one:` with two timers. **Severity: Low.** Both cases are timers; non-winning timer simply fires but the case body doesn't execute. No correction needed.
- `skills/design/topics/patterns.md:81,95,333-349,413-419` — Entity workflow pattern uses `await one:` in a `for` loop with signals and timers. **Severity: Low.** Cases are signals/timers (no pending operations to cancel). Correct as-is.
- `skills/design/topics/patterns.md:412-419` — Polling pattern uses `await one:` with two timers (backoff + deadline). **Severity: Low.** Timer-only race; correct as-is.
- `skills/design/topics/promises-conditions.md:42-50` — "Promises in `await one` (race)" shows a promise racing against a timeout. **Severity: Medium.** If the timeout wins, the promise's underlying operation continues running. This is the canonical example where users would assume the promise is cancelled. A note should explain that the operation backing `p` is NOT cancelled when timeout wins.
- `skills/design/topics/promises-conditions.md:108-116` — "Conditions in `await one` (race)" shows a condition racing a timer. **Severity: Low.** Condition is a boolean check, not an operation. Correct as-is.
- `skills/design/reference/notation-examples.md:142-148` — Example shows `await one:` with signal vs timer. **Severity: Low.** Signal wait patterns don't leave pending operations. Correct as-is.
- `skills/design/topics/nexus.md:155-165` — "Await One with Nexus" shows nexus call racing a timer. **Severity: Medium.** If the timer wins, the nexus operation continues running in the target namespace. Should note that the nexus call is NOT cancelled and the target workflow continues.
- `skills/design/reference/anti-patterns.md:200-206` — Non-determinism anti-pattern uses `await one:` as a "GOOD" example for deadline patterns. **Severity: Low.** Shown in a comment block as correct usage. No change needed.

**Files touched:** `skills/design/reference/notation-reference.md`, `skills/design/topics/timers-scheduling.md`, `skills/design/topics/promises-conditions.md`, `skills/design/topics/nexus.md`
**Change type:** `Internal`
**Parallelism:** All four files can be edited in parallel. Mirror changes to `packages/vscode/skills/design/` after.

## Group 2: `parent_close_policy` Value Descriptions

**Findings:**

- `skills/design/topics/child-workflows.md:151-158` — "Parent Close Policies" table lists the three policies with one-sentence behaviors: `TERMINATE` = "Child terminated when parent closes (default)", `ABANDON` = "Child continues running independently", `REQUEST_CANCEL` = "Cancellation requested but child can handle gracefully". **Severity: None (already aligned).** These descriptions match the LANGUAGE_SPEC additions at line 332. No change needed.
- `skills/design/topics/child-workflows.md:98` — Note says `detach` implies `ABANDON` parent close policy. **Severity: None.** Correct and aligned.
- `skills/design/topics/child-workflows.md:139-140` — "Cancellation Propagation" section says "By default, cancelling a parent cancels its children." **Severity: Low.** This is correct for the default `TERMINATE` policy, but could be more precise: the default `parent_close_policy` is `TERMINATE`, which terminates (not just cancels) the child when the parent closes. The distinction between "parent cancelled" and "parent closes" matters. Consider rewording to reference `parent_close_policy` explicitly.
- `skills/design/reference/notation-reference.md` — No mention of `parent_close_policy`. **Severity: None.** This is a syntax-only reference table; option values belong in the topic docs. No change needed.

**Files touched:** `skills/design/topics/child-workflows.md` (optional refinement only)
**Change type:** `Internal`
**Parallelism:** Independent of Group 1.

## Group 3: Missing Cross-Reference Between `await one` and `parent_close_policy`

**Findings:**

- No file in the design skill connects the `await one` lifecycle to `parent_close_policy`. The LANGUAGE_SPEC now states: "For child workflows, the `parent_close_policy` option controls behavior at parent completion (TERMINATE, REQUEST_CANCEL, or ABANDON)." The design skill should note this interaction in at least one of: `child-workflows.md` or `promises-conditions.md`. **Severity: Low.** A brief note in the `child-workflows.md` "Cancellation Propagation" section linking `parent_close_policy` to `await one` non-winning child workflows would close the gap.

**Files touched:** `skills/design/topics/child-workflows.md`
**Change type:** `Internal`
**Parallelism:** Can be combined with Group 2 edits to the same file.

## Severity Summary

| Severity | Count | Action |
|----------|-------|--------|
| Medium | 3 | Add `await one` non-cancellation notes to `timers-scheduling.md`, `promises-conditions.md`, `nexus.md` |
| Low | 7 | Optional clarifications; defer if not worth the token cost |
| None | 4 | Already aligned, no change needed |

## Recommended Execution Order

1. **Group 1** (Medium items): Add a brief note to `timers-scheduling.md` (Operation Deadline Pattern), `promises-conditions.md` (Promises in `await one`), and `nexus.md` (Await One with Nexus) clarifying that non-winning operations are NOT cancelled and continue running until workflow run ends.
2. **Group 2**: No mandatory changes; optional rewording of `child-workflows.md:139-140` for precision.
3. **Group 3**: Optional cross-reference note in `child-workflows.md`.
4. **Mirror**: After all edits, sync `skills/design/` to `packages/vscode/skills/design/`.
