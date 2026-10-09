# Promises and Conditions

> **Example:** [`promises-conditions.twf`](./promises-conditions.twf)

## Promises

Every async operation has two forms: **blocking** (`activity Process(item) -> result` starts and waits) and **non-blocking** (`promise p <- activity Process(item)` starts, continues, waits later). `<-` marks the async declaration; `->` binds a result.

```twf
promise p <- activity ProcessItem(input)
promise report <- workflow BuildReport(data)
promise timeout <- timer(5m)
promise approved <- signal Approved
promise addr <- update ChangeAddress
promise pay <- nexus BillingEndpoint BillingService.ChargePayment(card)

await p -> result
await timeout
```

The main use is start-now, wait-later: start operations, do other work, then collect results (`ParallelProcessing`). A promise can also be an `await one` case (`p -> result:`), racing a timer or signal (`TimedOperation`, `ResilientProcess`).

A workflow-bound promise is also a signal target — see [signals-queries-updates.md](./signals-queries-updates.md#sending-a-signal-to-a-child-workflow).

## Conditions and the state block

A `condition` is a named boolean — not a predicate expression — declared in the `state:` block, which also holds variable initializations. Conditions are typically set or unset in signal and update handlers; `await` on one unblocks when it becomes true, and it can be an `await one` case.

```twf
workflow Example():
    state:
        condition myCondition
        balance = 0
        status = "pending"

    signal Deposit(amount: decimal):
        balance = balance + amount
        if (balance >= 1000):
            set myCondition

    await myCondition
    close complete
```

- `state:` comes first in the workflow, before signal/query/update handlers, and is purely declarative — no temporal primitives.
- `condition` may be declared only in `state:`; `set` / `unset` must name a declared condition.

The motivating use is an update handler that waits on workflow state (`ClusterManager`) — see [signals-queries-updates.md](./signals-queries-updates.md#updates).
