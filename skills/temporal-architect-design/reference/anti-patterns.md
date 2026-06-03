# Common Anti-Patterns

> **Re-check pass (required).** This catalog is not just reference — during the [Design Review](../SKILL.md#design-review), walk the *finished* design against **every** anti-pattern below and confirm none apply. Designs drift into these shapes by copying prior work uncritically; pattern-matching against a catalog of bad shapes is exactly what this pass is for. The checklist line is: "Design re-checked against every anti-pattern in `anti-patterns.md`."

## Structural

### Unbounded History

A workflow that runs indefinitely without resetting accumulates unbounded event history, eventually degrading performance.

```twf
# BAD: Infinite loop with no history reset
# workflow EventProcessor(config: Config):
#     for:
#         activity PollEvents(config) -> events
#         activity ProcessBatch(events)

# GOOD: Continue-as-new resets history periodically
workflow EventProcessor(config: Config):
    state:
        condition shutdownRequested
    signal Shutdown():
        set shutdownRequested
    for:
        if (shutdownRequested):
            close complete
        activity PollEvents(config) -> events
        activity ProcessBatch(events)
        close continue_as_new(config)

activity PollEvents(config: Config) -> (Events):
    return poll(config)

activity ProcessBatch(events: Events):
    process(events)
```

**Why:** Temporal stores every event in workflow history. Long-running workflows without `close continue_as_new` grow history without bound, causing slow replays and eventual failure. See [long-running.md](../topics/long-running.md).

> **Bounded is not automatically safe.** The rule is not "infinite loops need `continue_as_new`" — it's "**loops whose accumulated history is large need `continue_as_new`; a bound alone is not sufficient.**" A loop with an internal bound (e.g. `for` over 40 iterations) still grows history linearly, and if per-iteration history is chunky (a large `LlmCall` result plus N tool calls each iteration) or the bound is high, it can blow the limit before finishing. State the strategy explicitly in the design — "bounded at N, per-iteration history small, no `continue_as_new`" or "resets every K iterations" — rather than leaving it silent.

### Wrapper Workflow

A child workflow containing a single activity call adds orchestration overhead with no benefit.

```pseudo
# BAD: Unnecessary child workflow wrapper
workflow Parent():
    workflow SendEmailWorkflow(to, body)

workflow SendEmailWorkflow(to, body):
    activity SendEmail(to, body)
    close complete

# GOOD: Call the activity directly
workflow Parent():
    activity SendEmail(to, body)
```

**Why:** Child workflows create separate history, require their own task queue routing, and add latency. Use them only when you need independent retry policies, a separate failure boundary, or multi-step orchestration.

### Monolithic Workflow

All business logic in a single workflow with dozens of sequential steps.

```pseudo
# BAD: One workflow doing everything
workflow ProcessOrder(order):
    activity Validate(order)
    activity CheckInventory(order)
    activity ReserveInventory(order)
    activity ChargePayment(order)
    activity CreateShipment(order)
    activity NotifyWarehouse(order)
    activity UpdateCRM(order)
    activity SendConfirmation(order)
    activity ScheduleFollowUp(order)
    # ... 20 more steps

# GOOD: Decompose into child workflows with clear boundaries
workflow ProcessOrder(order):
    activity ValidateOrder(order) -> validated
    workflow FulfillOrder(validated) -> fulfillment
    workflow NotifyStakeholders(order, fulfillment)
    close complete(OrderResult{fulfillment})
```

**Why:** Large workflows have large histories (slow replay), make failure recovery coarse-grained (one failure may require re-running unrelated steps), and are hard to test. Decompose when a group of steps has its own lifecycle, retry needs, or failure boundary.

### Large Payloads in Workflow State

Storing large data (files, full database results, images) in workflow variables or signal/update payloads.

```pseudo
# BAD: Entire dataset in workflow state
workflow AnalyzeData(datasetId):
    activity FetchDataset(datasetId) -> dataset  # 500MB result stored in history
    activity Analyze(dataset) -> results

# GOOD: Pass references, not data
workflow AnalyzeData(datasetId):
    activity FetchAndStore(datasetId) -> dataRef  # Returns S3 key, not data
    activity Analyze(dataRef) -> results
```

**Why:** Every activity input and result is persisted in workflow history. Large payloads bloat history size, slow down replay, and may exceed Temporal's payload size limit. Pass references (IDs, URLs, keys) instead of data.

> **Default: defer to the payload codec.** Temporal supports a **payload codec / data converter** that transparently offloads, compresses, or encrypts large payloads with *no change* to workflow/activity signatures — and the claim-check pattern itself is, most of the time, best implemented as a codec server that swaps a large payload for a reference behind the scenes. So the decision is:
>
> - **Default — let the codec server handle it** (claim-check included). Note it cleanly and move on: *"large-payload claim-check handled by the codec server."* Do **not** invent a bespoke claim-check store at design time.
> - **Escalate to an explicit application-level `*Ref`** only when the data outlives the workflow, is shared across services, or needs an ownership/GC story the codec can't own. *Only in that case* does the design owe a one-line note on backing store + lifecycle.

## Primitive Misuse

### Signal for Request-Response

Using a signal when the caller needs confirmation or a return value.

```pseudo
# BAD: Signal has no return value — caller doesn't know if it worked
signal ApproveOrder(orderId):
    approved = true

# GOOD: Update returns a result to the caller
update ApproveOrder(orderId: string) -> (ApprovalResult):
    activity ValidateApproval(orderId) -> validation
    if (validation.ok):
        approved = true
        return ApprovalResult{accepted: true}
    else:
        return ApprovalResult{accepted: false, reason: validation.error}
```

**Why:** Signals are fire-and-forget — the sender gets no acknowledgment, no validation, and no result. Use `update` when the caller needs to know the mutation was accepted.

### Query That Modifies State

Using a query handler to change workflow state.

```pseudo
# BAD: Query with side effects
query GetOrderStatus():
    accessCount = accessCount + 1  # Modifies state!
    return OrderStatus{status, accessCount}

# GOOD: Query is a pure read
query GetOrderStatus():
    return OrderStatus{status}
```

**Why:** Queries are read-only by contract. They may be called multiple times during replay without the workflow's knowledge. State modifications in queries produce unpredictable behavior and violate Temporal's execution model.

### Update Without Validation

Accepting an update without checking whether the mutation is valid.

```pseudo
# BAD: Blindly applies the update
update SetShippingAddress(address):
    shippingAddress = address
    return Result{ok: true}

# GOOD: Validate before committing
update SetShippingAddress(address: Address) -> (Result):
    activity ValidateAddress(address) -> validation
    if (validation.valid):
        shippingAddress = address
        return Result{ok: true}
    else:
        return Result{ok: false, error: validation.reason}
```

**Why:** Updates execute inside the workflow — invalid data corrupts workflow state. Always validate before committing. The caller receives the validation result, so they can react to rejection.

### Detach When You Need the Result

Using `detach` on a child workflow or nexus call when the parent needs the outcome.

```pseudo
# BAD: Detached — parent can't observe success or failure
detach workflow ProcessPayment(order)
# ... parent continues, has no idea if payment succeeded

# GOOD: Synchronous call or promise when result matters
workflow ProcessPayment(order) -> paymentResult
# or: promise p <- workflow ProcessPayment(order) ... await p -> paymentResult
```

**Why:** `detach` is fire-and-forget — the parent cannot await the result, check for errors, or compensate on failure. Use `detach` only when you genuinely don't care about the outcome (audit logs, analytics, notifications where failure is acceptable).

## Activity Anti-Patterns

### Non-Determinism in Workflows

Using non-deterministic operations directly in workflow code.

```pseudo
# BAD: Current time varies on replay
# if (current_time() > deadline):
#     cancel()

# BAD: Map iteration order varies across replays
# for (key in map.keys()):
#     activity Process(key)

# BAD: Goroutines/threads — execution order not deterministic
# go func() { activity DoWork() }

# GOOD: Use Temporal primitives for time
# await one:
#     activity DoWork() -> result:
#         close complete(Result{result})
#     timer(deadline):
#         close fail(Result{status: "timeout"})

# GOOD: Sort before iterating
# for (key in sorted(map.keys())):
#     activity Process(key)

# GOOD: Use promises for concurrency
# promise a <- activity DoWorkA()
# promise b <- activity DoWorkB()
# await a -> resultA
# await b -> resultB
```

**Why:** Temporal replays workflow code to reconstruct state. Any operation that produces different results on replay — time, random numbers, non-deterministic iteration, language-level threading — causes non-determinism errors. See [core-principles.md](./core-principles.md).

### Non-Idempotent Activities

Activities that fail or produce incorrect results on retry.

```pseudo
# BAD: Assumes fresh state — duplicate user on retry
activity CreateUser(name):
    db.insert(User(name))

# GOOD: Create-or-get — idempotent
activity CreateUser(name):
    existing = db.get_by_name(name)
    if existing: return existing
    return db.insert(User(name))
```

**Why:** Activities may be retried on network failures, worker crashes, or timeouts. An activity that isn't idempotent (same inputs → same result) will produce duplicate records, double charges, or inconsistent state. See [core-principles.md](./core-principles.md) for idempotency patterns.

### Orchestration in Activities

Putting multi-step logic, retry loops, or conditional branching inside an activity.

```pseudo
# BAD: Multi-step orchestration in activity — partial failure unrecoverable
activity DeployAll(specs):
    for spec in specs:
        deploy(spec)          # If this fails on spec #5 of 10,
        wait_healthy(spec)    # specs 1-4 deployed but no rollback
```

```twf
# GOOD: Workflow orchestrates, each step independently retryable
workflow DeployAll(specs: Specs):
    for (spec in specs.items):
        activity Deploy(spec)
        activity WaitHealthy(spec)
    close complete

activity Deploy(spec: Spec):
    deploy(spec)

activity WaitHealthy(spec: Spec):
    wait_healthy(spec)
```

**Why:** Activities run outside Temporal's durable execution model — if an activity fails mid-way through a loop, there's no replay, no history, and no way to resume from the last successful step. Workflows provide exactly this: durable, retryable orchestration with full visibility into progress.

### Activity Sprawl / Wrapping In-Memory Work

Wrapping work in an activity when nothing touches an external system — reading data the workflow already holds, in-memory derivation, or accumulation.

```pseudo
# BAD: activities that touch no external system
activity ReadCritiqueReady(state) -> ready   # field access on held data
activity ListSubsetPaperIds(papers) -> ids   # in-memory filter
activity AppendObservation(list, obs) -> list # building a collection

# GOOD: this is workflow code
ready = state.critiqueReady
ids = filter(papers, isSubset)
observations = append(observations, obs)
```

**Why:** Each spurious activity is a task-queue round-trip plus a history event for no resilience benefit. Activities are for I/O and side effects; in-memory work is deterministic workflow code. See [core-principles.md](./core-principles.md#activities-are-for-io--not-in-memory-work).

## Deployment Topology

### Nexus for Same-Namespace Calls

Using a Nexus operation to call a workflow that lives in the same namespace.

```pseudo
# BAD: Nexus hop within one namespace — adds an endpoint, a service
#      contract, and latency for no boundary benefit
nexus InternalEndpoint InternalService.DoStep(args) -> result

# GOOD: same namespace — call the child workflow (or activity) directly
workflow DoStep(args) -> result
```

**Why:** Nexus exists to cross an **organizational** boundary — different team, security context, deployment lifecycle, or an external service contract. Within a single namespace those boundaries don't exist, so Nexus only adds an endpoint declaration, a typed contract, and a network hop. Coupling between workflows is an argument for *co-location*, not a Nexus boundary. See [namespaces.md](./namespaces.md) and [workflow-boundaries.md](./workflow-boundaries.md#use-nexus-when).

### Deployment Config in Workers Instead of Namespaces

Putting task queues, concurrency limits, or other deployment options on `worker` definitions.

```pseudo
# BAD: worker carries deployment config
worker orderTypes:
    workflow ProcessOrder
    options:
        task_queue: "orders"   # workers are type sets, not deployments

# GOOD: worker is a reusable type set; the namespace instantiates it with config
worker orderTypes:
    workflow ProcessOrder

namespace ecommerce:
    worker orderTypes
        options:
            task_queue: "orders"
```

**Why:** A `worker` is a *reusable type set* (which workflows/activities/services run together) with no deployment config; the `namespace` is what instantiates it with a `task_queue` and options. Mixing the two prevents reusing the same type set across namespaces (staging vs prod) and is rejected by `twf check`. See [task-queues.md](../topics/task-queues.md).
