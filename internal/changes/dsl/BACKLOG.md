# DSL Backlog

Unimplemented features and design ideas. Not committed to any cycle — just a place to drop thoughts.

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

### SDK Built-in Functions

Deterministic SDK utilities like `workflow.history_length()` have no formal syntax. Currently shown as raw expressions in examples.

```twf
# Used in practice but not formalized:
historyBytes = sdk.HistorySize()
if (historyBytes > 40_000_000):
    continue_as_new(data)
```

**Open questions:** Should the DSL formalize a set of SDK intrinsics? Or are these implementation details that belong in `raw_stmt`?

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
