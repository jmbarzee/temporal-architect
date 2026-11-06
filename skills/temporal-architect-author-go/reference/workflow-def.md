# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```go
func ProcessOrder(ctx workflow.Context, order Order) (Result, error) {
    return Result{Status: "done"}, nil
}
```

`workflow.Context` is always first and `error` always last: no DSL return type → `func Name(ctx workflow.Context, params...) error`; `-> (A, B)` → `(A, B, error)`.

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```go
func ShipItemID(orderID, itemID string) string { return fmt.Sprintf("ship-%s-%s", orderID, itemID) }
```

One ID function per scheme, beside the workflow, taking one argument per hole. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies, or backs a Nexus run operation, also gets one start-options function holding its ID, task queue and `default_options:`; every client start and Nexus `GetOptions` calls it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```go
func OrderTrackerStartOptions(orderID string) client.StartWorkflowOptions {
    return client.StartWorkflowOptions{
        ID:                                       OrderTrackerID(orderID),
        TaskQueue:                                FulfillmentTaskQueue,
        WorkflowIDConflictPolicy:                 enumspb.WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING,
        WorkflowExecutionErrorWhenAlreadyStarted: true,
    }
}
```

## Determinism constraints

`temporal-developer` `references/go/determinism.md` § Forbidden Operations in Workflows and `references/go/gotchas.md` § Non-Deterministic Operations; changing running workflows: `references/go/versioning.md`.
