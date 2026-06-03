# promise

## DSL

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

## Go

```go
futureA := workflow.ExecuteActivity(ctx, ProcessA, items.A)
// ... do other work ...
var resultA ResultA
err := futureA.Get(ctx, &resultA)
if err != nil {
    return Result{}, err
}
```

## Variants

```twf
promise childHandle <- workflow SlowChild(input.data)
```

```go
childFuture := workflow.ExecuteChildWorkflow(ctx, SlowChild, input.Data)
```

```twf
promise timeout <- timer(5m)
```

```go
timerFuture := workflow.NewTimer(ctx, 5*time.Minute)
```

```twf
promise approved <- signal Approved
```

```go
approvedCh := workflow.GetSignalChannel(ctx, "Approved")
// Use approvedCh.Receive later, or add to selector
```

```twf
promise payHandle <- nexus BillingEndpoint BillingService.ChargePayment(payment)
```

```go
c := workflow.NewNexusClient("BillingEndpoint", "BillingService")
payFuture := c.ExecuteOperation(ctx, "ChargePayment", payment, workflow.NexusOperationOptions{})
```

## Notes

- A promise is just a future — the call starts immediately, `.Get` defers the blocking
- Activity/workflow promises → `workflow.Future` from `ExecuteActivity`/`ExecuteChildWorkflow`
- Timer promises → `workflow.Future` from `workflow.NewTimer`
- Signal promises → `workflow.ReceiveChannel` from `workflow.GetSignalChannel` — **not a `Future`**. Use `.Receive()` to block or add to a selector with `AddReceive`. Do not call `.Get()` on a channel
- Nexus promises → `NexusOperationFuture` from `NexusClient.ExecuteOperation`; same `.Get()` pattern as activity/workflow futures. Also has `GetNexusOperationExecution()` to optionally wait for the operation to start (not finish)
- Updates are handler-driven, not future-driven — they don't produce futures directly. To race an update completion, use a channel set by the update handler (see [update-handler.md](./update-handler.md))
- Promises used in `await one:` are added as selector cases — see [await-one.md](./await-one.md)

## When to use

- Use a promise (deferred `.Get`) when other work can proceed before the result is needed — the call starts immediately and runs concurrently with subsequent workflow code
- Use an inline blocking call (`.Get()` immediately) when the result is needed before any further work. This is the simpler pattern and should be the default
- Promises are essential for `await all:` (parallel fan-out) and `await one:` (racing) patterns
