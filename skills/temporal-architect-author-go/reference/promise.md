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
| `signal Approved` | `workflow.ReceiveChannel` from `workflow.GetSignalChannel(ctx, "Approved")` — **not a future**: `.Receive()` or `AddReceive`, never `.Get()` |

Updates produce no future; to race one, have the handler send on a channel ([update-handler.md](./update-handler.md)). Promises in `await one:` become selector cases ([await-one.md](./await-one.md#cases)).
