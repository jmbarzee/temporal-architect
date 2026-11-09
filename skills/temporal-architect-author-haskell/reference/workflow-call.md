# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```haskell
shipResult <- executeChildWorkflow shipOrder defaultChildWorkflowOptions order
```

- `executeChildWorkflow workflow options args…` (`Workflow.hs:779-787`) takes the child's `ProvidedWorkflow` value, never a string; options are the second argument ([options.md](./options.md#child-workflow-options)). A failed child throws `ChildWorkflowFailed` from the call (`Workflow/Unsafe/Handle.hs:118`).
- A qualified callee, `workflow orders.ShipOrder(...)`, is `shipOrder` from the module tree generated for the `.twf` package `orders`, imported qualified.
- A child with an `id_scheme:` sets `workflowId = Just (shipItemId orderId itemId)` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave it `Nothing` and the SDK generates a random UUID (`Workflow.hs:681-683`).
- A child takes `workflowIdReusePolicy` only; it has no conflict policy, so a start onto a running ID throws ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync nexus body is a client start instead: `Temporal.Client.start` with the type's start options ([nexus-service-def.md](./nexus-service-def.md#sync)).
- Bound to a promise, the call is `startChildWorkflow` (`Workflow.hs:769-776`), which returns a `ChildWorkflowHandle` at once, before the child starts; `waitChildWorkflowStart h` waits for the start and `wait h` for the result (`Workflow/Unsafe/Handle.hs:99-106`). The handle is also the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)). Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- The default `parentClosePolicy` takes the server's, `TERMINATE` — the child is killed when the parent completes, fails, or times out — and the default `cancellationType` is `ChildWorkflowCancellationAbandon` ([options.md](./options.md#child-workflow-options)). Set another policy when the child should outlive the parent.
