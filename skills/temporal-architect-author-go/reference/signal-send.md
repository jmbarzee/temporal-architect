# signal send

## Handle head (a child)

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

- `ChildWorkflowFuture.SignalChildWorkflow(ctx, signalName string, data interface{}) workflow.Future`. The handle is always an `ExecuteChildWorkflow` result. Keep the `payFuture :=` binding even when it is only signaled, never awaited.
- `signalName` must match the child's `GetSignalChannel` name ([signal-handler.md](./signal-handler.md)). `data` is a **single** payload: multiple DSL args pack into the signal struct; no args → `nil`.
- The call blocks until the child has started; if it never started, the returned future carries the start error.
- That future resolves on **server acceptance — never on the child's handler running**. Await it (`.Get(ctx, nil)`) only when a failed *send* should fail the sender; never treat it as "the child processed my signal".
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the handle refers to.

## Type head (by ID)

```twf
signal ShipItem.Shipped(event.tracking)
    id: "ship-{event.orderId}-{event.sku}"
signal ShipItem.Shipped(stuck.tracking)
    id: stuck.workflowId
    run_id: stuck.runId
signal FulfillOrder.ItemShipped(item.id)
    id: parent
```

```go
workflow.SignalExternalWorkflow(ctx, ShipItemID(event.OrderID, event.SKU), "", "Shipped", event.Tracking)

workflow.SignalExternalWorkflow(ctx, stuck.WorkflowID, stuck.RunID, "Shipped", stuck.Tracking)

if p := workflow.GetInfo(ctx).ParentWorkflowExecution; p != nil {
    workflow.SignalExternalWorkflow(ctx, p.ID, "", "ItemShipped", item.ID)
}
```

- `workflow.SignalExternalWorkflow(ctx, workflowID, runID, signalName string, arg interface{}) workflow.Future`; `signalName` and `arg` follow the handle rules above.
- `workflowID`: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `runID` is `run_id:`, or `""` (the current run) when absent.
- `id: parent` reads `ParentWorkflowExecution`, `nil` when no workflow started this run; the guard skips the send — fail instead if the design has no parentless start.
- The future fails when no such execution is running. Await it only when that should fail the sender.
