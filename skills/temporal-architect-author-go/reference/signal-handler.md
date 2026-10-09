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
    Amount        float64
}

func OrderWorkflow(ctx workflow.Context, orderId string) (OrderResult, error) {
    var status string
    var lastTransactionId string

    paymentReceivedCh := workflow.GetSignalChannel(ctx, "PaymentReceived")
    workflow.Go(ctx, func(gCtx workflow.Context) {
        for {
            var sig PaymentReceivedSignal
            paymentReceivedCh.Receive(gCtx, &sig)
            status = "payment_received"
            lastTransactionId = sig.TransactionId
        }
    })
    // ... workflow body
}
```

- Params become one struct; the signal name is the channel name. No params → `Receive(gCtx, nil)`.
- `decimal` → `float64` by default; for money prefer `shopspring/decimal` or integer cents.
- Delivery pattern:
  - **Goroutine loop** (above, the common case) — every arrival is handled, independent of the main flow.
  - **Inline blocking `Receive`** — the workflow pauses for exactly one signal.
  - **`Selector.AddReceive`** — racing the signal against other events, reading the same channel ([await-one.md](./await-one.md)).

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

## Continue-As-New

Signals not drained before `workflow.NewContinueAsNewError` are lost (Go SDK). Trigger CAN from the main workflow thread, never a signal handler, and drain first — with `ReceiveAsync`, or with `selector.HasPending()` + `selector.Select(ctx)` when signals go through a selector:

```go
for {
    var sig SignalType
    if !signalCh.ReceiveAsync(&sig) {
        break
    }
    // process or forward to next run via workflow input
}
return workflow.NewContinueAsNewError(ctx, MyWorkflow, state)
```
