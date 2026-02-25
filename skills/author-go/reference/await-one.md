# await one

## DSL

```twf
await one:
    signal PaymentReceived:
        status = "processing"
    timer(24h):
        activity CancelOrder(orderId)
        close fail(OrderResult{status: "cancelled"})
```

## Go

```go
timerCtx, cancelTimer := workflow.WithCancel(ctx)

sel := workflow.NewSelector(ctx)

sel.AddReceive(paymentReceivedCh, func(ch workflow.ReceiveChannel, more bool) {
    var sig PaymentReceivedSignal
    ch.Receive(ctx, &sig)
    status = "processing"
    cancelTimer()
})

timerFuture := workflow.NewTimer(timerCtx, 24*time.Hour)
sel.AddFuture(timerFuture, func(f workflow.Future) {
    if err := f.Get(ctx, nil); err != nil {
        // timer cancelled — signal won the race
        return
    }
    err := workflow.ExecuteActivity(ctx, CancelOrder, orderId).Get(ctx, nil)
    if err != nil {
        // handle activity error
    }
    // close fail handled after selector
})

sel.Select(ctx)
```

## Case types

**Signal case** — `sel.AddReceive(channel, handler)`
```go
sel.AddReceive(signalCh, func(ch workflow.ReceiveChannel, more bool) {
    var sig SignalType
    ch.Receive(ctx, &sig)
    // case body
})
```

**Timer case** — `sel.AddFuture(workflow.NewTimer(...), handler)`
```go
sel.AddFuture(workflow.NewTimer(ctx, duration), func(f workflow.Future) {
    if err := f.Get(ctx, nil); err != nil {
        // timer cancelled
        return
    }
    // case body
})
```

**Activity case** — `sel.AddFuture(workflow.ExecuteActivity(...), handler)`
```go
sel.AddFuture(workflow.ExecuteActivity(ctx, DoWork, args), func(f workflow.Future) {
    var result ResultType
    if err := f.Get(ctx, &result); err != nil {
        // handle error
        return
    }
    // case body
})
```

**Workflow case** — `sel.AddFuture(workflow.ExecuteChildWorkflow(...), handler)`
```go
sel.AddFuture(workflow.ExecuteChildWorkflow(ctx, Child, args), func(f workflow.Future) {
    var result ResultType
    if err := f.Get(ctx, &result); err != nil {
        // handle error
        return
    }
    // case body
})
```

**Nexus case** — `sel.AddFuture(client.ExecuteOperation(...), handler)`. Nexus operations return `NexusOperationFuture`, which satisfies `workflow.Future` — add to selector with `AddFuture`.
```go
c := workflow.NewNexusClient("PaymentsEndpoint", "PaymentsService")
sel.AddFuture(c.ExecuteOperation(ctx, "ProcessPayment", input, workflow.NexusOperationOptions{}), func(f workflow.Future) {
    var result PaymentResult
    if err := f.Get(ctx, &result); err != nil {
        // handle error
        return
    }
    // case body
})
```

**Update case** — register handler separately (see [update-handler.md](./update-handler.md)), share state between the update handler and selector
```go
// Update handlers are registered separately (see update-handler.md).
// To race an update against other events, share state between the update handler and selector:
sel.AddReceive(updateDoneCh, func(ch workflow.ReceiveChannel, more bool) {
    ch.Receive(ctx, nil)
    // react to update completion
})
```

**Promise (ident) case** — add the existing future or channel to the selector
```go
// future promise
sel.AddFuture(myFuture, func(f workflow.Future) {
    var result ResultType
    if err := f.Get(ctx, &result); err != nil {
        // handle error
        return
    }
    // case body
})

// condition promise — use a goroutine that signals a channel
condCh := workflow.NewChannel(ctx)
workflow.Go(ctx, func(gCtx workflow.Context) {
    if err := workflow.Await(gCtx, func() bool { return myCondition }); err != nil {
        return // context cancelled — don't send
    }
    condCh.Send(gCtx, true)
})
sel.AddReceive(condCh, func(ch workflow.ReceiveChannel, more bool) {
    ch.Receive(ctx, nil)
    // case body
})
```

## Notes

- `sel.Select(ctx)` blocks until exactly one case fires — the first to complete wins
- `Select` does not cancel losing cases. Cancel timers and child workflows explicitly using `workflow.WithCancel` + calling the cancel function in the winning handler (see primary example above)
- Uncancelled timers remain active and generate unnecessary workflow tasks when they fire
- Empty case bodies (just the colon in DSL) → handler function with only the `Receive`/`Get` call, no additional logic
- For `close` inside a case body: set a variable in the handler, check it after `sel.Select`, then return
- Nested `await all:` inside `await one:` → wrap the `await all` logic in a goroutine that signals a channel on completion, add as `AddReceive`:
  ```go
  allDoneCh := workflow.NewChannel(ctx)
  workflow.Go(ctx, func(gCtx workflow.Context) {
      wg := workflow.NewWaitGroup(gCtx)
      wg.Go(gCtx, func(gCtx2 workflow.Context) { /* activity A */ })
      wg.Go(gCtx, func(gCtx2 workflow.Context) { /* activity B */ })
      wg.Wait(gCtx)
      allDoneCh.Send(gCtx, true)
  })
  sel.AddReceive(allDoneCh, func(ch workflow.ReceiveChannel, more bool) {
      ch.Receive(ctx, nil)
      // all activities completed
  })
  ```

## When to use: single Select vs loop

- **Single `sel.Select(ctx)`** (as shown above): use for one-time races — "whichever happens first wins" (e.g., payment or timeout)
- **`sel.Select(ctx)` in a loop**: use for event-driven workflows that process multiple events over time. Re-add cases each iteration or use persistent cases. Common for entity workflows that react to signals indefinitely
  ```go
  for {
      sel := workflow.NewSelector(ctx)
      sel.AddReceive(signalCh, func(ch workflow.ReceiveChannel, more bool) { ... })
      sel.AddFuture(workflow.NewTimer(ctx, interval), func(f workflow.Future) { ... })
      sel.Select(ctx)
      if done { break }
  }
  ```
