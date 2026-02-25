# detach

## DSL

```twf
detach workflow NotifyCustomer(order.customer)
```

## Go

```go
childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
    ParentClosePolicy: enums.PARENT_CLOSE_POLICY_ABANDON,
})
childFuture := workflow.ExecuteChildWorkflow(childCtx, NotifyCustomer, order.Customer)
// Wait for child to start (not finish) — without this, parent completion may prevent child from spawning
if err := childFuture.GetChildWorkflowExecution().Get(ctx, nil); err != nil {
    return Result{}, err
}
```

## Detach with nexus

### DSL

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(order.customer, paymentResult)
```

### Go

```go
c := workflow.NewNexusClient("NotificationsEndpoint", "NotificationsService")
c.ExecuteOperation(ctx, "SendConfirmation", sendConfirmationInput, workflow.NexusOperationOptions{})
// No .Get() — fire-and-forget. The operation starts when the schedule command is processed
```

## Notes

- `detach` = start the child but never wait for its result
- Set `ParentClosePolicy` to `ABANDON` so the child survives if the parent completes
- Always call `GetChildWorkflowExecution().Get()` to confirm the child started — without this, the child may never spawn if the parent completes first
- Do not call `.Get()` on the child workflow future itself (that would wait for completion)
- The child workflow runs independently and its success/failure does not affect the parent
- **Nexus fire-and-forget caveat:** omitting `.Get()` is an emergent pattern, not a first-class SDK mode. The caller workflow must not complete before the `ScheduleNexusOperation` command is processed, or the operation may not start. When the handler workflow completes, it attempts a callback to the (already-completed) caller, producing an ignorable error

## When to use

- Use `detach` when the parent does not need the child's result and the child should outlive the parent (e.g., sending a notification after order completion)
- Use a normal child workflow call (with `.Get()`) when the parent needs the result or should fail if the child fails
- `detach` with `ABANDON` is the only way for a child workflow to survive parent completion — the default `ParentClosePolicy` is `TERMINATE`
