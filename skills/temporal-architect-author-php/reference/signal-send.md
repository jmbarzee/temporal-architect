# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```php
$pay = Workflow::newChildWorkflowStub(ProcessPayment::class);
$payResult = $pay->run($order);

yield $pay->orderShipped($shipmentId);

// Signaling does not consume the child
$payment = yield $payResult;
```

- After its `#[WorkflowMethod]` call, a child proxy's `#[SignalMethod]` call signals that child under the method's wire name ([SKILL.md](../SKILL.md#wire-names)), args positional, one payload per DSL arg (`Internal/Workflow/ChildWorkflowProxy.php:88-95`). The send waits for the child's start, so it never races it (`Internal/Workflow/ChildWorkflowStub.php:120-136`). Keep `$pay` even when the child is only signaled, never awaited.
- The promise answers the send's command, which the server completes on accepting the signal, not on the child's handler running (server behavior, with no SDK surface to cite): never treat it as "the child processed my signal". `yield` it, so a failed send fails the sender; catch it when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the proxy refers to.

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

```php
yield Workflow::newExternalWorkflowStub(
    ShipItem::class,
    new WorkflowExecution(Shipping::shipItemId($event->orderId, $event->sku)),
)->shipped($event->tracking);

yield Workflow::newExternalWorkflowStub(ShipItem::class, new WorkflowExecution($stuck->workflowId, $stuck->runId))
    ->shipped($stuck->tracking);

$parent = Workflow::getInfo()->parentExecution;
if ($parent !== null) {
    yield Workflow::newExternalWorkflowStub(FulfillOrder::class, $parent)->itemShipped($item->id);
}
```

- `Workflow::newExternalWorkflowStub(Class::class, new WorkflowExecution($id, $runId))` (`Workflow.php:890`, `Workflow/WorkflowExecution.php:46`) returns a proxy whose `#[SignalMethod]` calls send (`Internal/Workflow/ExternalWorkflowProxy.php:52-65`), under the handle rules above.
- `id:` is the full workflow ID: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `$runId` is `run_id:`, or omitted (the current run) when absent.
- `id: parent` reads `Workflow::getInfo()->parentExecution`, `null` when no workflow started this run (`Workflow/WorkflowInfo.php:121`); the guard skips the send — fail instead if the design has no parentless start.
- The server fails the send when no such execution is running; handle it as above.
