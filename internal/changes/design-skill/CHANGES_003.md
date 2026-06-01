# Design Skill Changes: The Runtime / Cost / Lifecycle Dimension

> **Status: COMPLETED, with one deviation.** Worked example extended with explicit `start_to_close_timeout`/`retry_policy` and a counter-bounded `continue_as_new` loop; common `options:` keys table added to `notation-reference.md`; activity-per-network-call default in `workflow-boundaries.md`; I/O-vs-in-memory bound + activity-sprawl anti-pattern; payload-codec deferral and bounded-but-large-history reframe in `anti-patterns.md`; CAN-strategy-stated note in `long-running.md`.
>
> **Deviation (Groups 1 & 2):** `workflow_id` is **not** a valid TWF call option — the spec allows only `workflow_id_reuse_policy` on workflow calls, and `child-workflows.md` already treats `workflow_id` as SDK-level. Per decision, `workflow_id` was **omitted** from the worked example and the options table (which documents `workflow_id_reuse_policy` instead). The example demonstrates timeout/retry + `continue_as_new` only. The counter-bound (`pageCount`) is used instead of `history_length()` because nested parentheses inside an `if (...)` condition do not parse.

**Source:** `reflect-skill` from `REFLECTION_DESIGN.md`
**Focus:** The skill designs *static call topology* and never forces reasoning about *behavior over time and scale* — history growth, identity across retries, per-call cost, and data ownership. Teach this dimension where it belongs: in the canonical worked example and the reference docs, so it is modeled rather than enumerated.

## Summary

The reflection's "underconsidered" findings are not six unrelated gaps. They are points on one missing axis: the workflow as a system that runs over time and at scale. `continue_as_new`, `workflow_id`, explicit timeouts/retries, determinism-as-cost, and `*Ref` storage ownership are all the same blind spot — ironic for a *Temporal* design tool. The skill captures *what calls what* and validates grammar; nothing in the flow or the examples surfaces *how history grows, how things retry, how long things run, who owns state over time*.

Two correctness notes that sharpen the fixes (and correct minor overclaims in the reflection):

- `continue_as_new` is **already** in `notation-reference.md` (the `for:` row even says it "needs `close continue_as_new`"). The real gap is that it never appears in the **worked example** and is never *prompted*. Fix is demonstration, not documentation-from-scratch.
- The determinism table in `core-principles.md` **already** lists "Logic on activity results," "Local variables," and "Workflow-local state" as workflow-safe. So the `Read*`-activity sprawl was partly an *application* failure, not a pure doc gap. Fix is an explicit callout, not a table rewrite.

## Group 1: Make the Canonical Worked Example Load-Bearing

**Findings:**

- `skills/design/SKILL.md:45-79` — The worked example (`ProcessOrder`) shows structure only: activities, one child workflow, `close complete`. **Severity: High.** A designer following this example produces workflows with no `workflow_id`, no explicit timeouts, and no `continue_as_new` — because the canonical example demonstrates none of them. Add a second short worked example (or extend the existing one) that demonstrates, in context and with a one-line rationale each:
  - an explicit `workflow_id` on a child-workflow call (parent-retry idempotency),
  - an explicit `start_to_close_timeout` / `retry_policy` on at least one activity call,
  - a bounded-but-large loop that reaches `close continue_as_new(...)`.
  These aren't optional polish — they are load-bearing for long workflows and parent-retry idempotency. The example is where the skill actually teaches behavior, so the behavior must appear there.

**Files touched:** `skills/design/SKILL.md`, `skills/design/reference/notation-examples.md`
**Change type:** `Internal`
**Parallelism:** Independent; coordinate with `REVISIONS_002` Group 2 only because both touch `SKILL.md`.

## Group 2: Document Common `options:` Keys

**Findings:**

- `skills/design/reference/notation-reference.md:28` — `options: key: value` is documented generically, with no enumeration of the keys that matter. **Severity: High.** A designer cannot add `workflow_id`, `start_to_close_timeout`, `retry_policy`, or `task_queue` if the reference never names them. Add a small table of the common option keys, what they attach to (activity / child workflow / nexus), and why each matters operationally (idempotency, history cost, failure behavior, routing). Keep it a lookup table; the *reasoning* lives in the example (Group 1) and topics.

**Files touched:** `skills/design/reference/notation-reference.md`
**Change type:** `Internal`
**Parallelism:** Fully independent.

## Group 3: What Belongs in an Activity — Decomposition Default + Bound

> **Framing note:** an earlier draft called this "determinism as a gradient." Drop that phrase — it's misleading (reading immutable inputs the workflow already holds was *always* deterministic and workflow-safe; nothing about determinism is a gradient). The real issue is **what an activity is for**: I/O and side effects, not in-memory access. State it from both directions — a positive default and a negative bound.

**The positive default (decomposition):**

- `skills/design/reference/workflow-boundaries.md:3-8` ("Use Activities When") and `skills/design/reference/core-principles.md:7-19` — The skill lists "external system interaction" as an activity case but never states a *default granularity*. **Severity: High (this is the critical one).** Establish the default heuristic: **one activity per network call / external interaction.** This is the right default because it makes Temporal's retry, timeout, and backoff land at exactly the unit that can fail independently — one activity per fallible boundary gives clean, granular retry semantics. Put this in `workflow-boundaries.md` as the leading rule and reinforce in `core-principles.md`.

**The negative bound (avoid sprawl):**

- `skills/design/reference/core-principles.md:7-19` — The "Safe in Workflows / Must Be in Activities" table was over-applied into activity sprawl (`ReadCritiqueReady`, `ListSubsetPaperIds`, `LookupBundleRef` — activities that read a single field from a ref the workflow already holds). **Severity: Medium.** Add a callout: *activities are for I/O and side effects. Do not wrap reads of data the workflow already holds, field access, or in-memory derivation in an activity — that's workflow code.* Each spurious activity is a task-queue roundtrip + a history event for no resilience benefit.
- **In-workflow accumulation is workflow code, not an activity (same root).** `skills/design/reference/core-principles.md` — the Comparanda design pushed pure functional updates into activities (`AppendObservations`, `AppendTrajectory`, `AppendLesson`) on the belief that workflow code can't build/mutate a collection. **Severity: Low.** Add accumulation to the negative-bound examples: appending to a list / building up state is deterministic in-memory work and belongs in the workflow body (expressible directly, incl. as a `raw` statement) — not in an `Append*` activity. *No new DSL feature is needed* (raw statements already cover this; see `twf-language-limitations.md` #5 reconciliation — the bug attributed to it was actually the fan-in gap, tracked in the DSL backlog's Dynamic Multi-Await umbrella, not a collection-mutation gap).

**Optimization guidance (secondary):**

- **Severity: Low.** After the default is set, a short "when to deviate" note: batch multiple small calls into one activity when they always succeed/fail together and per-call retry isn't meaningful; consider local activities for short deterministic helpers (ties to the backlogged `local: true` option). Frame as *optimizations away from the default*, so the default stays "activity per network call."
- `skills/design/reference/anti-patterns.md` — **Severity: Low.** Add an "Activity Sprawl / Wrapping In-Memory Work" anti-pattern entry pointing back to this callout, so the Group-2 anti-pattern re-check in `REVISIONS_002` catches it.

**Files touched:** `skills/design/reference/workflow-boundaries.md`, `skills/design/reference/core-principles.md`, `skills/design/reference/anti-patterns.md`, `skills/design/topics/activities-advanced.md` (optimization note)
**Change type:** `Internal`
**Parallelism:** Independent.

## Group 4: Large Payloads — Teach the Codec Deferral, Then the Claim-Check

> **Reframe (per review):** the original "every `*Ref` needs a full storage contract" overstated it. In many designs, large-payload handling can and *should* be **kicked down the road** to Temporal's **payload codec / custom data converter** — an implementation-layer concern, not a design-time one. The skill's actual gap is that it teaches **neither**: it says "pass references" but never mentions the codec as the standard deferral, and never says when you *can't* defer.

**Findings:**

- `skills/design/` — **the skill mentions payload codecs / data converters nowhere** (confirmed: no `codec`/`converter` matches across the skill). **Severity: Medium.** This is the core gap. Add a short note (most naturally in `anti-patterns.md:86-102` "Large Payloads" and/or a topic): Temporal supports a **payload codec / data converter** that can transparently offload, compress, or encrypt large payloads. For many designs the correct move is to note "large payloads handled by the data converter" and move on — do **not** invent a bespoke claim-check store at design time.
- `skills/design/reference/anti-patterns.md:86-102` — "Large Payloads in Workflow State" jumps straight to manual `*Ref`/S3-key passing without mentioning the codec as the lower-effort default. **Severity: Medium.** Teach that **the claim-check pattern itself is, most of the time, best implemented by a codec server** — a payload codec that transparently offloads large payloads to external storage and substitutes a reference, with no change to the workflow/activity signatures. So the decision is: **default = let the codec server handle it** (claim-check included); **escalate to an explicit application-level `*Ref` only when** the data outlives the workflow, is shared across services, or needs an ownership/GC story the codec can't own. *Only in that escalation case* does the design owe a one-line note on backing store + lifecycle — not for every payload. Note the deferral cleanly: "large-payload claim-check handled by the codec server."
- `skills/design/reference/design-checklist.md` — **Severity: Low.** Add a checklist line: "Large payloads: either deferred to the data converter/codec, or (if claim-check) a one-line store + lifecycle note." Make deferral the cheap, blessed answer.

**Files touched:** `skills/design/reference/anti-patterns.md`, `skills/design/reference/design-checklist.md` (optionally a topic note)
**Change type:** `Internal`
**Parallelism:** Shares `design-checklist.md` with Group 3 of `REVISIONS_002` and Group 5 below — coordinate checklist edits.

## Group 5: Continue-as-new for Bounded-but-Large Loops

**Findings:**

- `skills/design/reference/anti-patterns.md:5-36` and `skills/design/topics/long-running.md` — The "Unbounded History" anti-pattern covers *infinite* loops, but not *bounded-but-large* loops where history still grows linearly with `maxIterations` (the Comparanda `AgenticTask` at 40 iterations with chunky per-iteration `LlmCall` + N×`ExecuteTool` history). **Severity: Medium.** Add a note: a loop with an internal bound is not automatically history-safe; if per-iteration history is large or the bound is high, `continue_as_new` is still required. Reframe the rule from "infinite loops need continue_as_new" to "loops whose accumulated history is large need continue_as_new — bound alone is not sufficient."
- **Severity: Low (design-statement requirement).** Even when `continue_as_new` is an implementation concern deferred to an author skill, the *design* should state the strategy explicitly ("bounded at N, no continue_as_new because per-iteration history is small" or "defer to author-go") rather than leaving it silent. Add this expectation to the long-running topic and the review rubric.

**Files touched:** `skills/design/topics/long-running.md`, `skills/design/reference/anti-patterns.md`
**Change type:** `Internal`
**Parallelism:** Independent of Groups 1-2; shares `anti-patterns.md` with Groups 3-4 — batch the anti-patterns edits.

## Severity Summary

| Severity | Count | Action |
|----------|-------|--------|
| High | 3 | Load-bearing worked example (`workflow_id`, timeout/retry, `continue_as_new`); document common `options:` keys; **activity-per-network-call decomposition default** |
| Medium | 3 | I/O-vs-in-memory activity bound; payload-codec deferral (vs claim-check); bounded-but-large loop history note |
| Low | 3 | Anti-pattern entries + checklist lines reinforcing the above |

## Recommended Execution Order

1. **Group 2** (notation-reference option keys) — prerequisite vocabulary for the example.
2. **Group 1** (worked example) — demonstrate the keys in context.
3. **Groups 3-5** — the supporting callouts and anti-pattern entries; batch all `anti-patterns.md` edits together.
4. **Mirror** — sync `skills/design/` to `packages/vscode/skills/design/`.
