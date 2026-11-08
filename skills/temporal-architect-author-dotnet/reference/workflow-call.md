# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```csharp
var shipResult = await Workflow.ExecuteChildWorkflowAsync((ShipOrder wf) => wf.RunAsync(order));
```

- The lambda names the child's `[WorkflowRun]` method, never a string; options are the optional second argument ([options.md](./options.md#child-workflow-options)). A failed child throws `ChildWorkflowFailureException` from the `await`.
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` from the namespace generated for the `.twf` package `orders`, one namespace per package.
- A child with an `id_scheme:` gets `Id = Shipping.ShipItemId(order.Id, item.Id)` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave `Id` unset and the SDK generates one (`Workflows/ChildWorkflowOptions.cs:15-18`).
- A child takes `IdReusePolicy` only; it has no conflict policy, so a start onto a running ID throws ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync nexus body is a client start instead: `client.StartWorkflowAsync` with the type's start options ([nexus-service-def.md](./nexus-service-def.md#sync)).
- Bound to a promise, the call is `Workflow.StartChildWorkflowAsync(...)`, whose `ChildWorkflowHandle` resolves once the child has started and is also the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)); `await handle.GetResultAsync()` is the `await` (`ExecuteChildWorkflowAsync` is exactly that pair, `Workflows/Workflow.cs:755-760`). Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Default `ParentClosePolicy` is `Terminate` (`Workflows/ChildWorkflowOptions.cs:60`) — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
