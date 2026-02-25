# Skill Review: author-go

**Skill:** `skills/author-go`
**Goal (from README.md):** Translate a validated TWF design into correct, idiomatic Temporal Go SDK code.

**Overall assessment:** Strong bones — clear goal statement, well-organized reference index with on-demand navigation, and a coherent 5-layer generation process. Three systemic issues undermine the skill's effectiveness:

1. **SKILL.md carries too much inline execution detail** (~65% of content is reference-level process detail that competes with the reference files). The AI is pre-loaded with "how" rather than navigating to depth on demand.
2. **Reference files document mechanical mappings but omit decision criteria.** The AI can produce syntactically correct Go for *any* construct but has no guidance on choosing *which* construct to use. Missing "when" guidance at critical decision points (child workflow vs. activity, sync vs. async Nexus, struct vs. function registration) creates high risk of correct-but-wrong output.
3. **Several Go code examples contain subtly broken patterns** that an AI will copy verbatim — zero-value comparison predicates, swallowed errors, incorrect cancellation claims, discarded structured error values.

No standalone `.twf` example files exist — all DSL examples are inline in reference files. `twf check` is not applicable.

---

## Group 1: Top-Level Dilution — Slim SKILL.md to Process Skeleton ✓ COMPLETED

**Severity:** critical + moderate
**Theme:** SKILL.md carries reference-level content that belongs in reference files, duplicates its own guidance, and pre-loads execution detail rather than enabling on-demand navigation.

**Findings addressed:**

| Location | Lens | Severity | Finding |
|----------|------|----------|---------|
| SKILL.md:36-59 (Dependency Resolution) | 1 — Focus | critical | 24 lines of procedural detail + 9-line code example is reference-level content embedded at top level. Extract to `reference/dependency-resolution.md`, leave 1-2 line summary + pointer. |
| SKILL.md:110-119 (Activity Implementation Pattern) | 1 — Focus | moderate | 4-piece generation pattern is construct-level mapping detail. Fold into `reference/activity-def.md` or extract, leave pointer. |
| SKILL.md:69-97 (Generate + Verify) | 1 — Focus | moderate | Layers 1-4 mix process sequencing with inline execution guidance ("Use the dependency map to inform interface shapes"). Tighten to a sequence table with pointers to reference files. |
| SKILL.md:22 + 95 | 2 — Density | moderate | "Revising a previously confirmed decision..." appears verbatim in Core Principles and again in Layer 4. Remove the duplicate. |
| SKILL.md:22 + 99-106 | 2 — Density | moderate | "User as decision-maker" principle restated across Core Principles, "When to Ask the User" section, and Layer 4. Consolidate to one location. |
| SKILL.md overall | 1 — Focus | moderate | Goal-to-reference ratio is ~4% goal / 65% execution detail. The AI receives far more "how" than "what/why" on first read. |
| SKILL.md:74-81 | 2 — Density | minor | ASCII pipeline diagram + 5 "Layer N" paragraphs repeat identical information. Remove one. |
| SKILL.md:123-131 (Output Conventions) | 2 — Density | minor | Generic Go project layout advice ("Follow existing project conventions"). Low-signal filler. |
| SKILL.md:153 + 183 | 2 — Density | minor | `nexus.md` listed twice in Reference Index with identical construct and mapping. |
| SKILL.md:14 | 2 — Density | minor | 30-word hedging caveat on root-down principle. Tighten to "defer unknowns, revisit later." |
| SKILL.md:33 | 2 — Density | minor | "not an interrogation" is a tone hedge that adds no guidance. |
| SKILL.md:45 | 2 — Density | minor | Three sentences to say "resolve what you can; defer the rest." Already covered in Core Principles. |

**Files touched:** `skills/author-go/SKILL.md`, new `skills/author-go/reference/dependency-resolution.md` (optional — could merge into existing file)
**Change type:** Internal
**Parallelism:** Independent of all other groups.

---

## Group 2: Incorrect Code Examples — Fix Broken Patterns

**Severity:** critical + moderate
**Theme:** Several Go examples contain patterns that produce buggy code. An AI copying these verbatim will generate broken workflows.

**Findings addressed:**

| Location | Lens | Severity | Finding |
|----------|------|----------|---------|
| await-all.md:Go (lines 27-30) | 5 — Anti-patterns | critical | `workflow.Await` predicate compares structs to zero values to detect completion. Fails when zero value is a valid result; hangs if goroutine returns zero-value struct. Replace with `workflow.NewWaitGroup` pattern. |
| await-all.md:Notes (line 91) | 7 — Grounding | critical | WaitGroup described with hedging "if available in SDK version." `workflow.NewWaitGroup` is canonical and always available. Remove hedging, make WaitGroup the primary pattern. |
| await-one.md:Notes (line 119) | 7 — Grounding | critical | "Cancellation of losing cases is automatic" is incorrect. `Selector.Select` does not cancel anything. Losers must be explicitly cancelled via context. Fix the claim and show the cancellation pattern. |
| close.md:close fail | 5 — Anti-patterns | critical | `close fail(OrderResult{status: "cancelled"})` maps to `fmt.Errorf("cancelled")`, discarding the entire structured value. Should use `temporal.NewApplicationError` or `temporal.NewNonRetryableApplicationError` to preserve structured error data. |
| detach.md:Go (child workflow) | 5 — Anti-patterns | critical | Go example discards the `Future` from `ExecuteChildWorkflow` entirely. Even fire-and-forget children should check the start error. Show `GetChildWorkflowExecution().Get()` to confirm the child started. |
| await-one.md:Go (lines 17-35) | 5 — Anti-patterns | moderate | Primary example creates a `NewTimer` and signal in selector but never cancels the timer if signal wins. Timer leaks. Add cancellation via `cancelCtx`. |
| await-one.md:Case types (lines 57-63) | 5 — Anti-patterns | moderate | Multiple examples use `_ = f.Get(ctx, &result)` which swallows errors. Replace with proper error handling. |
| await-all.md:Notes (line 94) | 5 — Anti-patterns | moderate | Error propagation advice is "depends on workflow requirements" — too vague. Show concrete pattern (collect errors, or cancel siblings on first failure). |
| signal-handler.md:Go (line 25) | 5 — Anti-patterns | moderate | DSL `amount: decimal` mapped to Go `float64`. Known pitfall for financial values. Add note about alternatives (`shopspring/decimal`, integer cents). |

**Files touched:** `reference/await-all.md`, `reference/await-one.md`, `reference/close.md`, `reference/detach.md`, `reference/signal-handler.md`
**Change type:** Internal
**Parallelism:** Independent of all other groups. Each file can be fixed in parallel.

---

## Group 3: Missing Judgment Guidance — Add "When" Decision Criteria ✓ COMPLETED

**Severity:** critical + moderate
**Theme:** Reference files document *how* to map DSL constructs to Go but consistently omit *when* to choose between alternatives. These are the highest-risk gaps for confident-but-wrong output.

**Findings addressed:**

| Location | Lens | Severity | Finding |
|----------|------|----------|---------|
| workflow-call.md (whole file) | 4 — Judgment | critical | When to use child workflow vs. activity is undocumented. Trade-offs: event history size, independent retry/timeout, different task queue, separate cancellation scope. |
| nexus.md (whole file) | 4 — Judgment | critical | When to use Nexus vs. child workflow is undocumented. Primary use cases: cross-namespace communication, service boundary isolation, polyglot interop. |
| nexus-service-def.md:Sync operation handler | 4 — Judgment | critical | When to use sync vs. async (workflow-backed) operation is undocumented. This is the most consequential architectural decision in Nexus service generation. |
| worker.md:Notes bullet 3 | 4 — Judgment | critical | When to register activity struct (all methods) vs. individual functions. Struct is standard; individual needed when activities span multiple structs with different dependency sets. |
| control-flow.md:for (iteration) | 4 — Judgment | critical | `for` loop with `.Get()` inside is sequential. No guidance on when sequential is correct vs. when parallel fan-out (futures collected post-loop) was intended. |
| nexus-service-def.md:Service contract | 4 — Judgment | critical | Three-way mapping between DSL operation name, Go constant string, and Go workflow function name has no explicit decision rules. |
| options.md:full file | 4 — Judgment | moderate | No guidance on when `StartToCloseTimeout` vs `ScheduleToCloseTimeout` vs `WorkflowExecutionTimeout`. |
| detach.md:Notes | 4 — Judgment | moderate | No guidance on when to detach vs. await. Decision criteria (parent vs. child lifetime, result need) absent. |
| promise.md (whole file) | 4 — Judgment | moderate | No guidance on when to use promise (deferred `.Get`) vs. inline blocking call. |
| activity-call.md (whole file) | 4 — Judgment | moderate | When to use per-activity inline options vs. shared default `ActivityOptions` on context. |
| await-one.md (whole file) | 4 — Judgment | moderate | When to use `sel.Select` once vs. in a loop (event-driven workflows processing multiple signals over time). |
| close.md:close fail | 4 — Judgment | moderate | No mention of `temporal.ApplicationError` for structured, typed errors. No guidance on retryable vs. non-retryable. |
| signal-handler.md:Go (lines 31-37) | 4 — Judgment | moderate | One signal pattern shown (goroutine loop) without alternatives (blocking Receive inline, Selector.AddReceive). No decision criteria for choosing. |
| query-handler.md:Notes (line 27) | 4 — Judgment | moderate | Registration timing note says "early" but doesn't explain what goes wrong if late (query fails during replay before registration point). |
| assignment.md:Notes bullet 2 | 4 — Judgment | moderate | Closure scoping guidance names the *what* but not the *why* or failure mode (handler-local variable invisible to main flow). |

**Files touched:** `reference/workflow-call.md`, `reference/nexus.md`, `reference/nexus-service-def.md`, `reference/worker.md`, `reference/control-flow.md`, `reference/options.md`, `reference/detach.md`, `reference/promise.md`, `reference/activity-call.md`, `reference/await-one.md`, `reference/close.md`, `reference/signal-handler.md`, `reference/query-handler.md`, `reference/assignment.md`
**Change type:** Internal
**Parallelism:** Each file can be updated independently. High parallelism.

---

## Group 4: Missing Anti-Patterns — Document Runtime Safety Constraints ✓ COMPLETED

**Severity:** critical + moderate
**Theme:** Temporal's determinism constraints, cancellation semantics, and handler restrictions are largely absent. These are the failure modes an AI code generator will hit most often.

**Findings addressed:**

| Location | Lens | Severity | Finding |
|----------|------|----------|---------|
| signal-handler.md:Notes | 5 — Anti-patterns | critical | Signal drain before Continue-As-New/completion is undocumented. Per Temporal docs: signals will be lost if the channel is not drained asynchronously before CAN. Single most common signal-related bug. |
| query-handler.md:Notes | 5 — Anti-patterns | critical | Query handlers must not call blocking functions (`Channel.Get`, `Future.Get`, `workflow.NewChannel`, `workflow.Go`). Produces `QueryFailedError` at runtime. Undocumented. |
| update-handler.md:Go (lines 18-32) | 4 — Judgment | critical | Validator omission in example. Validators reject updates *before* History write. The example performs validation via activity *inside* handler (after acceptance). Significant semantic difference undocumented. |
| workflow-def.md:Notes | 5 — Anti-patterns | moderate | Determinism constraint entirely absent. No mention that `time.Now()`, `rand`, HTTP clients, goroutines are forbidden in workflow functions. |
| control-flow.md:if/else | 5 — Anti-patterns | moderate | No mention that condition expressions must be deterministic. |
| assignment.md (whole file) | 4 — Judgment | moderate | No mention that workflow variables must not be assigned from non-deterministic sources. |
| update-handler.md:Notes (line 43) | 5 — Anti-patterns | moderate | Incomplete constraint list. Missing: validators must not mutate state, long-running handlers risk blocking workflow on completion/CAN. |
| update-handler.md (whole file) | 5 — Anti-patterns | moderate | Continue-As-New interaction undocumented. Caller receives "workflow execution already completed" if CAN happens during handler execution. |
| query-handler.md (whole file) | 5 — Anti-patterns | moderate | Activities forbidden in query handlers ("can't perform async operations"). Produces confusing `QueryFailedError`. |
| activity-def.md:Notes | 5 — Anti-patterns | moderate | `context.Context` cancellation semantics undocumented. Failing to respect `ctx.Done()` in long-running activities means activity keeps running after Temporal timeout. |
| workflow-call.md (whole file) | 5 — Anti-patterns | moderate | Default `ParentClosePolicy` is `TERMINATE` — parent failure kills child. Non-obvious default. |
| workflow-call.md (whole file) | 5 — Anti-patterns | moderate | If parent completes before `ChildWorkflowExecutionStarted` event, child never spawns. Critical for fire-and-forget patterns. |
| worker.md:Go example | 5 — Anti-patterns | moderate | Mismatched type registrations across workers on same task queue produce runtime failures with non-obvious errors. |
| await-timer.md (whole file) | 5 — Anti-patterns | moderate | `workflow.Sleep` returns `CanceledError` on context cancellation. Treating this as generic failure prevents clean workflow cancellation. |
| condition.md (whole file) | 5 — Anti-patterns | moderate | `workflow.Await` blocks indefinitely if condition is never set. Common logic-bug failure mode. |
| control-flow.md:for (conditional) | 5 — Anti-patterns | moderate | Manual retry loop pattern is almost always inferior to SDK `RetryPolicy`. Should warn this is an escape hatch, not a default. |
| options.md | 5 — Anti-patterns | moderate | No warning against common retry mistakes (`MaximumAttempts: 1` disables retries, `BackoffCoefficient: 1.0` produces fixed intervals). |
| activity-call.md (whole file) | 5 — Anti-patterns | moderate | `ActivityOptions` requires at least one of `StartToCloseTimeout` or `ScheduleToCloseTimeout`. Omitting both is a runtime error. |
| heartbeat.md:Go example | 5 — Anti-patterns | moderate | Resume pattern (`GetHeartbeatDetails` at activity start) not shown. Heartbeat recording without resume logic is incomplete. |

**Files touched:** `reference/signal-handler.md`, `reference/query-handler.md`, `reference/update-handler.md`, `reference/workflow-def.md`, `reference/control-flow.md`, `reference/assignment.md`, `reference/activity-def.md`, `reference/workflow-call.md`, `reference/worker.md`, `reference/await-timer.md`, `reference/condition.md`, `reference/options.md`, `reference/activity-call.md`, `reference/heartbeat.md`
**Change type:** Internal
**Parallelism:** Each file can be updated independently. High parallelism. Some files overlap with Group 3 — execute Group 3 findings for a file alongside Group 4 findings for the same file.

---

## Group 5: Ungrounded SDK Patterns — Verify and Correct

**Severity:** critical + moderate
**Theme:** Several files make claims about SDK behavior without citations, some of which are inaccurate. An AI consumer cannot distinguish authoritative guidance from incorrect assertions.

**Findings addressed:**

| Location | Lens | Severity | Finding |
|----------|------|----------|---------|
| promise.md:Variants (lines 42-48) | 5 — Anti-patterns | critical | Signal variant uses `promise` framing but `ReceiveChannel` is not a `Future`. AI may attempt `.Get()` on a channel. The asymmetry needs explicit callout. |
| types.md:Dependency types step 2 | 7 — Grounding | critical | Strategy assumes `go doc` is available. No fallback when dependency isn't in `go.mod` or docs are sparse. |
| update-handler.md:Notes (line 40) | 7 — Grounding | moderate | Claims `workflow.Context` as first param is required. SDK docs say it is optional (though required for calling activities/primitives). |
| condition.md:Notes (line 40) | 7 — Grounding | moderate | Claims conditions in `await one:` use `workflow.AwaitWithTimeout`. This doesn't produce something compatible with `Selector`. Inconsistent with `await-one.md` which shows the correct goroutine+channel pattern. |
| promise.md:Notes (line 65) | 7 — Grounding | moderate | Claims Nexus uses "same `.Get` pattern" but `NexusOperationFuture` has additional `GetNexusOperationExecution()` method. |
| nexus-service-def.md:Async operation handler | 7 — Grounding | moderate | `NewWorkflowRunOperation` example returns empty `StartWorkflowOptions{}`. SDK samples recommend business-meaningful Workflow ID for deduplication. |
| nexus.md:Go example (line 14) | 7 — Grounding | moderate | Operation name as bare string `"ProcessPayment"`. SDK also accepts typed `nexus.Operation`/`nexus.OperationReference[I, O]` for compile-time safety. Connection to `nexus-service-def.md` constants never drawn. |
| signal-handler.md:Go (line 31) | 7 — Grounding | moderate | Goroutine-with-loop pattern shown as sole approach. SDK samples commonly use Selector-based signal handling. No grounding citation for the chosen pattern. |
| types.md:Dependency types example | 7 — Grounding | moderate | `anthropic.MessageNewParams` example is version-specific. No version pin or verification step noted. |
| heartbeat.md:Notes | 7 — Grounding | moderate | No mention that `RecordHeartbeat` is SDK-throttled (sent at 80% of HeartbeatTimeout). AI may add unnecessary batching. |
| detach.md:Go (nexus) | 7 — Grounding | moderate | Nexus fire-and-forget by omitting `.Get()` — whether this is a supported SDK pattern is not cited. |

**Files touched:** `reference/promise.md`, `reference/types.md`, `reference/update-handler.md`, `reference/condition.md`, `reference/nexus-service-def.md`, `reference/nexus.md`, `reference/signal-handler.md`, `reference/heartbeat.md`, `reference/detach.md`
**Change type:** Internal
**Parallelism:** Each verification is independent. Consult Temporal docs MCP for each correction.

---

## Group 6: Density Refinements — Tighten, Remove, or Consolidate

**Severity:** minor
**Theme:** Redundancies, thin content, missing imports, and low-value notes that consume context budget without guiding the AI.

**Findings addressed:**

| Location | Lens | Severity | Finding |
|----------|------|----------|---------|
| workflow-def.md:Notes bullets 1+3 | 2 — Density | minor | Two bullets state the same fact about `error` return. Remove the subset. |
| workflow-def.md:Go example | 7 — Grounding | minor | Missing import for `"go.temporal.io/sdk/workflow"`. Inconsistent with nexus-service-def.md which includes imports. |
| activity-def.md:Notes bullet 5 | 2 — Density | minor | Parenthetical restates struct-method pattern already primary in SKILL.md. |
| worker.md:Notes bullet 5 | 2 — Density | minor | Multiple workers fact lacks triggering condition (multiple `worker` blocks in DSL). |
| worker.md:Notes | 7 — Grounding | minor | Missing import paths. Inconsistent with nexus-service-def.md. |
| nexus-service-def.md:Registration | 5 — Anti-patterns | minor | `RegisterWorkflow` call for handler workflow buried in trailing comment. Should be prominent. |
| workflow-call.md (whole file) | 2 — Density | moderate | Entire file is 25 lines. Nearly derivable from activity-call.md by substitution. Thin on child-workflow-specific content. |
| assignment.md (whole file) | 2 — Density | minor | 25 lines with two trivial string assignments. No non-trivial cases (struct, slice, map). |
| options.md:Notes bullet 3 | 2 — Density | minor | Key-mapping note restates casing transformation already evident from examples. |
| heartbeat.md:Notes bullet 5 | 2 — Density | minor | Forward reference to activity-def.md defers structural decision, leaving file incomplete as standalone reference. |
| types.md:Primitive mapping | 2 — Density | minor | Missing `time`/`duration` type mappings that appear frequently in options.md. |
| await-one.md:Notes (line 122) | 2 — Density | minor | Nested `await all` in `await one` described in one sentence without code example. Too compressed for the complexity. |
| await-one.md:Case types (lines 95-113) | 2 — Density | minor | Future promise and condition promise conflated under one heading despite fundamentally different patterns. |

**Files touched:** `reference/workflow-def.md`, `reference/activity-def.md`, `reference/worker.md`, `reference/nexus-service-def.md`, `reference/workflow-call.md`, `reference/assignment.md`, `reference/options.md`, `reference/heartbeat.md`, `reference/types.md`, `reference/await-one.md`
**Change type:** Internal
**Parallelism:** All independent. Low priority — address after Groups 1-5.
