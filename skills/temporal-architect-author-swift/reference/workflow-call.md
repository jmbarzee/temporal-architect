# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```swift
let shipResult = try await context.executeChildWorkflow(ShipOrder.self, input: order)
```

- `context.executeChildWorkflow(_:options:input:)` (`Temporal/Worker/Workflow/WorkflowContext.swift:912-918`) starts the child and suspends until its result; `options:` defaults to `ChildWorkflowOptions()` ([options.md](./options.md#child-workflow-options)). A failed child throws `ChildWorkflowError` (`Temporal/Errors/Failures/ChildWorkflowFailure.swift:16`) from the call. A `Void`-input child passes `input: ()`.
- It is `startChildWorkflow(…)` then the handle's `result()` (`:860-866`, `Temporal/Worker/Workflow/ChildWorkflowHandle.swift:86`). Take the two steps when the `.twf` signals the child ([signal-send.md](./signal-send.md)), or for fire-and-forget ([detach.md](./detach.md)).
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` from the module of the `.twf` package `orders`, under `import Orders`.
- **`id` is the child's full workflow ID**, never a prefix: with an `id_scheme:` it is `ChildWorkflowOptions(id: ShipItem.id(orderId: order.id, itemId: item.id))`, from the type's ID function ([workflow-def.md](./workflow-def.md#id_scheme)), and the SDK sends it unchanged (`Temporal/Extensions/ChildWorkflowOptions+Proto.swift:33`). Without a scheme, leave it unset: the SDK draws a UUID from the workflow's deterministic generator (`Temporal/Worker/Workflow/WorkflowStateMachine.swift:727`).
- A child takes `idReusePolicy` only; it has no conflict policy, so a start onto a running ID throws `WorkflowAlreadyStartedError` (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:368-370`; [options.md](./options.md#workflow-id-policies)).
- Bound to a promise, the call is an `async let` at the binding, and its `try await` is the `await` ([promise.md](./promise.md)).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Unset, `parentClosePolicy` is `.terminate` (`Temporal/Worker/Workflow/ChildWorkflowOptions.swift:197`), so the child is killed when the parent completes, fails or times out. Set another policy ([options.md](./options.md#child-workflow-options)) when the child should outlive the parent.
