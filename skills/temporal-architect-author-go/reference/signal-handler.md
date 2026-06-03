# signal handler

## DSL

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
    signal PaymentReceived(transactionId: string, amount: decimal):
        status = "payment_received"
        lastTransactionId = transactionId

    # ... body uses await signal PaymentReceived or await one with signal case
```

## Go

```go
func OrderWorkflow(ctx workflow.Context, orderId string) (OrderResult, error) {
    var status string
    var lastTransactionId string

    // Signal struct
    type PaymentReceivedSignal struct {
        TransactionId string
        Amount        float64
    }

    // Signal channel
    paymentReceivedCh := workflow.GetSignalChannel(ctx, "PaymentReceived")

    // Register handler via goroutine that loops on the channel
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

## Notes

- Signal params become a struct; signal name becomes the channel name string
- The handler goroutine loops forever — it processes every signal arrival, not just the first
- Handler body mutates workflow-scoped variables (closures over workflow state)
- Signals with no params: use `paymentReceivedCh.Receive(gCtx, nil)`
- When a signal is also used in `await one:`, the selector reads from the same channel — see [await-one.md](./await-one.md)
- `decimal` type in DSL maps to `float64` by default. For financial values where precision matters, consider `shopspring/decimal` or integer-cents representation instead

## When to use each pattern

- **Goroutine loop** (`workflow.Go` + `Receive` in a loop, as shown above): use when every signal must be processed as it arrives, independent of the main workflow flow. Most common pattern
- **Blocking `Receive` inline**: use when the workflow must pause and wait for exactly one signal before continuing. Simpler but blocks the main flow
- **`Selector.AddReceive`**: use when racing a signal against other events (timers, activities, other signals) — see [await-one.md](./await-one.md)

## Pitfalls

- **Signal drain before Continue-As-New (Go SDK only).** Signals are lost if the channel is not drained before `workflow.NewContinueAsNewError`. Drain with `ReceiveAsync` immediately before CAN:
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
- When using a `Selector` for signal handling, drain with `selector.HasPending()` + `selector.Select(ctx)` loop before CAN
- Do not trigger Continue-As-New from inside a signal handler — call it from the main workflow thread to avoid signal loss
