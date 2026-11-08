# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```perl
my $pay = await Temporalio::Workflow::start_child_workflow('ProcessPayment', args => [$order]);

await $pay->signal('OrderShipped', args => [$shipment_id]);

# Signaling does not consume the handle
my $payment = await $pay->result;
```

- `$handle->signal($name, args => [...])` (`Workflow/ChildWorkflowHandle.pm:77-82`). The handle is always a `start_child_workflow` result, which resolves once the child has started, so a send never races the start. Keep the `$pay` binding even when it is only signaled, never awaited.
- The name is the child's signal wire name as a string, the `.twf` name ([SKILL.md](../SKILL.md#wire-names)); nothing checks it or the args against the handler. `args` are positional, one payload per DSL arg, received positionally by the handler; no args → omit `args`.
- The future resolves on **server acceptance — never on the child's handler running** (`Workflow/ChildWorkflowHandle.pm:72-76`, `Workflow/Runner.pm:2714-2727`). Never treat it as "the child processed my signal". Await it, so a failed send fails the sender; wrap it in `eval` when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the handle refers to.

## Type head (by ID)

```twf
signal ShipItem.Shipped(event.tracking)
	id: "ship-{event.orderId}-{event.sku}"
signal ShipItem.Shipped(stuck.tracking)
	id: stuck.workflowId
	run_id: stuck.runId
```

```perl
await Temporalio::Workflow::get_external_workflow_handle(ShipItem::id($event->{orderId}, $event->{sku}))
    ->signal('Shipped', args => [$event->{tracking}]);

await Temporalio::Workflow::get_external_workflow_handle($stuck->{workflowId}, run_id => $stuck->{runId})
    ->signal('Shipped', args => [$stuck->{tracking}]);
```

- `Temporalio::Workflow::get_external_workflow_handle($id, run_id => ...)` (`Workflow.pm:300-302`) returns a handle with `signal` and `cancel` only; `signal` (`Workflow/ExternalWorkflowHandle.pm:40-43`) follows the handle rules above.
- `id`: a constructed `id:` calls the target's ID sub ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `run_id` is `run_id:`, or omitted (the current run) when absent.
- The future fails, with the server's failure, when no such execution is running (`Workflow/Runner.pm:2720-2723`); handle it as above.

## `id: parent` — unsupported

`signal FulfillOrder.ItemShipped(item.id)` with `id: parent` has no Perl form: `Temporalio::Workflow::info` carries no parent execution (`Workflow/Runner.pm:551-563`, `README.md:720-722`). Pass the parent's workflow ID in as a child argument (the parent reads its own from `Temporalio::Workflow::info->{workflow_id}`), and send to it as a learned `id:`. Tell the user: the child's code then takes a parameter its `.twf` signature lacks.
