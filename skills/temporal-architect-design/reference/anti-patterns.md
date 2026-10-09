# Common Anti-Patterns

## Structural

### Unbounded History

**Detect:** a loop whose accumulated history is large and that never resets. **Fix:** `close continue_as_new`. Every event is persisted; unbounded history means slow replay and eventual failure. See [long-running.md](../topics/long-running.md).

**A bound alone is not sufficient.** A loop over 40 iterations still grows history linearly; with chunky iterations (a large `LlmCall` result plus N tool calls) or a high bound it can hit the limit before finishing. State the strategy explicitly — "bounded at N, per-iteration history small, no `continue_as_new`" or "resets every K iterations."

```twf
workflow ReindexCatalog(cursor: Cursor):
    pageCount = 0
    for:
        activity FetchPage(cursor) -> page
        activity IndexItems(page.items)
        cursor = page.next
        pageCount = pageCount + 1
        if (cursor == null):
            close complete
        if (pageCount >= 500):
            close continue_as_new(cursor)
```

### Wrapper Workflow

**Detect:** a child workflow whose body is a single activity call. **Fix:** call the activity directly. A child workflow costs separate history, task-queue routing, and latency; it earns them only with independent retry policy, a separate failure boundary, or multi-step orchestration.

### Monolithic Workflow

**Detect:** one workflow with more than ~10 sequential activity calls. **Fix:** decompose into child workflows where a group of steps has its own lifecycle, retry needs, or failure boundary. A monolith has a large history (slow replay), coarse failure recovery (one failure re-runs unrelated steps), and is hard to test.

```pseudo
workflow ProcessOrder(order):
    activity ValidateOrder(order) -> validated
    workflow FulfillOrder(validated) -> fulfillment
    workflow NotifyStakeholders(order, fulfillment)
    close complete(OrderResult{fulfillment})
```

### Large Payloads in Workflow State

**Detect:** files, full query results, or images held in workflow variables or carried in activity results or signal/update payloads — every one is persisted in history, bloating it, slowing replay, and risking the payload size limit.

**Fix — default: the payload codec.** A codec server / data converter offloads, compresses, or encrypts large payloads, claim-check included, with no change to signatures. Note it and move on — *"large-payload claim-check handled by the codec server"* — and do **not** invent a bespoke claim-check store at design time.

**Escalate to an explicit application-level `*Ref`** (an ID, URL, or key passed instead of the data) only when the data outlives the workflow, is shared across services, or needs an ownership/GC story the codec can't own. Only then does the design owe a one-line note on backing store and lifecycle.

## Primitive Misuse

### Signal for Request-Response

**Detect:** a signal where the caller needs acknowledgment, validation, or a result. **Fix:** `update` — signals are fire-and-forget.

### Query That Modifies State

**Detect:** a query handler that writes state (even a counter). **Fix:** move the write out and return only held state — queries are pure reads by contract and can run any number of times without the workflow's knowledge.

### Update Without Validation

**Detect:** an update that commits its input unchecked. **Fix:** validate first and return the result, so invalid data never corrupts workflow state and the caller can react to rejection.

```pseudo
update SetShippingAddress(address: Address) -> (Result):
    activity ValidateAddress(address) -> validation
    if (validation.valid):
        shippingAddress = address
        return Result{ok: true}
    else:
        return Result{ok: false, error: validation.reason}
```

### Detach When You Need the Result

**Detect:** `detach` on a child workflow or nexus call whose outcome the parent needs to await, error-check, or compensate. **Fix:** a synchronous call, or `promise` + `await`. Detach only when failure is acceptable (audit logs, analytics, best-effort notifications).

## Activity Anti-Patterns

### Non-Determinism in Workflows

**Detect:** anything that differs on replay — current time, random numbers, map iteration order, language-level threads. **Fix:** Temporal primitives — a `timer` in `await one` for deadlines, sort before iterating, `promise` for concurrency. Replay reconstructs state by re-running workflow code. See [core-principles.md](./core-principles.md).

### Non-Idempotent Activities

**Detect:** an activity that assumes fresh state — an insert, a charge — and duplicates on retry. **Fix:** make it idempotent (create-or-get, idempotency key). Activities retry on network failures, worker crashes, and timeouts. See [core-principles.md](./core-principles.md).

### Orchestration in Activities

**Detect:** loops, retry logic, or branching across several external steps inside one activity — a failure on step 5 of 10 leaves 1–4 done with no rollback. **Fix:** the workflow orchestrates, one activity per step, so each is independently retryable and progress is durable and visible.

### Activity Sprawl / Wrapping In-Memory Work

**Detect:** an activity that touches no external system — field access on held data, an in-memory filter, appending to a collection. **Fix:** write it as workflow code. Each spurious activity is a task-queue round-trip and a history event with no resilience benefit. See [core-principles.md](./core-principles.md#activities-are-for-io--not-in-memory-work).

## Deployment Topology

### Nexus for Same-Namespace Calls

**Detect:** a Nexus operation whose target lives in the caller's namespace. **Fix:** call the child workflow or activity directly. Nexus crosses an **organizational** boundary — team, security context, deployment lifecycle, external service contract; within one namespace it adds only an endpoint, a contract, and a hop. Coupling argues for co-location, not Nexus. See [namespaces.md](./namespaces.md) and [workflow-boundaries.md](./workflow-boundaries.md#use-nexus-when).

