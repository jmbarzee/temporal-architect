# await one

```twf
await one:
    signal PaymentReceived:
        status = "processing"
    timer(24h):
        activity CancelOrder(orderId)
        close fail(OrderResult{status: "cancelled"})
```

```go
timerCtx, cancelTimer := workflow.WithCancel(ctx)
sel := workflow.NewSelector(ctx)

sel.AddReceive(paymentReceivedCh, func(ch workflow.ReceiveChannel, more bool) {
    var sig PaymentReceivedSignal
    ch.Receive(ctx, &sig)
    status = "processing"
    cancelTimer() // history hygiene: the losing timer would otherwise fire later
})

sel.AddFuture(workflow.NewTimer(timerCtx, 24*time.Hour), func(f workflow.Future) {
    if err := f.Get(ctx, nil); err != nil {
        return // timer cancelled — signal won
    }
    err := workflow.ExecuteActivity(ctx, CancelOrder, orderId).Get(ctx, nil)
    if err != nil {
        // handle activity error
    }
    // close fail handled after selector
})

sel.Select(ctx)
```

## Cases

| Case | Registration |
|------|--------------|
| activity, child workflow, nexus, timer, future-bound promise | `sel.AddFuture(future, func(f workflow.Future) { f.Get(ctx, &result) … })` — `NexusOperationFuture` satisfies `workflow.Future` |
| signal, signal-bound promise | `sel.AddReceive(ch, func(ch workflow.ReceiveChannel, more bool) { ch.Receive(ctx, &sig) … })` |
| update | Register the handler separately ([update-handler.md](./update-handler.md)); have it send on a channel the selector `AddReceive`s |
| condition, nested `await all:` | Goroutine that waits, then sends on a channel the selector `AddReceive`s (below); for `await all:` the goroutine runs a `WaitGroup` and `wg.Wait(gCtx)` instead of `Await` |

```go
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

- `sel.Select(ctx)` fires exactly one case — the first to complete — and returns.
- **Losing cases are not cancelled** — per DSL semantics and `Selector.Select` alike, they keep running until the run ends (`close`, or external cancellation). Cancelling them in the winning handler is history hygiene, not correctness: an uncancelled timer fires later and adds workflow tasks. Cancelling a timer via `workflow.WithCancel` is clean; cancelling a child workflow only *requests* cancellation, and the child decides. For child lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)).
- An empty case body → a handler with only the `Receive`/`Get`.
- `close` in a case body: set a variable in the handler, check it after `sel.Select`, then return.
- One-time race ("whichever first") → a single `Select`. Event-driven/entity workflows → `Select` in a loop, re-adding cases each iteration (or keeping persistent ones):
  ```go
  for {
      sel := workflow.NewSelector(ctx)
      sel.AddReceive(signalCh, func(ch workflow.ReceiveChannel, more bool) { ... })
      sel.AddFuture(workflow.NewTimer(ctx, interval), func(f workflow.Future) { ... })
      sel.Select(ctx)
      if done { break }
  }
  ```
