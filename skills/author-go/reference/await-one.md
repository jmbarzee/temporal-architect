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

## History Hygiene

Per DSL semantics, non-winning cases are **not** cancelled by `await one` — they continue running until the workflow run ends (`close complete`, `close fail`, `close continue_as_new`, or external cancellation). The Go `Selector.Select` API mirrors this: it fires one case and returns, leaving all other registered futures and channels active.

Explicitly cancelling the losing timer is an **optimization** for history hygiene, not a correctness requirement. A non-cancelled timer will fire later and generate unnecessary workflow tasks.

```go
// WASTEFUL: the losing timer fires later, adding unnecessary history events
sel.Select(ctx)
// timer still scheduled — generates a timer-fired event when it expires

// BETTER: cancel the timer in the winning handler to avoid wasted history events
sel.AddReceive(signalCh, func(ch workflow.ReceiveChannel, more bool) {
    ch.Receive(ctx, nil)
    cancelTimer() // prevents the timer from generating further history events
})
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
c := workflow.NewNexusClient("BillingEndpoint", "BillingService")
sel.AddFuture(c.ExecuteOperation(ctx, "ChargePayment", input, workflow.NexusOperationOptions{}), func(f workflow.Future) {
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
- **Non-winning cases are not cancelled by `await one`.** Per DSL semantics, they continue running until the workflow run ends (`close complete`, `close fail`, `close continue_as_new`, or external cancellation). This matches `Selector.Select` Go SDK behavior. Explicit cancellation in the winning handler is an optimization for history hygiene, not a semantic requirement
- Cancelling a **timer** via `workflow.WithCancel` is clean — the timer stops and generates no further history events. Cancelling a **child workflow** sends a cancellation *request*; the child's actual behavior depends on its own cancellation handling. For controlling child lifecycle at parent completion, use `parent_close_policy` in child workflow options (see [options.md](./options.md))
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
