# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```python
pay = await workflow.start_child_workflow(ProcessPayment.run, order)

await pay.signal(ProcessPayment.order_shipped, shipment_id)

# Signaling does not consume the handle
payment = await pay
```

- `ChildWorkflowHandle.signal(method, arg)` (`temporalio/workflow/_workflow_ops.py:73-118`). The handle is always a `start_child_workflow` result, which returns once the child has started, so a send never races the start. Keep the `pay` binding even when it is only signaled, never awaited.
- `method` is the child's `@workflow.signal` method, whose `name=` is the `.twf` handler name ([SKILL.md](../SKILL.md#wire-names)); passing it type-checks the arg. One arg is `arg`, several `args=[…]`, one payload per DSL arg; no args → `signal(method)`.
- The `await` returns on **server acceptance — never on the child's handler running** (`_signal_external_workflow`, resolved by `_apply_resolve_signal_external_workflow`, `temporalio/worker/_workflow_instance.py:2905,1134`). Never treat it as "the child processed my signal". Await it, so a failed send raises in the sender; catch it when it should not. An un-awaited `signal(...)` is a coroutine that never runs: the signal is never sent.
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

```python
await workflow.get_external_workflow_handle_for(ShipItem.run, ship_item_id(event.order_id, event.sku)).signal(
    ShipItem.shipped, event.tracking
)

await workflow.get_external_workflow_handle_for(ShipItem.run, stuck.workflow_id, run_id=stuck.run_id).signal(
    ShipItem.shipped, stuck.tracking
)

parent = workflow.info().parent
if parent:
    await workflow.get_external_workflow_handle_for(FulfillOrder.run, parent.workflow_id).signal(
        FulfillOrder.item_shipped, item.id
    )
```

- `get_external_workflow_handle_for(Type.run, workflow_id, run_id=…)` (`temporalio/workflow/_workflow_ops.py:699`) returns a typed handle with `signal` and `cancel` only; `signal` follows the handle rules above. Its typed overloads take no arg or one; several args go as `signal("Name", args=[…])` with the wire name (`:596-660`).
- `workflow_id`: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `run_id` is `run_id:`, or omitted (the current run) when absent.
- `id: parent` reads `workflow.info().parent`, `None` when no workflow started this run (`ParentInfo`, `temporalio/workflow/_context.py:218`); the guard skips the send — fail instead if the design has no parentless start.
- The send raises when no such execution is running; handle it as above.
