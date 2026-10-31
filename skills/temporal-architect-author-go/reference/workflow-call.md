# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```go
var shipResult ShipResult
err := workflow.ExecuteChildWorkflow(ctx, ShipOrder, order).Get(ctx, &shipResult)
if err != nil {
    return Result{}, err
}
```

- Pass the function reference; `ctx` carries `ChildWorkflowOptions` ([options.md](./options.md)).
- A child with an `id_scheme:` gets `WorkflowID: ShipItemID(order.ID, item.ID)` in its `ChildWorkflowOptions` from its ID function ([workflow-def.md](./workflow-def.md#id_scheme)); without one, leave `WorkflowID` unset.
- Bound to a promise, the call yields a `ChildWorkflowFuture` — also the target of `signal handle.Name(args)` ([signal-send.md](./signal-send.md)). Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through signals and the return value.
- Default `ParentClosePolicy` is `TERMINATE` — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md)) when the child should outlive the parent.
- If the parent completes before `ChildWorkflowExecutionStarted` is recorded, the child may never spawn — when the parent doesn't wait on the result (promise-bound or detached), confirm the start with `childFuture.GetChildWorkflowExecution().Get(ctx, nil)`.
