# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Perl that is: wait for the start, never the result, and keep the caller's cancellation and close from reaching it.

```twf
detach workflow NotifyCustomer(order.customer)
```

```perl
# Resolves once the child has started; a failed start dies here.
await Temporalio::Workflow::start_child_workflow('NotifyCustomer',
    args                => [$order->{customer}],
    parent_close_policy => 'abandon',
    cancellation_type   => 'abandon',
);
# Never ->result: that waits for completion.
```

- A child start is `start_child_workflow` with `parent_close_policy => 'abandon'`, so the parent's close does nothing to the child (`Workflow/Runner.pm:4371`), and `cancellation_type => 'abandon'`, so the parent's cancellation never requests the child's (`:4307`, `:1273-1285`). Both default otherwise — `terminate` and `wait_cancellation_completed` (`:4375`, `:4313`) — so set both. The returned future resolves at the child's start, and a failed start fails it, failing the caller (`Workflow.pm:272-278`, `Workflow/Runner.pm:2589-2647`).
- A misspelled key is silently dropped on a child start ([options.md](./options.md#child-workflow-options)): spell both exactly.
- A client start, `detach workflow` in a sync nexus body, has no parent: `$ctx->client->start_workflow(...)` starts the run and returns a handle, and the handler never awaits its `result` ([nexus-service-def.md](./nexus-service-def.md#sync)).

```twf
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(Confirmation{customer: order.customer, payment: paymentResult})
```

```perl
my $notifications = Temporalio::Workflow::create_nexus_client(
    endpoint => 'NotificationsEndpoint', service => 'NotificationsService');
# Resolves once the operation starts; a sync operation starts by completing.
await $notifications->start_operation('SendConfirmation',
    { customer => $order->{customer}, payment => $payment_result },
    cancellation_type => 'abandon');
# Never ->result: that waits for the result.
```

- Nexus has no parent-close policy. `cancellation_type => 'abandon'` keeps the caller's cancellation from reaching the operation (`Workflow/Runner.pm:4328`); the default is `wait_cancellation_completed` (`:4333`).
- `start_operation` (`Workflow/NexusClient.pm:44-53`) resolves when the operation starts, with its handle, or for a sync operation once it has completed; a failed start fails it (`Workflow/Runner.pm:2754-2815`).
- When the operation finishes after the caller has closed, its completion callback to the caller fails and is dropped; that is server behavior, with no SDK surface to cite.
