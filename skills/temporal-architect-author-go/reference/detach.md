# detach

Wait for the start to be confirmed, never for the result; the started execution outlives the caller, whose cancellation and close do not reach it.

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

When the handler finishes after the caller has closed, its completion callback fails and is dropped.
