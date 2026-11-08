# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```ts
const pay = await startChild(ProcessPayment, { args: [order] });

await pay.signal(OrderShipped, shipmentId);

// Signaling does not consume the handle
const payment = await pay.result();
```

- `ChildWorkflowHandle.signal(def, ...args): Promise<void>` (`common/src/workflow-handle.ts`). The handle is always a `startChild` result, which resolves once the child has started, so a send never races the start. Keep the `pay` binding even when it is only signaled, never awaited.
- `def` is the `defineSignal` value the child's workflows module exports, whose name is the child's handler name ([SKILL.md](../SKILL.md#wire-names)); importing it type-checks the args. The args are positional, one payload per DSL arg; no args → `signal(def)`.
- The promise resolves on **server acceptance — never on the child's handler running** (`resolveSignalExternalWorkflow`, `workflow/src/internals.ts`). Never treat it as "the child processed my signal". Await it, so a failed send fails the sender; `.catch` it when it should not. Never leave it floating: an unhandled rejection fails the workflow task (`setUnhandledRejectionHandler`, `worker/src/workflow/vm-shared.ts`).
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

```ts
await getExternalWorkflowHandle(shipItemId(event.orderId, event.sku)).signal(Shipped, event.tracking);

await getExternalWorkflowHandle(stuck.workflowId, stuck.runId).signal(Shipped, stuck.tracking);

const parent = workflowInfo().parent;
if (parent) {
  await getExternalWorkflowHandle(parent.workflowId).signal(ItemShipped, item.id);
}
```

- `getExternalWorkflowHandle(workflowId, runId?)` (`workflow/src/workflow.ts`) returns a handle with `signal` and `cancel` only; `signal` follows the handle rules above.
- `workflowId`: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `runId` is `run_id:`, or omitted (the current run) when absent.
- `id: parent` reads `workflowInfo().parent`, `undefined` when no workflow started this run (`ParentWorkflowInfo`, `workflow/src/interfaces.ts`); the guard skips the send — fail instead if the design has no parentless start.
- The promise rejects when no such execution is running; handle it as above.
