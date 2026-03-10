# Skill Revisions: Design

**Source:** `reflect-skill` (two sessions merged)
**Reflection files:** `REFLECTION_DESIGN.md` (consumed, both sessions)

## Summary

Two reflection sessions surfaced complementary issues. Session 1 (access-control design) found: the completion criteria validate notation correctness but not operational correctness, flat checklist items invite mental checkmarks without forcing decisions, and the topology guidance lacks a decision procedure. Session 2 (dev-cycle orchestrator design) found: the `heartbeat()` example teaches the wrong pattern, completion/handoff requirements live outside the design loop and get skipped, and TWF's happy-path fluency makes failure paths invisible. Merged revisions address all findings across 7 groups.

## Group 1: Heartbeat Instruction vs. Marker

**Findings:**
- `notation-examples.md:244-248`: The `ProcessLargeDataset` example shows `heartbeat()` once before a blocking `process()` call, which is meaningless at runtime. The comment says "periodically" but the code calls it once. This example directly caused a misuse in the dev-cycle design that the user had to catch.
- `heartbeat()` has two distinct usage patterns: (a) loop heartbeat — inside a `for` loop, represents a real call site per iteration; (b) opaque-call heartbeat — before a single blocking call, functions as a design marker requiring a comment about the implementation mechanism (e.g., background goroutine).
- The broader principle: TWF activity bodies are sequential pseudocode; Temporal concerns requiring intra-activity concurrency (heartbeating during a blocking call, cancellation detection, async completion) can only be *marked*, not *expressed*. The skill never names this principle.

**Files touched:** `skills/design/reference/notation-examples.md`, `skills/design/reference/anti-patterns.md`, `skills/design/reference/notation-reference.md`, `skills/design/reference/primitives-reference.md`, `skills/design/topics/activities-advanced.md`
**Change type:** `Internal`
**Parallelism:** All five files can be edited in parallel. Independent of all other groups.

**Specific changes:**

1. **`notation-examples.md`** — Replace the `ProcessLargeDataset` heartbeat example with two examples: one showing loop heartbeat (instruction), one showing opaque-call heartbeat (marker with implementation comment). Add a fourth activity-body detail level ("implementation marker") after the existing three (obvious/non-obvious/complex contract).

2. **`anti-patterns.md`** — Add "Heartbeat Before a Blocking Call" under Activity Anti-Patterns. Show BAD (bare `heartbeat()` before blocking call), GOOD (with implementation comment), and ALSO GOOD (loop case where `heartbeat()` is a real call site).

3. **`notation-reference.md`** — Update the `heartbeat()` row to note the duality: "Inline in a loop = per-iteration heartbeat. Standalone before opaque blocking call = implementation marker (background thread needed, describe in comment)."

4. **`primitives-reference.md`** — Update the `heartbeat` row similarly.

5. **`activities-advanced.md`** — After "Basic Heartbeat Pattern," add a "Heartbeat Placement: Loop vs. Opaque Call" section explaining the two patterns with examples.

## Group 2: Write-Before-Read Bootstrapping Gate

**Findings:**
- `SKILL.md:16`: "Write before you read" collapses two distinct kinds of reading: syntax bootstrapping (learning what TWF sentences are possible) and design preparation (reading Temporal pattern docs before having a specific question). The directive targets the latter but blocks the former.
- The skill presupposes TWF syntax is in working memory. The worked example starts with `workflow ProcessOrder(...)` without preamble. A first-time TWF user cannot write valid TWF without knowing the grammar.

**Files touched:** `skills/design/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

1. Replace "Write before you read" paragraph with: "**Know the notation, then write before you read.** If you haven't written TWF before, read the quick reference ([notation-reference.md](./reference/notation-reference.md)) once to learn the syntax — keyword grammar, indentation scoping, and close statements. That's the only upfront reading you need. Then draft TWF from the workflow description even if you're unsure — use `twf check --lenient` for incomplete designs. Consult design references (primitives, boundaries, patterns) only to fix specific errors or resolve specific design questions, not to prepare."

2. Update Reference Index preamble: "**Notation reference** ([notation-reference.md](./reference/notation-reference.md)) is prerequisite — read it once before your first design. Everything else: read only what the current design requires."

## Group 3: Completion Gate, Operational Review, and Handoff Template

**Findings:**
- The design flow ends at `twf check` passing. The designer experiences closure there. The checklist and handoff requirements live outside the flow and were entirely skipped in both reflection sessions.
- "Checklists outside the process flow become aspirational documentation." The quality gates need integration into the design loop.
- The skill's completion criteria are all structural: `twf check` passes, `twf symbols` lists expected definitions, worker/namespace validates. These are necessary but not sufficient. The skill needs a second review pass after `twf check` succeeds, focused on operational concerns: partial failure compensation, handler blocking time, throughput bottlenecks, cancellation, and observability handoff.
- The handoff section is prose instructions that require recall. Should be a required output template with named fields.

**Files touched:** `skills/design/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Depends on Group 2 for SKILL.md ordering (write-before-read comes first in the file). Independent of Groups 1, 5, 6, 7.

**Specific changes:**

1. **Flow diagram** — Add a completion gate after the `twf check` loop: `Error? No → Operational Review → Produce Handoff → Done`. The operational review walks the checklist. The handoff produces the template.

2. **Completion section** — Replace the prose list with two phases:
   - *Structural check*: `twf check` passes, `twf symbols` lists expected definitions, topology validates.
   - *Operational review*: Walk the design checklist (determinism, idempotency, failure handling, cancellation, throughput). If the design includes `await one`, `await all`, signals, or `continue_as_new`, suggest the TWF visualizer extension.

3. **Handoff section** — Replace prose with a required output template:
   ```
   ## Handoff
   - Target SDK: [ask user if not stated]
   - External systems: [extracted from activity bodies]
   - Implementation notes: [decisions the notation cannot express]
   - Next step: [suggest author skill if available]
   ```

## Group 4: Failure-Path Awareness and Expressiveness Boundaries

**Findings:**
- TWF describes happy paths fluently (`-> result` assumes success, `await all` assumes all complete) and leaves failure paths implicit. The skill has no mechanism to prompt the designer to think about what the notation cannot express.
- The design flow's error branch has two categories: `Error → Can fix confidently? → Yes → Fix / No → Consult user`. But there is a third category: errors that mean "the architecture you want cannot be represented in TWF; restructure." These require changing the design intent, not the notation.

**Files touched:** `skills/design/SKILL.md`
**Change type:** `Internal`
**Parallelism:** Can be done with Group 3 (same file, different sections).

**Specific changes:**

1. Add a note after the write→check→fix loop: "**TWF expresses the happy path.** After `twf check` passes, review the design for failure paths the notation cannot express: What happens when an `await all` child fails? What happens when an activity exhausts retries? Are shared resources (filesystem, database) safe under concurrent access? Document these in comments."

2. Add a third branch to the flow diagram's error handling: `Error → Can fix notation? → Yes → Fix / No → Language boundary? → Yes → Restructure approach / No → Consult user`. Add restructuring guidance: "If cross-queue routing on a child workflow call fails, move routing to activity-level options. If options blocks fail at deep nesting, pull the timeout to the child workflow definition or note it for SDK-level configuration."

## Group 5: Reframe Checklist Items as Generative Questions

**Findings:**
- Flat checklist items invite mental checkmarks without forcing design decisions. "Partial success handled" → checked off because a status field exists, without verifying compensation logic. "Timeouts configured" → checked off for activity timeouts, missing workflow-level timeout decisions.
- The checklist should reframe key items as concrete questions that force answers about the specific design.

**Files touched:** `skills/design/reference/design-checklist.md`
**Change type:** `Internal`
**Parallelism:** Can combine with Groups 6 and 7 (same file, additive changes).

**Specific changes:**

Reframe existing checklist items as generative questions:
- "Partial success handled" → "For every fan-out or multi-step sequence, name the partial-failure compensation strategy or document why none is needed."
- "Timeouts configured" → "For every activity and child workflow call, decide the timeout. For entity workflows that may be intentionally unbounded, document that decision."
- "Loops have deterministic bounds" → "For every `for` loop, identify the exit condition. For `for:` (infinite loops), verify `close continue_as_new` or `break` prevents unbounded history."
- "Activities are idempotent" → "For every activity, describe what happens when it is retried after a partial completion. If it creates a resource, does it handle 'already exists'?"

## Group 6: Topology Decision Framework

**Findings:**
- The `topics/task-queues.md` topic provides a "when to split" table but no decision procedure. In the access-control reflection, the designer improvised the entire topology — starting with a domain-aligned split (the wrong pattern) before accidentally arriving at the correct control+connector split.
- The skill should teach three concepts:
  1. **Contention Boundary heuristic** — "Separate queues at resource contention boundaries, not domain boundaries."
  2. **Minimum Viable Split pattern** — "Control + connector is the standard first topology decision." Orchestration workflows on one queue, external system I/O activities on another.
  3. **Routing Cost assessment** — "Count cross-queue call sites. If most workflow→activity calls cross queues, the topology is fighting the call graph."

**Files touched:** `skills/design/topics/task-queues.md`
**Change type:** `Internal`
**Parallelism:** Independent of all other groups.

## Group 7: Missing Checklist Items

**Findings:**
- Both reflection sessions surfaced checklist gaps. These items are additive — new sections and items for `design-checklist.md`.

**Files touched:** `skills/design/reference/design-checklist.md`
**Change type:** `Internal`
**Parallelism:** Can combine with Group 5 (same file).

**Specific items to add:**

*Activity Implementation Markers (from session 2):*
- Every `heartbeat()` in a non-loop context has a comment describing the implementation mechanism
- Long-running activities with opaque blocking calls have `heartbeat_timeout` set at the call site

*Failure Paths (from session 2):*
- What happens when an `await all` child fails?
- Are partial-success paths handled?
- Are shared mutable resources (filesystem, database) identified and contention addressed?

*Cancellation (from session 1):*
- For each workflow, identify how it can be cancelled, who can cancel it, and what cleanup is required

*Continue-as-New Path Tracing (from session 1):*
- For every `close continue_as_new(...)`, trace the workflow body from the top with the passed arguments and verify it resumes at the correct logical state

*Update Handler Blocking Budget (from session 1):*
- If an update handler calls a child workflow or long-running activity, note the caller's blocking time

*Throughput per Workflow Instance (from session 1):*
- For workflows that receive high-volume signals or updates, estimate peak throughput and consider sharding

*Observability Handoff (from session 1):*
- Note which workflow state dimensions need visibility queries (phase, priority, beneficiary) in handoff notes. TWF has no search attribute syntax, but the design should capture the intent.

*Domain Invariant Traceability (from session 1):*
- Each critical domain invariant identified in requirements has a corresponding structural mechanism in the workflow, not just an activity comment

*Conditionally Long-Lived Workflows (from session 1):*
- If a workflow is short-lived on the happy path but enters an unbounded wait on a fallback path, consider `continue_as_new` protection for the fallback
