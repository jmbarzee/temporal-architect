# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Go that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow NotifyCustomer(order.customer)
```

```go
// Disconnected: the parent's cancellation does not reach the child
childCtx, _ := workflow.NewDisconnectedContext(ctx)
childCtx = workflow.WithChildOptions(childCtx, workflow.ChildWorkflowOptions{
    ParentClosePolicy: enumspb.PARENT_CLOSE_POLICY_ABANDON,
})
childFuture := workflow.ExecuteChildWorkflow(childCtx, NotifyCustomer, order.Customer)
// Required: without it the child may never spawn if the parent completes first
if err := childFuture.GetChildWorkflowExecution().Get(ctx, nil); err != nil {
    return Result{}, err
}
// Never childFuture.Get() — that waits for completion
```

- A child start takes `PARENT_CLOSE_POLICY_ABANDON` on a `NewDisconnectedContext` (`internal/context.go`), and waits on `GetChildWorkflowExecution()`, which is ready once the child has started (`ChildWorkflowFuture`, `internal/workflow.go`); a failed start fails the caller.
- A client start, `detach workflow` in a sync nexus body, has no parent: `ExecuteWorkflow` starts the run and returns (`Client`, `internal/client.go`), and the handler never calls `run.Get` ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(order.customer, paymentResult)
```

```go
c := workflow.NewNexusClient("NotificationsEndpoint", "NotificationsService")
fut := c.ExecuteOperation(ctx, SendConfirmationOp, sendConfirmationInput, workflow.NexusOperationOptions{
    CancellationType: workflow.NexusOperationCancellationTypeAbandon,
})
// Wait for the start; a sync operation's start is its completion
if err := fut.GetNexusOperationExecution().Get(ctx, nil); err != nil {
    return Result{}, err
}
// Never fut.Get() — that waits for the result
```

- Nexus has no parent-close policy. `NexusOperationCancellationTypeAbandon` keeps the caller's cancellation from reaching the operation; the SDK marks `CancellationType` Experimental (`NexusOperationOptions`, `internal/workflow.go`).
- `GetNexusOperationExecution()` resolves when the operation starts, and for a sync operation together with its result (`NexusOperationFuture`, `internal/workflow.go`).
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped.
