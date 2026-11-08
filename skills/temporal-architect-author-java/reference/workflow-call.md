# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```java
ShipOrder shipOrder = Workflow.newChildWorkflowStub(ShipOrder.class);
ShipResult shipResult = shipOrder.run(order);
```

- `Workflow.newChildWorkflowStub(Class, options?)` (`workflow/Workflow.java:455,472`) makes a stub whose `@WorkflowMethod` starts the child and blocks until its result; options are the optional second argument ([options.md](./options.md#child-workflow-options)). A failed child throws `ChildWorkflowFailure` (`failure/ChildWorkflowFailure.java:8`) from the call.
- **One stub per start.** A stub's execution, and so its signals, refer to its first start (`internal/sync/ChildWorkflowStubImpl.java:97`): make the stub where the call happens, never one field for several starts.
- A qualified callee, `workflow orders.ShipOrder(...)`, is `ShipOrder` imported from the Java package generated for the `.twf` package `orders`, one package per `.twf` package.
- A child with an `id_scheme:` gets `setWorkflowId(ShipItem.id(order.id(), item.id()))` from its ID method ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave it unset and the SDK generates one from `Workflow.randomUUID()` (`internal/sync/ChildWorkflowStubImpl.java:124-130`).
- A child takes `setWorkflowIdReusePolicy` only; it has no conflict policy, so a start onto a running ID fails ([options.md](./options.md#workflow-id-policies)). A `workflow` start in a sync nexus body is a client start instead: `client.newWorkflowStub` with the type's start options ([nexus-service-def.md](./nexus-service-def.md#sync)).
- Bound to a promise, the call is `Promise<ShipResult> pay = Async.function(shipOrder::run, order)` (`workflow/Async.java:28`); `pay.get()` is the `await`, and the stub is the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)). `Workflow.getWorkflowExecution(shipOrder).get()` waits for the start alone (`workflow/Workflow.java:506`). Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Unset, `setParentClosePolicy` leaves the server's default, terminate (`internal/sync/SyncWorkflowContext.java:974-976`) — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
