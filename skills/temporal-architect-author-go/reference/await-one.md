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
payment := paymentsReceived.wait()
timerCtx, cancelTimer := workflow.WithCancel(ctx)
timer := workflow.NewTimer(timerCtx, 24*time.Hour)
if err := workflow.Await(ctx, func() bool { return paymentsReceived.ready(payment) || timer.IsReady() }); err != nil {
    return OrderResult{}, err
}
// A signal in the winner's workflow task reaches its handler loop only after
// this coroutine resumes: yield once before choosing.
yielded := false
workflow.Go(ctx, func(workflow.Context) { yielded = true })
if err := workflow.Await(ctx, func() bool { return yielded }); err != nil {
    return OrderResult{}, err
}

if paymentsReceived.ready(payment) { // listed first, so it wins a tie
    paymentsReceived.claim()
    cancelTimer()
    status = "processing"
} else {
    paymentsReceived.leave(payment)
    if err := workflow.ExecuteActivity(ctx, CancelOrder, orderId).Get(ctx, nil); err != nil {
        return OrderResult{}, err
    }
    return OrderResult{}, temporal.NewApplicationError("order cancelled", "OrderCancelled", OrderResult{Status: "cancelled"})
}
```

`workflow.Await` blocks until any case is ready; then the first listed ready case wins, checked in `.twf` order. Yield only when a signal handler can make a case ready: an update handler runs before the workflow's coroutine (`internal_update.go`, sdk-go), so it has already run. Don't use `workflow.Selector`: after it blocks, the first callback in event order wins, not the first listed (`selectorImpl.Select`, sdk-go `internal/internal_workflow.go`), and a receive case on a signal channel bypasses the handler. [`corpus/concurrency/go/batch.go`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/go/batch.go) is the worked example.

## Cases

| Case | Before `Await` | In the predicate | Winner |
|------|----------------|------------------|--------|
| signal, update | `t := xs.wait()` | `xs.ready(t)` | `xs.claim()`; every losing message case calls `xs.leave(t)` |
| activity, child workflow, nexus, timer, promise | the future (`workflow.NewTimer` for a timer) | `f.IsReady()` | `f.Get(ctx, &result)` |
| condition | — | the condition's `bool` | — |
| nested `await all:` | a goroutine runs its `WaitGroup`, then sets `done` | `done` | — |

A message case waits without taking: `ready` checks its queue ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place in the queue and blocks later waiters.

## Notes

- **An inline timer case that loses is cancelled** (`twf spec statement-syntax`, lifecycle of non-winning cases): create it under `workflow.WithCancel` and cancel that context (`NewTimer`, sdk-go `workflow/deterministic_wrappers.go`), or it fires later and adds workflow tasks. Inline activity, child workflow and Nexus cases keep running until the run ends, and a bound promise is never cancelled by losing. Cancelling a child workflow only *requests* cancellation; for child lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)).
- An empty case body → the winner's take or `.Get` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `wait` ticket per message case each iteration.
