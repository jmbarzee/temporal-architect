# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```go
type PaymentReceivedSignal struct {
    TransactionId string
    Amount        decimal.Decimal
}

func OrderWorkflow(ctx workflow.Context, orderId string) (OrderResult, error) {
    var status string
    var lastTransactionId string
    var paymentsReceived arrivals[PaymentReceivedSignal] // only if the design waits on it

    paymentReceivedCh := workflow.GetSignalChannel(ctx, "PaymentReceived")
    workflow.Go(ctx, func(gCtx workflow.Context) {
        for {
            var sig PaymentReceivedSignal
            paymentReceivedCh.Receive(gCtx, &sig)
            status = "payment_received"
            lastTransactionId = sig.TransactionId
            paymentsReceived.add(sig)
        }
    })
    // ... workflow body
}
```

- Params become one struct; the signal name is the channel name. No params → `Receive(gCtx, nil)`.
- The loop runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's queue. It is the channel's only reader: `await signal`, a signal case and a signal promise take from the queue ([await-signal.md](./await-signal.md)), never from the channel.
- Before `close continue_as_new`, let the loop drain the channel, `workflow.Await(ctx, func() bool { return paymentReceivedCh.Len() == 0 })`; never add a second `ReceiveAsync` reader. Arrivals still pending at `close continue_as_new` are dropped, and the design passes what it needs as continue-as-new arguments (spec 06, Signal and update arrival). The rest: `temporal-developer` `references/go/patterns.md` § Continue-as-New.

## Unrouted failure

A failure in a signal handler that nothing routes fails the run (`twf spec statement-syntax`, Close Statement). The loop cannot return it, and a panic does not fail the run: the coroutine recovers it (sdk-go `internal/internal_workflow.go:1239-1243`), and the default `BlockWorkflow` policy retries the workflow task instead (`internal/internal_task_handlers.go:1341-1345`, `internal/internal_worker.go:191-195`). When a handler can fail, the loop keeps the error and stops, and the workflow function returns it:

```go
var signalErr error
// in the loop: if err := ...; err != nil { signalErr = err; return }

var result OrderResult
var bodyErr error
bodyDone := false
workflow.Go(ctx, func(gCtx workflow.Context) {
    result, bodyErr = orderBody(gCtx)
    bodyDone = true
})
dCtx, _ := workflow.NewDisconnectedContext(ctx)
_ = workflow.Await(dCtx, func() bool { return bodyDone || signalErr != nil })
if signalErr != nil {
    return OrderResult{}, signalErr
}
return result, bodyErr
```

The workflow function's return completes the run (`internal/internal_workflow.go:557`, `:735`). The body's coroutine is then exited, not cancelled (`internal/internal_workflow.go:1367-1383`), so its calls end with the run. Await on a disconnected context: an `Await` on `ctx` returns as soon as the run is cancelled (`internal/workflow.go:675-681`), which would end the run before the body handles its cancellation through `gCtx`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```go
// unfinished_policy: abandon — design intent; the Go SDK cannot express it on signals
cancelCh := workflow.GetSignalChannelWithOptions(ctx, "Cancel",
    workflow.SignalChannelOptions{Description: "Cancels the subscription"})
```

- `description` → `SignalChannelOptions{Description}` via `GetSignalChannelWithOptions`; without options use plain `GetSignalChannel` (`SignalChannelOptions` is Experimental).
- **`unfinished_policy` has no Go equivalent on signals** — `UnfinishedPolicy` exists only on `workflow.UpdateHandlerOptions`. Record the intent in a comment. Do not invent an API: there is no `workflow.SignalHandlerOptions`, no per-channel policy setter, no signal `HandlerUnfinishedPolicy`.
