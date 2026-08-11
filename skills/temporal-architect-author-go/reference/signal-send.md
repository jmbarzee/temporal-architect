# signal send (to a child)

## DSL

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

## Go

```go
payFuture := workflow.ExecuteChildWorkflow(ctx, ProcessPayment, order)

// Fire-and-forget — the returned Future is intentionally ignored
payFuture.SignalChildWorkflow(ctx, "OrderShipped", OrderShippedSignal{
    ShipmentId: shipmentId,
})

// The handle is still awaitable — signaling does not consume it
var payment PaymentResult
if err := payFuture.Get(ctx, &payment); err != nil {
    return SagaResult{}, err
}
```

## Checking send acceptance

```go
if err := payFuture.SignalChildWorkflow(ctx, "OrderShipped", sig).Get(ctx, nil); err != nil {
    return SagaResult{}, err
}
```

## Notes

- Signature: `ChildWorkflowFuture.SignalChildWorkflow(ctx workflow.Context, signalName string, data interface{}) workflow.Future`
- The handle is always a `ChildWorkflowFuture` — the DSL only allows a workflow-bound promise as a send target, so the Go receiver is always the result of `workflow.ExecuteChildWorkflow`. See [workflow-call.md](./workflow-call.md) and [promise.md](./promise.md)
- The signal name is the target workflow's channel name string — it must match the `workflow.GetSignalChannel` name the target registers. See [signal-handler.md](./signal-handler.md)
- `data` is a **single** payload. Multiple DSL args pack into the same signal struct the receiving side unmarshals into; no args → pass `nil`
- The call itself blocks until the child workflow has started (it internally waits on `GetChildWorkflowExecution()`). If the child never started, it returns that execution future, carrying the start error
- The returned `Future` resolves on **send acceptance by the server — never on the receiver's handler running**. The DSL has no await form for exactly this reason; do not generate code that treats the future's resolution as "the target processed my signal"

## When to use

- Use `SignalChildWorkflow` when a parent must push an event into a child it started, without waiting for the child to react (e.g. telling a payment child that shipping completed)
- Ignore the returned future by default — that is the direct mapping of the DSL statement. Await it (as above) only when a failed *send* should fail the sender
- To communicate the other direction (child → parent) or to a workflow the sender did not start, there is no DSL form; the parent must be signaled through a client or the result must flow back as the child's return value

## Pitfalls

- A workflow-bound promise used *only* as a signal target is legitimate — do not "clean up" an un-awaited `childFuture` that is signaled, and do not drop the `payFuture :=` binding
- Do not build a signal-send into a selector case or an `await all:` branch — send is a statement, not an async target
- Signaling does not restart or re-target the child; each `SignalChildWorkflow` call is one delivery to the one running child that handle refers to
