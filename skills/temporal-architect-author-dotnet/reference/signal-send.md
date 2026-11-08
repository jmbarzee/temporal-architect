# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```csharp
var pay = await Workflow.StartChildWorkflowAsync((ProcessPayment wf) => wf.RunAsync(order));

await pay.SignalAsync(wf => wf.OrderShippedAsync(shipmentId));

// Signaling does not consume the handle
var payment = await pay.GetResultAsync();
```

- `ChildWorkflowHandle<TWorkflow>.SignalAsync(wf => wf.Handler(...))` (`Workflows/ChildWorkflowHandle.cs:83-86`). The handle is always a `StartChildWorkflowAsync` result, which resolves once the child has started, so a send never races the start. Keep the `pay` binding even when it is only signaled, never awaited.
- The lambda names the child's `[WorkflowSignal]` method, and the SDK sends that method's wire name ([SKILL.md](../SKILL.md#wire-names)), so the args are type-checked. They are positional, one payload per DSL arg; no args → `wf => wf.OrderShippedAsync()`.
- The task completes on **server acceptance — never on the child's handler running** (`ApplyResolveSignalExternalWorkflow`, `Worker/WorkflowInstance.cs:1732`). Never treat it as "the child processed my signal". Await it, so a failed send fails the sender; catch it when it should not.
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

```csharp
await Workflow.GetExternalWorkflowHandle<ShipItem>(Shipping.ShipItemId(evt.OrderId, evt.Sku))
    .SignalAsync(wf => wf.ShippedAsync(evt.Tracking));

await Workflow.GetExternalWorkflowHandle<ShipItem>(stuck.WorkflowId, stuck.RunId)
    .SignalAsync(wf => wf.ShippedAsync(stuck.Tracking));

if (Workflow.Info.Parent is { } parent)
{
    await Workflow.GetExternalWorkflowHandle<FulfillOrder>(parent.WorkflowId)
        .SignalAsync(wf => wf.ItemShippedAsync(item.Id));
}
```

- `Workflow.GetExternalWorkflowHandle<TWorkflow>(id, runId?)` (`Workflows/Workflow.cs:1126`) returns a handle with `SignalAsync` and `CancelAsync` only; `SignalAsync` (`Workflows/ExternalWorkflowHandle.cs:79-82`) follows the handle rules above.
- `id`: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `runId` is `run_id:`, or omitted (the current run) when absent.
- `id: parent` reads `Workflow.Info.Parent`, `null` when no workflow started this run (`WorkflowInfo.ParentInfo`, `Workflows/WorkflowInfo.cs:85-88`); the guard skips the send — fail instead if the design has no parentless start.
- The task throws when no such execution is running; handle it as above.
