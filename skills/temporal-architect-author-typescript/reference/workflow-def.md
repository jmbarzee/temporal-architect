# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```ts
export async function ProcessOrder(order: Order): Promise<Result> {
  return { status: 'done' };
}
```

An exported `async` function of the worker's workflows module, named as the `.twf` names it ([SKILL.md](../SKILL.md#wire-names)). Params are positional, one payload each; no DSL return type → `Promise<void>`; `-> (A, B)` → `Promise<[A, B]>`.

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```ts
export const shipItemId = (orderId: string, itemId: string): string => `ship-${orderId}-${itemId}`;
```

One ID function per scheme, beside the workflow, taking one argument per hole. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline. It lives in a shared module, never the workflows module, whose every exported function is a workflow type (`workflow/src/worker-interface.ts`).

A type that has a scheme or ID policies, or backs a Nexus run operation, also gets one start-options function holding its ID, task queue and `default_options:`; every client start spreads it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```ts
export function orderTrackerStartOptions(orderId: string): WorkflowOptions {
  return {
    workflowId: orderTrackerId(orderId),
    taskQueue: fulfillmentTaskQueue,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
  };
}

await getClient().workflow.start(OrderTracker, { ...orderTrackerStartOptions(orderId), args: [orderId] });
```

`WorkflowOptions` is the client's (`client/src/workflow-options.ts`); `args` joins at the start.

## Determinism constraints

`temporal-developer` `references/typescript/determinism.md` § Forbidden Operations in Workflows and `determinism-protection.md`; changing running workflows: `references/typescript/versioning.md`.
