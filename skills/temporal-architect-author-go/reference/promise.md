# promise

A promise is a future: the call starts immediately, and `await` defers only the blocking `.Get`. Default to an inline call (`.Get` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```go
futureA := workflow.ExecuteActivity(ctx, ProcessA, items.A)
// ... do other work ...
var resultA ResultA
if err := futureA.Get(ctx, &resultA); err != nil {
    return Result{}, err
}
```

| `promise p <- …` | Go handle |
|------------------|-----------|
| `activity` / `workflow` | `workflow.Future` from `ExecuteActivity` / `ExecuteChildWorkflow` (the latter a `ChildWorkflowFuture`, also a [signal-send](./signal-send.md) target) |
| `timer(5m)` | `workflow.Future` from `workflow.NewTimer(ctx, 5*time.Minute)` |
| `nexus …` | `NexusOperationFuture` from `NexusClient.ExecuteOperation`; `GetNexusOperationExecution()` optionally waits for the start, not the finish |
| `signal Approve` / `update Review` | `workflow.Future` from `workflow.NewFuture`, settled by a goroutine that takes from the message's queue (below) |

A promise on a signal or update begins waiting at its binding, not at its `await`, so start the goroutine there:

```go
approval, settle := workflow.NewFuture(ctx)
workflow.Go(ctx, func(gCtx workflow.Context) {
    settle.Set(approves.take(gCtx))
})
```

The queue and `take` are in [await-signal.md](./await-signal.md). In `await one:`, a promise is a future case ([await-one.md](./await-one.md#cases)).
