# Skill Revisions: Design

**Source:** `reflect-skill` (three sessions merged)
**Reflection files:** `REFLECTION_DESIGN.md` (consumed, all sessions)

## Summary

Three reflection sessions surfaced complementary issues. Session 1 (access-control design) found: completion criteria validate notation not operational correctness, flat checklist items invite mental checkmarks, topology guidance lacks a decision procedure. Session 2 (dev-cycle orchestrator design) found: `heartbeat()` example teaches the wrong pattern, completion/handoff requirements live outside the design loop, TWF's happy-path fluency makes failure paths invisible. Session 3 (mortgage origination design) found: the design flow needs to guide progressive detail within TWF (structure first, then bodies), the skill lacks decomposition lenses for when topology isn't obvious, write-before-read needs calibration for DSL familiarity, file organization guidance is absent, and timer/pattern references lack observation-without-cancellation concepts. Merged revisions address all findings across 13 groups.

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

*Requirements Coverage (from session 3):*
- Each operation described in the brief has a corresponding workflow, activity, or explicit deferral agreed with user
- Critical invariants from the brief have structural enforcement mechanisms in the design (not just activity comments)

*Termination Path Audit (from session 3):*
- Each workflow termination path audited: what child workflows are running (promise, detached)? What external state was created that needs cleanup? Are detached children cancelled or orphaned?
- For every `close complete` and `close fail`, trace active promises and detached children

*Production Readiness (from session 3):*
- Deployment topology designed for production scale — task queue separation matches actual scaling, isolation, and failure domain needs. Do not let brief scope tiers (MVP, etc.) override the skill's deployment guidance.

## Group 8: Progressive Detail and Brief Reading

**Findings:**
- The skill's design flow goes straight from "receive description" to "write TWF." This led to a designer producing a 600-line detailed design covering ~60% of the brief's operations — detailed activity bodies and options blocks were filled in before the topology was settled, and scope was silently reduced without confirming with the user.
- TWF already operates at the systems architecture level — adding a separate "pre-architecture phase" before writing TWF would be at odds with TWF's purpose as the thinking medium for architecture. But the skill should guide the designer to **start with structure**: workflow signatures, child relationships, handler surfaces. Get the topology right before filling in activity bodies, options, and deployment.
- When reading the brief, the designer should scan for: operations (coverage targets), open questions, and scope. Open questions fall on a spectrum: resolve what you can from the brief's context and domain knowledge; surface questions where the answer depends on information the AI doesn't have (legal interpretation, product strategy, organizational preference). Default to designing the full system — do not silently reduce scope from brief annotations like "MVP."

**Files touched:** `skills/design/SKILL.md` (design flow section)
**Change type:** `Internal`
**Parallelism:** Combine with Group 2 and Group 10 changes to SKILL.md.

**Specific changes:**

1. **Revise the design flow** to guide progressive detail within TWF. The flow stays as one loop, but with directional guidance on order of detail:

   ```
   Read brief → Write TWF (structure first) → twf check → fix/consult → repeat
                                                              ↓
                                                     Fill in detail → twf check → fix → repeat
                                                              ↓
                                                     Review → Handoff → Done
   ```

   The skill's direction (not a rigid mandate, but guidance the designer can self-navigate from):
   - **Read the brief.** Scan for: operations (your coverage targets — each needs a definition or an explicit deferral agreed with the user), open questions (resolve what you can, surface what requires external input), scope (design for production scale, not a reduced scope unless the user confirms otherwise).
   - **Start with structure.** Write workflow signatures, how they call each other, what signals/updates/queries they expose. Run `twf check --lenient`. Get the topology right before filling in details. If the topology isn't obvious, consult [decomposition-procedure.md](./reference/decomposition-procedure.md).
   - **Then fill in detail.** Activity bodies, options blocks, deployment topology.
   - **Review.** Walk the design checklist. Produce handoff.

2. **Remove the rigid "intake phase" framing** from the earlier draft. The brief reading and structure-first guidance are directional — the designer should self-navigate based on complexity. For simple domains the topology is obvious and you write everything in one pass. For complex domains you sketch the shape first.

## Group 9: Decomposition Lenses

**Findings:**
- The skill provides bottom-up guidance (activity vs child workflow) but nothing for the global architecture question: "Given a complex multi-phase domain, how do I decide the number and shape of the workflow graph?" This caused ~30 minutes of unstructured deliberation on a mortgage origination design.
- Entity vs process is presented as mutually exclusive in pattern references, but real domains are often hybrids (long-lived/reactive AND drives toward completion). A loan application, insurance claim, and employee onboarding are all hybrids.
- No guidance for concurrent concern classification. When a sub-process has its own timeline but is subordinate to a parent, the choice between child, detached child, and independent workflow is unguided. A 2x2 coupling table (parent needs result × survives parent) would resolve these decisions immediately.
- These should be **reference material to consult when stuck**, not a mandated procedure. The skill stays light on process and trusts the designer to self-navigate; the decomposition lenses are there when the topology isn't obvious.

**Files touched:** New `skills/design/reference/decomposition-procedure.md`, `skills/design/SKILL.md` (reference index)
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

1. **New reference file `decomposition-procedure.md`** — framed as lenses to apply when the workflow topology isn't obvious, not as a required procedure. Content:

   - **Identity anchors.** What business entity do external systems address by ID? Each gets a top-level workflow.
   - **Entity/process/hybrid.** Entity = long-lived, reactive, no natural end. Process = drives toward completion. Hybrid = both (typical for complex domains). "A hybrid is typically an entity workflow that internally orchestrates process-phase child workflows."
   - **Concurrent concern coupling table.** For each concern running alongside the main flow:

     | Parent needs result | Survives parent | Mechanism |
     |---|---|---|
     | Yes | No | Child workflow (sync or promise) |
     | Yes | Yes | Independent workflow, parent polls/awaits signal |
     | No | Yes | Detached child or independent workflow |
     | No | No | Detached child |

   - **History budget.** If total expected events across all phases exceeds a few thousand, align continue-as-new with phase boundaries. If phases have different actors, dependencies, and failure semantics, consider separate workflows per phase.
   - **Signal surface vs child workflow.** Single state mutation from external event → signal/update handler. Multi-step logic with own timers/retries → child workflow.

2. **Update SKILL.md** design flow (per Group 8) to reference this file: "If the topology isn't obvious, consult [decomposition-procedure.md](./reference/decomposition-procedure.md)." Add to reference index with trigger: "When to consult: workflow topology decisions — how many workflows, what shape, where to split."

3. **Update pattern references** (wherever entity/process patterns are discussed) to acknowledge the hybrid pattern as the common case for complex domains.

## Group 10: Write-First Self-Calibration

**Findings:**
- "Write before you read" fails for low DSL familiarity + large design surface. TWF is a novel DSL; first-attempt errors on a complex design would be syntactic noise, not design feedback. The iteration loop is dominated by grammar discovery rather than design discovery.
- The fix from session 1 (Group 2) adds notation-reference as a prerequisite read. Session 3 surfaces a refinement: the calibration should also account for the *number of unfamiliar constructs* needed.

**Files touched:** `skills/design/SKILL.md` (design flow section)
**Change type:** `Internal`
**Parallelism:** Merge with Group 2 changes (same paragraph).

**Specific changes:**

Refine the Group 2 replacement to include a second calibration question:

> **Know the notation, then write before you read.** Two checks:
> 1. If you haven't written TWF before, read [notation-reference.md](./reference/notation-reference.md) once — keyword grammar, indentation scoping, close statements. That's the only prerequisite.
> 2. If the design requires constructs you haven't used before (promise, await one, condition flags, detach, update handlers with activities), scan [notation-examples.md](./reference/notation-examples.md) for those specific constructs.
>
> The goal: your first draft should produce *design* errors (wrong boundaries, missing patterns) rather than *syntax* errors (unknown keywords, malformed blocks). Then enter the core loop.

## Group 11: Timer Observation Pattern

**Findings:**
- Every timer example in the skill shows timers as control flow — the timer branch fails the workflow or redirects execution. There is no example where a timer fires and the workflow continues the same work with enriched metadata.
- The missing concept: timers as observation/data — a flag that enriches the eventual result rather than redirecting execution. This applies broadly to SLA monitoring, compliance deadlines, and escalation-without-cancellation.
- The pattern: start a timer as a promise, let it resolve as a flag, check it when assembling results. Distinct from `await one` which is always a race-with-cancellation.

**Files touched:** `skills/design/reference/notation-examples.md` (add example), possibly `skills/design/reference/anti-patterns.md`
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

1. Add a "Timer as Observation" subsection to the timer/async patterns area of `notation-examples.md`. Show the pattern:
   ```
   promise deadline <- timer(slaWindow)
   # ... sequential work continues unaffected ...
   activity DoWork(input) -> result
   # Check if deadline passed while work was running
   # (deadline promise may or may not have resolved)
   ```

2. Brief note distinguishing three timer uses: pure delay (`await timer`), termination race (`await one` with timer case that closes), and observation (promise timer as a flag). Keep it proportional — not a major new section, just a third category alongside existing patterns.

3. If it fits naturally, add an anti-pattern entry: "Using `await one` for deadlines where work must still complete." Show that `await one` cancels the losing branch, which is wrong when the work is non-cancellable. But don't over-index on this — include only if the anti-pattern is broadly reusable.

## Group 12: File Organization Guidance

**Findings:**
- The skill says nothing about file organization. Multi-file already works in the toolchain (resolver merges all files into a flat namespace). The decision is currently made by imitating whatever example is seen.
- The skill should lean toward multi-file as the default for non-trivial designs. Domain-grouped files (workflow + its primary activities together) align with natural design structure.

**Files touched:** `skills/design/SKILL.md` (brief note) or new `skills/design/reference/file-organization.md`
**Change type:** `Internal`
**Parallelism:** Independent of other groups.

**Specific changes:**

Add guidance (short section in SKILL.md or a brief reference file):
- Multi-file is the default for designs with more than ~2-3 workflows. Single-file is fine for small designs.
- Group by domain: a workflow and the activities it primarily calls belong in the same file. Shared activities (audit, notifications) go in a common file. Worker/namespace definitions go in a deployment file.
- All files pass together to `twf check` — no imports needed, flat namespace. File boundaries are for human comprehension, not for the resolver.

## Group 13: Entity/Process Spectrum in Pattern References

**Findings:**
- The pattern selection guidance treats entity and process as mutually exclusive categories. Complex domains (mortgage origination, insurance claims, employee onboarding) are hybrids — long-lived and reactive (entity-like) AND drive toward completion through phases (process-like).
- Acknowledging the spectrum prevents extended deliberation on "which pattern is this?" when the answer is "both."

**Files touched:** Wherever entity/process patterns are discussed (likely a patterns topic file or `reference/workflow-boundaries.md`)
**Change type:** `Internal`
**Parallelism:** Can be combined with Group 9 decomposition procedure work.

**Specific changes:**

1. Add a "Hybrid: Entity Shell + Process Phases" note to the pattern discussion. One sentence: "A hybrid that is long-lived and reactive but also drives toward completion through defined stages is typically an entity workflow (addressable by ID, handles signals/updates, may use continue-as-new) that internally orchestrates process phases as child workflows."

2. If a pattern selection flowchart or decision tree exists, add a branch: "Long-lived AND drives toward completion? → Hybrid pattern."
