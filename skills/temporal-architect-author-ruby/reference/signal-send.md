# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```ruby
pay = Temporalio::Workflow.start_child_workflow(ProcessPayment, order)
pay_result = Temporalio::Workflow::Future.new { pay.result }

pay.signal(ProcessPayment.order_shipped, shipment_id)

# Signaling does not consume the child
payment = Payment.from_h(pay_result.wait)
```

- The handle is the `ChildWorkflowHandle` from `start_child_workflow`, which returns only once the child has started, so a send never races the start ([workflow-call.md](./workflow-call.md)). Keep the handle even when the child is only signaled, never awaited.
- `handle.signal(signal, *args)` (`workflow/child_workflow_handle.rb:46`) takes the target's handler as `ProcessPayment.order_shipped`: each handler method also defines a class method returning its definition (`workflow/definition.rb:347-349`), which sends the `workflow_signal name:` wire name ([SKILL.md](../SKILL.md#wire-names)) and raises `NoMethodError` if the handler is missing. Never pass a name string. The args are positional, one payload per DSL arg; no args → `pay.signal(ProcessPayment.order_shipped)`.
- The call returns on **server acceptance — never on the child's handler running**. Never treat it as "the child processed my signal". A failed send raises from the call (`internal/worker/workflow_instance/outbound_implementation.rb:268-278`), failing the sender; rescue it when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one child the handle refers to.

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

```ruby
Temporalio::Workflow.external_workflow_handle(ShipItem.workflow_id(event.orderId, event.sku))
                    .signal(ShipItem.shipped, event.tracking)

Temporalio::Workflow.external_workflow_handle(stuck.workflowId, run_id: stuck.runId)
                    .signal(ShipItem.shipped, stuck.tracking)

parent = Temporalio::Workflow.info.parent
if parent
  Temporalio::Workflow.external_workflow_handle(parent.workflow_id).signal(FulfillOrder.item_shipped, item.id)
end
```

- `Workflow.external_workflow_handle(workflow_id, run_id: nil)` (`workflow.rb:298-300`) returns a handle for signals and cancellation only; its `signal` (`workflow/external_workflow_handle.rb:33`) follows the handle rules above.
- `id`: a constructed `id:` calls the target's ID method ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's values; a learned `id:` passes the variable as is.
- `run_id:` targets that run; absent, the handle targets the current run.
- `id: parent` reads `Workflow.info.parent`, a `ParentInfo` with `workflow_id`, `nil` when no workflow started this run (`workflow/info.rb:52-53,90-94`); the guard skips the send — fail instead if the design has no parentless start.
- The call raises when no such execution is running; handle it as above.
