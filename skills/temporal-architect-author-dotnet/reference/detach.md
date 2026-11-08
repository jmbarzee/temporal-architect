# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In .NET that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow NotifyCustomer(order.customer)
```

```csharp
// Resolves once the child has started; a failed start throws here.
await Workflow.StartChildWorkflowAsync(
    (NotifyCustomer wf) => wf.RunAsync(order.Customer),
    new() { ParentClosePolicy = ParentClosePolicy.Abandon, CancellationType = ChildWorkflowCancellationType.Abandon });
// Never GetResultAsync(): that waits for completion.
```

- A child start is `StartChildWorkflowAsync` with `ParentClosePolicy.Abandon`, so the parent's close does nothing to the child (`Workflows/ParentClosePolicy.cs:21`), and `ChildWorkflowCancellationType.Abandon`, so the parent's cancellation is never requested of it (`Workflows/ChildWorkflowCancellationType.cs:8-11`). The returned task resolves at the child's start, and a failed start throws from it, failing the caller (`Worker/WorkflowInstance.cs:2691-2741`).
- A client start, `detach workflow` in a sync nexus body, has no parent: `client.StartWorkflowAsync(...)` starts the run and returns a handle, and the handler never calls `GetResultAsync()` ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(Confirmation{customer: order.customer, payment: paymentResult})
```

```csharp
var notifications = Workflow.CreateNexusWorkflowClient<INotificationsService>("NotificationsEndpoint");
// Resolves once the operation starts; a sync operation starts by completing.
await notifications.StartNexusOperationAsync(
    svc => svc.SendConfirmation(new(order.Customer, paymentResult)),
    new() { CancellationType = NexusOperationCancellationType.Abandon });
// Never GetResultAsync(): that waits for the result.
```

- Nexus has no parent-close policy. `NexusOperationCancellationType.Abandon` keeps the caller's cancellation from reaching the operation (`Workflows/NexusOperationCancellationType.cs:13-16`).
- `StartNexusOperationAsync` resolves when the operation starts, with its token, or for a sync operation with its result; a sync start failure throws from it (`Worker/WorkflowInstance.cs:2906-2926`).
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
