# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```haskell
processOrder :: ProvidedWorkflow (Order -> Workflow Result)
processOrder = provideCallStack $ provideWorkflow JSON "ProcessOrder" \order ->
  pure Result {status = "done"}
```

A `ProvidedWorkflow` value named for the workflow in lowerCamelCase, built by `provideWorkflow JSON "Name"` with the `.twf` name as its string ([SKILL.md](../SKILL.md#wire-names)); `provideCallStack` discharges the `RequireCallStack` that every workflow operation carries (`Workflow/Definition.hs:141-155`). Params are positional, one payload each, any arity; no DSL return type → `Workflow ()`; `-> (A, B)` → one record ([types.md](./types.md)). Workflow state is `StateVar`s created at the top of the body (`newStateVar`).

- **A local helper that calls the SDK needs `RequireCallStack =>` in its signature**, as the corpus's `callNexus` has: `provideCallStack` reaches only the lambda it wraps.
- **`Workflow` has no `MonadFail`**: a refutable bind (`Just t <- …`) does not compile; `case` on the value instead.

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```haskell
shipItemId :: Text -> Text -> WorkflowId
shipItemId orderId itemId = WorkflowId ("ship-" <> orderId <> "-" <> itemId)
```

One ID function per scheme, beside the workflow, taking one argument per hole and returning a `WorkflowId`, as the corpus's `greetId`. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never build the ID inline.

A type that has a scheme or ID policies, or backs a Nexus operation, also gets one start-options function holding its task queue and `default_options:`; every client start passes it with the ID function's result ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```haskell
orderTrackerStartOptions :: C.StartWorkflowOptions
orderTrackerStartOptions =
  (C.startWorkflowOptions fulfillmentTaskQueue) {C.workflowIdConflictPolicy = Just C.WorkflowIdConflictPolicyUseExisting}

h <- C.start orderTracker (orderTrackerId orderId) orderTrackerStartOptions orderId
```

`C` is `Temporal.Client` imported qualified. `StartWorkflowOptions` holds no ID: `Temporal.Client.start` takes the workflow, its `WorkflowId`, the options, then the run's args (`Client.hs:665-673`, `Client/Types.hs:107`), in any monad with a `WorkflowClient` (`ReaderT WorkflowClient IO`, `Client.hs:193-198`).

## Determinism constraints

[idioms.md § determinism](./idioms.md#determinism); changing running workflows: [idioms.md § versioning](./idioms.md#versioning).
