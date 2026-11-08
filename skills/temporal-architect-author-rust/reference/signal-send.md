# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```rust
let pay = ctx
    .start_child_workflow(ProcessPayment::run, order, child_options(ctx))
    .await?;

pay.signal(ProcessPayment::order_shipped, shipment_id, SignalWorkflowOptions::default())
    .await?;

// Signaling does not consume the child; `result()` does, so it comes last.
let payment = pay.result().await?;
```

- The handle is the `StartedChildWorkflow`, which exists only once the child has started, so a send never races the start. Its `signal` takes only a signal of that child's workflow (`S: SignalDefinition<Workflow = WD>`, `workflow/src/workflow_context.rs:3522-3539`), and the marker sends its `#[signal(name = "…")]` wire name ([SKILL.md](../SKILL.md#wire-names)), so signal and args are type-checked. The input is exactly the handler's: `MultiArgsN(a, b)` for several args, `()` for none.
- The send resolves on **server acceptance — never on the child's handler running**. Never treat it as "the child processed my signal". A failed send is a `WorkflowSignalError`; `?` fails the sender with it (`workflow/src/runtime/model.rs:274-278`), so handle it where it should not.
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

```rust
ctx.external_workflow(ShipItem::id(&event.order_id, &event.sku), None)
    .signal(ShipItem::shipped, event.tracking.clone(), SignalWorkflowOptions::default())
    .await?;

ctx.external_workflow(stuck.workflow_id.clone(), Some(stuck.run_id.clone()))
    .signal(ShipItem::shipped, stuck.tracking.clone(), SignalWorkflowOptions::default())
    .await?;

if let Some(parent) = ctx.info().parent() {
    ctx.external_workflow(parent.workflow_id(), None)
        .signal(FulfillOrder::item_shipped, item.id.clone(), SignalWorkflowOptions::default())
        .await?;
}
```

- `ctx.external_workflow(workflow_id, run_id)` (`workflow/src/workflow_context.rs:2460-2467`) returns a handle in the sender's namespace whose `signal` takes any workflow's signal (`:3567-3586`); name the head's type's marker, and follow the handle rules above.
- `id`: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `run_id:` passes `Some(run_id)`; `None` targets the current run (`:3562-3565`).
- `id: parent` reads `ctx.info().parent()`, `None` when no workflow started this run (`workflow/src/workflow_context/view.rs:135-141`); the guard skips the send — fail instead if the design has no parentless start.
- The send fails when no such execution is running; handle it as above.
