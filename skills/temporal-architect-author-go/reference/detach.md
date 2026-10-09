# detach

Start the call, never wait for its result; its outcome does not affect the caller.

```twf
detach workflow NotifyCustomer(order.customer)
```

```go
childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
    ParentClosePolicy: enumspb.PARENT_CLOSE_POLICY_ABANDON,
})
childFuture := workflow.ExecuteChildWorkflow(childCtx, NotifyCustomer, order.Customer)
// Required: without it the child may never spawn if the parent completes first
if err := childFuture.GetChildWorkflowExecution().Get(ctx, nil); err != nil {
    return Result{}, err
}
// Never childFuture.Get() — that waits for completion
```

`ABANDON` lets the child outlive the parent; other policies are in [options.md](./options.md).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(order.customer, paymentResult)
```

```go
c := workflow.NewNexusClient("NotificationsEndpoint", "NotificationsService")
c.ExecuteOperation(ctx, SendConfirmationOp, sendConfirmationInput, workflow.NexusOperationOptions{})
```

Nexus fire-and-forget is an emergent pattern, not an SDK mode: the caller must not complete before the `ScheduleNexusOperation` command is processed, or the operation may not start. When the handler workflow finishes, its callback to the completed caller fails with an ignorable error.
