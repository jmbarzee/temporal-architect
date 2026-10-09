# Workflow Patterns

> **Example:** [`patterns.twf`](./patterns.twf)

Ask the questions in order; the first "yes" picks the pattern.

| Question | Pattern | Example in `patterns.twf` | Typical domains |
|----------|---------|---------------------------|-----------------|
| Is it a long-lived thing that reacts to events? | **Entity** ([long-running.md](./long-running.md#entity-workflow-pattern)) | `AccountEntity` | Accounts, subscriptions, carts, IoT devices, game sessions |
| Must several services all succeed or all roll back? | **Saga** | `BookingWorkflow` | Travel/event booking, financial ops, provisioning |
| Can items be processed in parallel, then aggregated? | **Fan-Out/Fan-In** | `BatchProcessor` | Batch jobs, parallel API calls, report aggregation |
| Is it a series of transformations of one datum? | **Pipeline** | `DataPipeline` | ETL, document processing, transcoding, migrations |
| Are there explicit states and event-driven transitions? | **State Machine** | `DocumentApproval` | Approvals, tickets, claims, order status |
| Must it wait for an external system that doesn't push? | **Polling** | `AwaitResourceReady` | Provisioning, external jobs, CI/CD |
| Otherwise: discrete steps toward a result (minutes–hours) | **Process** | `OrderFulfillment` | Orders, registration, deployments, reports |

## Saga

Each forward step has a compensation; on failure, compensations run in **reverse order** for the steps already done, giving eventual consistency.

| Forward action | Compensation |
|----------------|--------------|
| Create pending reservation | Cancel reservation |
| Process payment | Refund payment |
| Create shipment | Cancel shipment |
| Create resource | Delete resource |

TWF has no try/catch or compensation stack. Model a failed step as a checked result (`if (hotel.failed):`) followed by the compensations, or hand them to a compensation child workflow (`CompensateBooking`); the SDK's error handling drives the real logic.

## Fan-Out/Fan-In

`await all:` around a `for` fans out; a following step aggregates. The result variable inside `await all: for` is re-bound each iteration, so collecting results is SDK-level — the aggregation activity stands in for it. Partial failures must be handled at aggregation.

Cap concurrency by fanning out per chunk:

```twf
workflow RateLimitedBatch(items: []Item) -> (BatchResult):
    for (batch in chunk(items, 10)):
        await all:
            for (item in batch):
                activity ProcessItem(item)
    close complete(BatchResult{})
```

"First successful result" is the same fan-out with an SDK-level selection step after it.

## Pipeline

Ordered stages, each transforming the previous stage's output; a validation stage may `close fail` early. A conditional stage is an `if` around an activity that re-binds its input: `activity Enrich(processed) -> processed`.

## State Machine

Signal handlers set a `phase` variable; the main loop is `for: switch (phase):`, where each waiting state is an `await one:` over its allowed signals plus a `timer` that moves to `expired`, and each terminal state runs its action and closes. The `switch` cases are the transition table.

## Polling

Loop: check status, close on ready or failed, otherwise wait with exponential backoff (`backoff = min(backoff * 2, maxBackoff)`) against an overall deadline — a `promise deadline <- timer(...)` started once before the loop; a `timer(...)` case inside the loop restarts every pass and never fires. To surface progress, upsert search attributes from the loop (SDK-level, not TWF). Long polls need `continue_as_new` — see `LongPoller` in [timers-scheduling.twf](./timers-scheduling.twf).
