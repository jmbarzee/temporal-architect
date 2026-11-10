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
