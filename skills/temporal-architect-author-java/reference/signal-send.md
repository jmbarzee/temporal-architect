# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```java
ProcessPayment pay = Workflow.newChildWorkflowStub(ProcessPayment.class);
Promise<Payment> payResult = Async.function(pay::run, order);

pay.orderShipped(shipmentId);

// Signaling does not consume the child
Payment payment = payResult.get();
```

- The handle is the child stub: calling its `@SignalMethod` signals the child it started, and the call first waits for that start, so a send never races it (`internal/sync/ChildWorkflowStubImpl.java:101-121`). Keep the stub even when the child is only signaled, never awaited.
- The method sends its `@SignalMethod(name = "…")` wire name ([SKILL.md](../SKILL.md#wire-names)), so the args are type-checked. They are positional, one payload per DSL arg; no args → `pay.orderShipped()`.
- The call returns on **server acceptance — never on the child's handler running**. Never treat it as "the child processed my signal". A failed send throws `SignalExternalWorkflowException` from the call, failing the sender; catch it when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the stub refers to.

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

```java
Workflow.newExternalWorkflowStub(ShipItem.class, ShipItem.id(event.orderId(), event.sku()))
    .shipped(event.tracking());

Workflow.newExternalWorkflowStub(
        ShipItem.class,
        WorkflowExecution.newBuilder().setWorkflowId(stuck.workflowId()).setRunId(stuck.runId()).build())
    .shipped(stuck.tracking());

Optional<String> parentId = Workflow.getInfo().getParentWorkflowId();
if (parentId.isPresent()) {
  Workflow.newExternalWorkflowStub(FulfillOrder.class, parentId.get()).itemShipped(item.id());
}
```

- `Workflow.newExternalWorkflowStub(Class, workflowId)` / `(Class, WorkflowExecution)` (`workflow/Workflow.java:483,495`) returns a stub for signals only; its `@SignalMethod` call follows the handle rules above (`internal/sync/ExternalWorkflowStubImpl.java:32-52`).
- `id`: a constructed `id:` calls the target's ID method ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `run_id:` sets the `WorkflowExecution`'s run ID; absent, the stub targets the current run.
- `id: parent` reads `Workflow.getInfo().getParentWorkflowId()`, empty when no workflow started this run (`workflow/WorkflowInfo.java:116`); the guard skips the send — fail instead if the design has no parentless start.
- The call throws when no such execution is running; handle it as above.
