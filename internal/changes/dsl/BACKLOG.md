# DSL Backlog

Unimplemented features and design ideas. Not committed to any cycle — just a place to drop thoughts.

---

## Statement Recognition

### Meaningful Statements Hidden in `raw` (leading priority)

A bare statement like `x = ActName(args)` parses as `raw` pseudocode text, not as a structured `activityCall`/`workflowCall`. The call exists in the author's intent but never appears in the AST — so a real, used activity looks uncalled, every downstream consumer (validator, graph, visualizer) misses the edge, and `twf check` reports clean. This was the leading silent-failure in `REFLECTION_DESIGN.md` (8 activities with no structured call site).

```twf
# Parses as raw text today — the call to ProcessData is invisible:
workflow Pipeline(input: Input) -> (Result):
    x = ProcessData(input)        # intended: activity ProcessData
    close complete(Result{x})
```

**The fix (be thoughtful about which raw statements we promote/flag):** when a raw statement appears in an **orchestration context** (a workflow body, not a free-form activity body) and its call target **resolves to a defined `activity`/`workflow`/`nexus` symbol**, it is almost certainly a miswritten structured call. Lean toward **diagnosing** ("`x = ProcessData(args)` looks like a call to activity `ProcessData` — use `activity ProcessData(args) -> x`") rather than silently reinterpreting, because a bare `x = F(args)` drops the `activity`/`workflow`/`nexus` keyword that encodes *which* Temporal primitive it is — the parser can't safely guess.

**Scope boundary:** activity bodies are intentionally free-form pseudocode (`x = transform(y)` is just code there). The disambiguation must key on *context + symbol resolution*, never promote raw statements blanket-style.

**Related:** Consider whether to make a binding call form first-class (`result = activity Foo(args)` / `x = activity Foo(args)`) so the natural assignment syntax is legal-and-structured instead of swallowed as raw.

**Open questions:** Diagnose-only, or offer an auto-fix? Does a resolvable raw call in a workflow body become a hard error, a warning, or a structured node? Should the binding call form be added? What about raw statements whose target is *not yet defined* (typo) — those fall to the unused-definition check (see `internal/changes/parser/BACKLOG.md`) as a backstop.

---

## Naming Conventions

### UpperCamelCase for All Top-Level Primitives

Worker type set names and namespace names currently use lowerCamelCase, while workflows/activities use UpperCamelCase. All top-level definitions should consistently use UpperCamelCase.

```twf
# Current:
worker orderTypes:
namespace orders:

# Proposed:
worker OrderTypes:
namespace Orders:
```

**Why deferred:** Requires updating all existing examples, test data, topic files, and the spec. Should be done as a standalone cleanup.

---

## Nexus Extensions

### List Workflows in Sync Operations

Sync nexus operation handlers can list/query workflows as part of their implementation. No current syntax for representing a "list workflows" primitive in the DSL.

```twf
nexus service OrderService:
    sync ListActiveOrders(filter: Filter) -> (OrderList):
        list ProcessOrder(filter) -> orders
        close complete(orders)
```

**Open questions:** What does the syntax look like? `list WorkflowType(filter)` as a primitive? How does it relate to Temporal's visibility/list APIs? Is this a workflow-body primitive or nexus-operation-only?

---

## Workflow Semantics

### Signal/Query/Update Send Statements

Explicit DSL syntax for sending signals, queries, and updates to other workflows. Currently the DSL declares handlers on the receiving side but has no way to express the send side.

```twf
workflow OrderSaga(order: Order) -> (Result):
    workflow ProcessPayment(order) -> payment

    # Signal a running workflow
    signal ProcessPayment.PaymentReceived(payment)

    # Query a running workflow
    query ProcessPayment.Status() -> status

    # Update a running workflow
    update ProcessPayment.AdjustAmount(newAmount) -> confirmation
```

**Why needed:** The visualizer's graph view models dependency edges between workflows. Currently only call/await edges exist. Signal/query/update sends create real dependencies — "WorkflowB sends a signal to WorkflowA" — but these are invisible without send-side data in the AST. Adding typed send statements would enable message flow edges in the graph view.

**Open questions:** What is the syntax? `signal TargetWorkflow.HandlerName(args)` vs `send signal HandlerName to TargetWorkflow(args)`? Should sends target a specific workflow instance (by ID) or a workflow type? How does the resolver validate that the target workflow actually handles the named signal/query/update? Should sends appear as statements (in workflow body) or as part of await expressions?

**Reachability nuance (from `REFLECTION_DESIGN.md`):** Signal/query/update handlers — and workflows started out-of-band (external clients, schedules, Nexus operations) — look like dead code to any reachability / unused-definition check, because their trigger is invisible to the DSL. Send-side syntax makes *intra-design* sends visible as dependency edges (so a handler targeted by another workflow in the same design is no longer "uncalled"), but *external* triggers still will not be. Any future reachability checker must therefore treat handler-bearing and entry-annotated workflows (see Entry Point Annotation) as roots rather than flagging them as unreachable.

**Cancellation send (pair with this item):** the same send-side gap applies to **cancelling** another workflow — a parent cancelling a runaway child, or pausing across a Nexus boundary. In the Comparanda design `AgenticTask.Cancel` and `Pause/Resume` can only be triggered by an external client as drawn, because a workflow has no way to *send* a cancel/pause. A cancel-send primitive (e.g. `cancel ChildWorkflow` / `signal Target.Pause()`) belongs here alongside the signal/query/update sends. This is distinct from the *receive* side (see Workflow Cancellation Handler).

---

### Workflow Cancellation Handler

`await one:` documents auto-cancellation of race losers, but there's no way to express what happens when an *entire workflow* is cancelled externally.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    on_cancel:
        activity RefundPayment(order)
        activity NotifyCustomer(order, "cancelled")

    activity ChargePayment(order) -> payment
    activity FulfillOrder(order) -> fulfillment
    close Result{payment, fulfillment}
```

**Why needed:** Cancellation is a first-class Temporal concept. Cleanup/compensation on cancel is a common pattern with no current TWF representation.

**Scope — this is the *receive* side.** This item is the handler: what a workflow does when it is cancelled (`on_cancel:`). The *send* side — one workflow cancelling/pausing another — is a separate item, paired with Signal/Query/Update Send Statements above. Keep them distinct.

### Async Activity Completion

Activity that starts, then completes from an external system (human approval, webhook callback). Referenced in activities-advanced.md topic but no language syntax.

```twf
activity RequestApproval(order: Order) -> (Approval):
    async_complete
    send_approval_request(order)
```

**Why needed:** Common pattern for human-in-the-loop workflows. `heartbeat` has syntax; `async_complete` does not.

### Explicit Type Definitions

Types are bare identifiers — no `type Foo: ...` struct syntax. Type structure only exists in implementation code.

```twf
# Can't do this:
type OrderResult:
    status: string
    total: decimal
    items: Item[]

# Must do this:
workflow ProcessOrder(order: Order) -> (OrderResult):
    # OrderResult structure lives in implementation
```

**Impact:** No single source of truth for data structures at design time. Can't validate field names/types.

**Trade-off:** Adding types moves the DSL toward a full IDL. May conflict with "skeleton, not meat" principle — or may be exactly what's needed for design clarity.

### SDK Built-in Functions / Workflow Metadata for Control Flow

Deterministic SDK utilities like `workflow.history_length()` / `workflow.history_size()` have no formal syntax. Currently shown as raw expressions in examples.

```twf
# Used in practice but not formalized:
historyBytes = sdk.HistorySize()
if (historyBytes > 40_000_000):
    continue_as_new(data)
```

**Why this matters (from `REFLECTION_DESIGN.md`):** The "should this loop `continue_as_new`?" decision essentially reduces to *the DSL has no way to read workflow metadata (history length/size, iteration count, run age) and branch on it*. Without intrinsics for that metadata, a design can express `close continue_as_new(...)` but cannot express the **condition** that should trigger it — so the continue-as-new *strategy* stays implicit, which is exactly the silent gap the reflection flagged on `AgenticTask`. Formalizing a small set of read-only, deterministic workflow-metadata intrinsics would let designs express *selective* continue-as-new control flow rather than leaving the trigger to prose or to the author skill.

**Open questions:** Should the DSL formalize a set of SDK intrinsics (history size/length, run count, info)? A namespaced `sdk.*` / `workflow.*` form, or first-class keywords? Which are deterministic-and-safe to expose vs implementation details that belong in `raw_stmt`? How does this interact with expression-based conditions (above)?

### Workflow ID Call Option

`workflow_id` as a workflow call option for specifying deterministic workflow IDs at call sites. This is a core Temporal SDK pattern (e.g., deriving a child workflow ID from a business entity) but is not currently in the allowed workflow call options.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    workflow ShipOrder(order) -> shipment
        options:
            workflow_id: "ship-order-" + order.id
            parent_close_policy: TERMINATE

    # Idempotent fan-out via deterministic IDs
    for (item in order.items):
        workflow ProcessItem(item)
            options:
                workflow_id: "process-item-" + item.id
                workflow_id_reuse_policy: ALLOW_DUPLICATE_FAILED_ONLY
```

**Why deferred:** The concept is already used in topic docs (child-workflows.md shows `workflow_id` in options blocks), but the allowed workflow call options list does not include it. Adding it requires deciding whether the value is a plain string, a template expression (`"order-{order.id}"`), or a concatenation expression (`"order-" + order.id`) — which ties into the broader question of expression syntax in option values. The current `value` grammar (`STRING | DURATION | NUMBER | IDENT`) has no expression support.

**Open questions:** Should `workflow_id` values support string interpolation, concatenation expressions, or just static strings? Should `workflow_id_reuse_policy` also be added? How does this interact with the resolver — should it warn on non-unique IDs inside loops?

---

## Deployment Topology

### Worker Indirection / Definition Reuse

A worker is currently instantiated by name in at most one namespace block. A reuse extension would let a single worker type set be instantiated in multiple namespaces on different task queues.

```twf
worker paymentWorker:
    activity ChargePayment
    nexus service PaymentService

namespace ecommerce-us:
    worker paymentWorker
        options:
            task_queue: "payments-us"

namespace ecommerce-eu:
    worker paymentWorker
        options:
            task_queue: "payments-eu"
```

**Why deferred:** The two-region case is already expressible by declaring two separate workers with identical bodies. Reuse would be more elegant, but requires the parser/resolver to treat a worker definition as a *template* rather than a deployment, and requires the graph package to enumerate per-namespace worker deployment nodes instead of one node per definition.

**Why needed:** Reduces duplication for multi-region / multi-environment deployments where the same code runs on multiple task queues with different routing.

**Open questions:** Does instantiating the same worker in two namespaces imply two distinct deployments, or one logical worker? Should options blocks per-instantiation override worker-level defaults? How does the graph view distinguish the two deployments visually?

---

### Codec Server / Payload Codec Configuration

A way to declare that a worker (or namespace) uses a **payload codec / data converter** — the standard mechanism for transparently offloading large payloads (claim-check), compressing, or encrypting them. Today the DSL has no representation of codec configuration at all; large-payload handling is invisible in `.twf`.

```twf
# Illustrative only — syntax TBD
worker ExtractionWorker:
    codec: claim-check        # offload large payloads to external store
    activity RunExtraction
```

**Why needed:** The design skill is being revised to make "defer large payloads to the codec server" the default answer (see `design-skill/REVISIONS_003.md`). If that's the blessed pattern, the DSL should be able to *say* a codec is in play, so the decision is visible rather than implied.

**Key challenge — codecs are worker-level, calls cross workers.** A payload codec is configured on the **data converter at the worker level**. But a workflow on worker A frequently calls an activity or child workflow that runs on worker B (different task queue, namespace, or across a Nexus boundary). The encoded payload produced under A's codec must be **decodable by B's codec** — if B isn't configured with a compatible codec, it gets an opaque/encrypted blob it can't read. So the hard part isn't representing the codec; it's **validating cross-worker codec compatibility**: every deployment on the receiving end of a dispatch edge must share (or be able to decode) the sender's codec. This is a routing-style check analogous to the existing task-queue routing validation, but over codec configuration rather than queues.

**Open questions:** Codec config at worker level, namespace level, or both? Is it an enum of known strategies (`claim-check`, `compression`, `encryption`) or freeform? Should the resolver/validator check codec compatibility across every dispatch edge (the graph already has the edges)? How does it interact with Nexus, where the target namespace is owned by another team and may have an entirely independent codec? Does this stay design-time intent only, or feed codegen?

## Syntax Extensions

### Bare Promise Declaration

Declare a promise without immediate `<-` binding.

```twf
promise myPromise
# ... later assign it
myPromise <- activity ProcessItem(input)
```

**Why deferred:** No clear use case. `promise p <- ...` covers all known patterns.

### Condition Declarations Outside `state:`

Allow `condition` directly in workflow body without `state:` block.

```twf
workflow Example():
    condition ready
    activity Setup() -> config
    set ready
```

**Why deferred:** `state:` block provides clear separation between declarations and execution. Conditions anywhere complicates parsing and readability.

### Expression-Based Conditions

Arbitrary boolean expressions as await targets, not just named conditions.

```twf
await condition (balance > threshold and not suspended)
```

**Why deferred:** Requires the DSL to understand expression evaluation, conflicting with "skeleton, not meat" principle. Named conditions achieve the same thing with explicit state management.

### SDK Language Specification

Optional declaration of which Temporal SDK language a worker, workflow, activity, or other definition targets.

```twf
# At the worker level — applies to all contained definitions
worker OrderTypes (go):
    workflow ProcessOrder
    activity ChargePayment

# At the individual definition level
workflow ProcessOrder(order: Order) -> (Result) (go):
    activity ChargePayment(order) -> payment
    activity RunFraudModel(order) -> score (python)
    activity NotifyCustomer(order, payment) (typescript)

# At the namespace level
namespace Orders (go):
    workflow ProcessOrder
```

**Why needed:** Polyglot Temporal deployments are common — a Go workflow may call Python ML activities and TypeScript frontend services. Making the SDK language first-class enables design-time intent, code generation targeting the correct SDK, ownership boundaries, and better onboarding context.

**Open questions:** Fixed enum (`go`, `python`, `typescript`, `java`, `dotnet`, `php`) or freeform? Should a parent declaration propagate as a default to children? How does it interact with Nexus boundaries? How does this relate to `@lang` annotations — should both exist, or should one replace the other?

### Local Activity Option

`local: true` option on activity calls to route execution to the local worker, avoiding the task queue round-trip.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    # Local activity: runs in-process on the same worker
    activity ValidateInput(order) -> validated
        options:
            local: true
            start_to_close_timeout: 5s

    # Local activity with retry threshold
    activity EnrichData(validated) -> enriched
        options:
            local: true
            start_to_close_timeout: 10s
            local_retry_threshold: 5s
            retry_policy:
                maximum_attempts: 3
                initial_interval: 100ms

    # Regular activity: goes through task queue as normal
    activity ChargePayment(enriched) -> payment
        options:
            start_to_close_timeout: 60s
```

**Why deferred:** Local activities are an SDK-level execution optimization, not a workflow design concern. TWF's "skeleton, not meat" principle suggests this may be too implementation-specific. However, the choice has design implications — local activities should be short, deterministic, and avoid network calls.

**Open questions:** Boolean option or modifier keyword (`local activity ValidateInput(...)`)? Does `local: true` conflict with an explicit `task_queue` option? Should `local_retry_threshold` and `schedule_to_close_timeout` (which local activities do not support) be validated contextually?

### Non-Retryable Error Types List Syntax

`non_retryable_error_types` is in the grammar spec as a valid retry policy key, but the option value grammar (`value ::= STRING | DURATION | NUMBER | IDENT`) has no list literal type.

```twf
activity ChargePayment(order: Order) -> (Payment):
    options:
        start_to_close_timeout: 60s
        retry_policy:
            maximum_attempts: 5
            initial_interval: 1s
            non_retryable_error_types: ["InvalidInput", "NotFound", "Unauthorized"]
```

**Why deferred:** Adding list literals requires changes across the entire parser pipeline: lexer needs `[` and `]` tokens, AST needs a list value node type, parser needs a list production rule, resolver needs to validate that `non_retryable_error_types` accepts a list of strings.

**Open questions:** General-purpose list syntax (`value ::= ... | list_value`) or restricted to specific option keys? Could an alternative syntax avoid brackets entirely (multi-line list under the key, one entry per line)?

### Dynamic Multi-Await / Async Result Aggregation (umbrella)

General capability: spawn a dynamic (data-driven) set of async operations and **collect their results back into a value** the rest of the workflow can use. Today `await all:` / `await one:` take *static* cases, and a `for (x in xs)` fan-out leaves each `-> result` binding trapped per-iteration — there is no aggregate binding, no accumulate-across-iterations, no dynamic promise set. This umbrella covers the family; the two entries below are specific cuts of it.

```twf
# Wanted: result-bearing fan-out
await all (x in xs):
    workflow F(x) -> r        # collects [r] -> results
```

**Why needed (from `REFLECTION_DESIGN.md` / `twf-language-limitations.md`):** the absence of fan-in is not just missing sugar — it actively invites bugs, because the language gives *no syntactic signal that an `await all` left results unbound*. Two real dropped-result bugs in the Comparanda design (`phase0.twf:39`, `comparanda.twf:114`) trace directly to this. The workaround is to have children write to a blob store and a `Collect*` activity read them back — fan-in done manually and invisibly.

**Lowest-bound win:** even without new aggregation syntax, a resolver **warning** ("`await all` block produces results that are never bound") would have caught both bugs.

**Specific cuts (below):** *Promise Composition* = dynamic promise collection; *Completion-Order Promise Iteration* = yielding results as each completes. This umbrella adds the most basic case: a **static `await all` + `for` with an aggregate result binding**, plus the unbound-results warning.

**Open questions:** One unifying construct or several? `await all (x in xs): … -> results` aggregate-binding form, `await all promises -> results`, and `for await` completion-order — same feature or distinct? Is the unbound-results warning worth shipping ahead of any syntax?

### Promise Composition

Dynamic promise collection for batch awaiting.

```twf
promises = []
for (item in items):
    promise p <- activity Process(item)
    promises.append(p)

await all promises -> results
```

**Why deferred:** `await all:` with inline operations covers most parallel patterns. Dynamic collection adds significant type system and resolver complexity.

### Completion-Order Promise Iteration

Iterate over a set of promises, yielding results in completion order (not declaration order).

```twf
# Spawn N children in parallel
for (entry in manifest.entries):
    promise entry.child <- workflow ProcessComponent(entry.component)

# Process results as each child completes (completion order, not spawn order)
for await (result in manifest.entries):
    activity CommitResult(result)
```

**Why needed:** The `await all:` block is all-or-nothing. Sequential `await p` blocks in declaration order. `await one:` requires static cases and cancels non-winners. There is no construct for "yield the next completion from a dynamic set of pending promises."

**Analogues:** JavaScript `Promise.race` in a shrinking-set loop, Go `select` over channels, Python `asyncio.as_completed()`.

**Open questions:** Iteration target — named collection of promises, or inline declarations? `for await` (new keyword combination) or `await each`? How does the resolver track the shrinking set? What happens if one promise fails?

**Discovered during:** Design of `internal/orchestrator/dev-cycle.twf`.

---

## Annotations

### Language Annotations

Declare what implementation language a workflow, activity, or block should be written in.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    @lang("go")
    activity ChargePayment(order) -> payment

    @lang("python")
    activity RunFraudModel(order) -> score

    @lang("typescript")
    activity NotifyCustomer(order, payment)
```

**Why needed:** Polyglot Temporal deployments are common. Language annotations make this explicit at design time, enabling code generation targeting the correct SDK, clearer ownership boundaries, and better onboarding context.

**Open questions:** Apply at block level or also at file level as a default? Fixed enum or freeform? How does it interact with the SDK Language Specification syntax extension above — should both exist, or should one replace the other?

### Entry Point Annotation

A way to mark a workflow as an intended top-level entry point — one started by an external client, schedule, or operator rather than called by another workflow in the design.

```twf
@entry
workflow Comparanda(config: Config) -> (Result):
    ...
```

**Why needed:** Without a declared entry point, tooling fundamentally cannot distinguish a legitimate top-level workflow from leftover/dead code, and cannot compute reachability at all — a graph walk needs roots to start from. This is the **prerequisite** for any dead-workflow / unused-definition / reachability check (see Design Quality Linting below). It also keeps the future reachability analysis honest: workflows reached only via signals, Nexus operations, or other out-of-band triggers (see the reachability nuance under Signal/Query/Update Send Statements) are roots too, not unreachable code.

**Leading motivation (from `REFLECTION_DESIGN.md`):** In the Comparanda design, `Comparanda` was the real top-level entry, but the validator had no way to tell it apart from leftover workflows — so neither dead-code detection nor "is everything reachable" could be offered. The current `checkCoverage` validator pass only checks *worker registration* coverage (and only when namespaces are declared); it does not check whether a definition is ever *called* or *reachable*.

**Open questions:** Annotation (`@entry`) vs keyword (`entry workflow Foo`)? Should Nexus-operation-backing workflows and handler-bearing workflows be *implicit* entries, or require explicit marking? Distinguish client-started vs schedule-started entries? Can a file legitimately have zero entries (a library of reusable building blocks) without warnings — i.e. is the reachability check opt-in once any `@entry` exists?

### Reference Annotations

Point to where an existing implementation lives in the codebase.

```twf
workflow ProcessOrder(order: Order) -> (Result):
    @ref("order-service/workflows/process_order.go:17")
    activity ChargePayment(order) -> payment

@ref("payments/activities/charge.go")
activity ChargePayment(order: Order) -> (Payment):
    heartbeat 30s
    options:
        start_to_close_timeout: 60s
```

**Why needed:** As a design DSL, TWF captures intent — but teams also need to find the real code. Reference annotations close that loop, making `.twf` files a living index of the project. LSP go-to-definition could resolve `@ref` paths to open the actual source file.

**Open questions:** Paths relative to repo root, or allow URLs for multi-repo setups? Should the LSP validate that `@ref` targets exist? Could references be auto-populated by scanning the codebase for matching workflow/activity registrations?

---

## Design Quality Linting

### `twf lint` Command

A design-quality pass beyond syntax/resolution validation (`twf check`) to catch common anti-patterns and missing considerations.

**Potential checks:**

| Check | Category | Description |
|-------|----------|-------------|
| Unbounded loops | History | `for:` without `continue_as_new` — history grows forever |
| Missing continue-as-new | History | Signal-driven loops with no history reset strategy |
| Missing error handling | Resilience | Activities with no timeout/retry configuration |
| Signal vs update choice | Design | Signal used where update semantics seem more appropriate |
| Unbounded tool/retry loops | Safety | Loops calling activities with no iteration bound |
| Missing queries | Observability | Stateful workflow with no query handlers for inspection |
| Large activity fan-out | Performance | Many parallel activities without task queue routing |
| Sequential child workflow loop | Performance | `for` loop with synchronous child workflow calls — usually should be parallel |
| Blocking update handler | UX | Update handler calls child workflow or long-running activity — caller blocks for entire duration |
| Fallback-path history growth | History | Workflow is short-lived on happy path but enters unbounded wait loop on fallback without continue-as-new |

**Why difficult:** TWF is intentionally high-level. Many checks require understanding *intent*, not just structure.

**Possible approach:** Advisory warnings (not errors) with suppression comments:
```twf
# twf:lint-ignore unbounded-loop
for:
    await signal Event -> event
    activity ProcessEvent(event)
```

**Open questions:** Configurable per-project? Run as part of `twf check` with `--strict`, or separate command? How to avoid false positives on intentionally simple designs?
