# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In TypeScript that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow NotifyCustomer(order.customer)
```

```ts
// Resolves once the child has started; a failed start rejects here.
await startChild(NotifyCustomer, {
  args: [order.customer],
  parentClosePolicy: ParentClosePolicy.ABANDON,
  cancellationType: ChildWorkflowCancellationType.ABANDON,
});
// Never handle.result(): that waits for completion.
```

- A child start is `startChild` with `ParentClosePolicy.ABANDON`, so the parent's close does nothing to the child (`ParentClosePolicy`, `workflow/src/interfaces.ts`), and `ChildWorkflowCancellationType.ABANDON`, so the parent's cancellation is not propagated to it (same file). `startChild` resolves at `await started`, the child's start, so a failed start fails the caller (`workflow/src/workflow.ts`).
- A client start, `detach workflow` in a sync nexus body, has no parent: `getClient().workflow.start(...)` starts the run and returns a handle, and the handler never calls `handle.result()` ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(Confirmation{customer: order.customer, payment: paymentResult})
```

```ts
const notifications = createNexusServiceClient({ endpoint: 'NotificationsEndpoint', service: NotificationsService });
// Resolves once the operation starts; a sync operation starts by completing.
await notifications.startOperation(
  'SendConfirmation',
  { customer: order.customer, payment: paymentResult },
  { cancellationType: NexusOperationCancellationType.ABANDON },
);
// Never handle.result(): that waits for the result.
```

- Nexus has no parent-close policy. `NexusOperationCancellationType.ABANDON` keeps the caller's cancellation from reaching the operation (`workflow/src/nexus.ts`).
- `startOperation` resolves when the operation starts, with its token, or for a sync operation with its result (`await execute` → `{token, result}`, `workflow/src/nexus.ts`).
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
