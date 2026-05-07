# Author-Go Skill Revisions: Alignment to DSL Changes

**Source:** `propagate-changes` from `changes/dsl/CHANGES_001.md`
**Focus:** `await one` cancellation semantics correction, `parent_close_policy` descriptions

## Summary

The author-go skill's `await-one.md` reference teaches explicit cancellation of losing timers and child workflows via `workflow.WithCancel` -- which is a Go SDK best practice for resource hygiene but is framed with language that implies `Select` *should* cancel losing cases and the code is filling a gap. The framing needs correction to align with the updated DSL semantics: non-winning cases are NOT cancelled by `await one` (matching `Selector.Select` behavior), they continue running until the workflow run ends, and explicit cancellation is an optimization to avoid wasted history events, not a semantic requirement. The `options.md` file is missing the `parent_close_policy` DSL-to-Go mapping entirely. The `workflow-call.md` and `detach.md` files already correctly describe `ParentClosePolicy` values but lack the `REQUEST_CANCEL` description text added to the spec.

## Group 1: Correct `await one` cancellation framing in `await-one.md`

**Findings:**

- `await-one.md:14-25` (severity: **high**) -- The "Common Mistakes" section frames not cancelling the losing timer as "WRONG" and cancelling it as "RIGHT". This implies `await one` semantics require cancellation of non-winning cases. The corrected DSL semantics state non-winning operations continue running; cancellation is an optimization for history hygiene, not a correctness requirement. The section should be reframed: not cancelling is *wasteful* (unnecessary workflow tasks), not *wrong*. The "WRONG/RIGHT" labels should become "WASTEFUL/BETTER" or similar.

- `await-one.md:155-157` (severity: **high**) -- Notes section states: "`Select` does not cancel losing cases. Cancel timers and child workflows explicitly using `workflow.WithCancel`". This is factually correct for Go SDK behavior but lacks the critical DSL-level context: non-winning operations continue until workflow run ends (`close complete`, `close fail`, `close continue_as_new`, or external cancellation). The note should be expanded to explain (1) the lifecycle of non-winning cases per the DSL spec, and (2) that explicit cancellation is a resource optimization, not a semantic gap.

- `await-one.md:156` (severity: **medium**) -- Instructs to "Cancel timers and child workflows explicitly". For child workflows, cancellation via `workflow.WithCancel` sends a cancellation request but the child's behavior depends on its own cancellation handling. The note conflates timer cancellation (which cleanly prevents the timer from firing) with child workflow cancellation (which is a request, not a guarantee). Should distinguish these and note that `parent_close_policy` is the mechanism controlling child lifecycle at parent completion.

**Files touched:** `skills/author-go/reference/await-one.md`
**Change type:** `Internal`
**Parallelism:** All three changes are in the same file and can be made in a single pass.

## Group 2: Correct cancellation framing in `composite-patterns.md`

**Findings:**

- `composite-patterns.md:90` (severity: **medium**) -- Pattern 1 "Why this is tricky" point 3 says: "Timer must be cancelled in the condition handler -- otherwise it fires 48h later, generating wasted workflow tasks." This is accurate as optimization guidance but should add a note that per DSL semantics the timer is NOT automatically cancelled when the condition case wins; it continues running until workflow completion. The cancellation is elective for history hygiene.

- `composite-patterns.md:175` (severity: **medium**) -- Pattern 2 "Why this is tricky" point 3 says: "Timer cancellation is still required -- even though both paths do the same work (delete), leaving the timer active wastes workflow history events." The word "required" is too strong given the corrected semantics. The timer will be cleaned up at workflow completion regardless. Should say "recommended" and explain why (history event hygiene).

**Files touched:** `skills/author-go/reference/composite-patterns.md`
**Change type:** `Internal`
**Parallelism:** Can be done in parallel with Group 1 and Group 3.

## Group 3: Add `parent_close_policy` to `options.md`

**Findings:**

- `options.md` (severity: **high**) -- The child workflow options example at lines 56-77 does not include `parent_close_policy`. The LANGUAGE_SPEC now explicitly documents this as a workflow call option with three values: `TERMINATE` (default), `REQUEST_CANCEL`, `ABANDON`. The options reference should include a DSL-to-Go mapping example showing `parent_close_policy: REQUEST_CANCEL` mapping to `ParentClosePolicy: enumspb.PARENT_CLOSE_POLICY_REQUEST_CANCEL` in `ChildWorkflowOptions`. This is the canonical place where option key mappings are documented.

- `options.md:103-105` (severity: **medium**) -- The Notes section lists option key mappings (`start_to_close_timeout -> StartToCloseTimeout`, etc.) but does not include `parent_close_policy -> ParentClosePolicy`. Should add: `parent_close_policy` -> `ParentClosePolicy` (type: `enumspb.ParentClosePolicy`; values: `PARENT_CLOSE_POLICY_TERMINATE`, `PARENT_CLOSE_POLICY_REQUEST_CANCEL`, `PARENT_CLOSE_POLICY_ABANDON`).

**Files touched:** `skills/author-go/reference/options.md`
**Change type:** `Internal`
**Parallelism:** Can be done in parallel with Groups 1, 2, and 4.

## Group 4: Enrich `parent_close_policy` descriptions in `workflow-call.md` and `detach.md`

**Findings:**

- `workflow-call.md:36` (severity: **low**) -- States: "Default `ParentClosePolicy` is `TERMINATE` -- if the parent completes, fails, or times out, the child is forcefully terminated. Set `ABANDON` or `REQUEST_CANCEL` explicitly when the child should outlive the parent." This is already correct and aligns with the spec. However, it now has an opportunity to include the description text added to the spec: `TERMINATE` = child is killed, `REQUEST_CANCEL` = child receives cancellation request, `ABANDON` = child continues independently. Adding these inline descriptions would improve the reference density. Low severity because the current text is not wrong, just less detailed.

- `detach.md:52` (severity: **low**) -- States: "`detach` with `ABANDON` is the only way for a child workflow to survive parent completion -- the default `ParentClosePolicy` is `TERMINATE`". Correct but could mention `REQUEST_CANCEL` as a middle ground (child receives cancellation but can handle it gracefully). Low severity because `detach` specifically uses `ABANDON` and the note is contextually accurate.

- `workflow-call.md:28` (severity: **no change needed**) -- Mentions "separate cancellation scope (via `ParentClosePolicy`)" as a reason to use child workflows. This is correct and unaffected by the changes.

**Files touched:** `skills/author-go/reference/workflow-call.md`, `skills/author-go/reference/detach.md`
**Change type:** `Internal`
**Parallelism:** Can be done in parallel with Groups 1, 2, and 3. The two files in this group are independent and can also be edited in parallel.

## Group 5: No impact -- files reviewed with no issues found

**Findings:**

- `SKILL.md` -- References `await one:` only in the reference index table. No semantic claims about cancellation. No change needed.
- `promise.md` -- References `await one:` for selector usage. No cancellation semantics discussed. No change needed.
- `await-all.md` -- Mentions `workflow.WithCancel` for fail-fast error handling in `await all:`. Unrelated to `await one` cancellation semantics. No change needed.
- `close.md` -- Documents `close complete`, `close fail`, `close continue_as_new` Go mappings. No interaction with `await one` cancellation lifecycle. No change needed.
- `control-flow.md` -- Pure control flow mappings. No interaction with async cancellation. No change needed.
- `signal-handler.md` -- References selector usage for signal racing. No cancellation claims. No change needed.
- `condition.md` -- References `await one:` for condition-to-selector bridging. No cancellation claims beyond `CanceledError` from `workflow.Await`. No change needed.
- `activity-def.md` -- Discusses activity-level context cancellation (heartbeat-based). Unrelated to `await one` semantics. No change needed.
- `workflow-def.md` -- Mentions `workflow.Selector` as replacement for native `select`. No cancellation claims. No change needed.

**Files touched:** none
**Change type:** N/A
**Parallelism:** N/A
