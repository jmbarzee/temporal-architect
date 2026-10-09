# signal send (to a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```go
payFuture := workflow.ExecuteChildWorkflow(ctx, ProcessPayment, order)

payFuture.SignalChildWorkflow(ctx, "OrderShipped", OrderShippedSignal{
    ShipmentId: shipmentId,
})

// Signaling does not consume the handle
var payment PaymentResult
if err := payFuture.Get(ctx, &payment); err != nil {
    return SagaResult{}, err
}
```

- `ChildWorkflowFuture.SignalChildWorkflow(ctx, signalName string, data interface{}) workflow.Future`. The DSL only admits a workflow-bound promise as target, so the receiver is always an `ExecuteChildWorkflow` result. Keep the `payFuture :=` binding even when it is only signaled, never awaited.
- `signalName` must match the child's `GetSignalChannel` name ([signal-handler.md](./signal-handler.md)). `data` is a **single** payload: multiple DSL args pack into the signal struct; no args → `nil`.
- The call blocks until the child has started; if it never started, the returned future carries the start error.
- That future resolves on **server acceptance — never on the child's handler running**. Await it (`.Get(ctx, nil)`) only when a failed *send* should fail the sender; never treat it as "the child processed my signal".
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the handle refers to.
- Child → parent, or a workflow the sender did not start, has no DSL form: signal through a client, or return the value from the child.
