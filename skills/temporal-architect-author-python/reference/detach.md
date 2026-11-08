# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Python that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow NotifyCustomer(order.customer)
```

```python
# Returns once the child has started; a failed start raises here.
await workflow.start_child_workflow(
    NotifyCustomer.run,
    order.customer,
    parent_close_policy=ParentClosePolicy.ABANDON,
    cancellation_type=ChildWorkflowCancellationType.ABANDON,
)
# Never await the handle: that waits for completion.
```

- A child start is `start_child_workflow` with `ParentClosePolicy.ABANDON`, so the parent's close does nothing to the child, and `ChildWorkflowCancellationType.ABANDON`, so the parent's cancellation is not propagated to it (`temporalio/workflow/_workflow_ops.py:129-160`). It returns after awaiting the child's start, so a failed start raises in the caller (`temporalio/worker/_workflow_instance.py:2218`).
- A client start, `detach workflow` in a sync nexus body, has no parent: `nexus.client().start_workflow(...)` starts the run and returns a handle, and the handler never awaits `handle.result()` ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(Confirmation{customer: order.customer, payment: paymentResult})
```

```python
notifications = workflow.create_nexus_client(service=NotificationsService, endpoint="NotificationsEndpoint")
# Returns once the operation starts; a sync operation starts by completing.
await notifications.start_operation(
    NotificationsService.send_confirmation,
    Confirmation(customer=order.customer, payment=payment_result),
    cancellation_type=workflow.NexusOperationCancellationType.ABANDON,
)
# Never await the handle: that waits for the result.
```

- Nexus has no parent-close policy. `NexusOperationCancellationType.ABANDON` sends no cancellation request to the handler (`temporalio/workflow/_nexus.py:47-58`).
- `start_operation` returns its handle after awaiting the operation's start (`temporalio/worker/_workflow_instance.py:2296`), so a failed start raises in the caller.
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
