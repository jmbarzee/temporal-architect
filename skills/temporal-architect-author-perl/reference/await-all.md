# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```perl
my $billing = Temporalio::Workflow::create_nexus_client(
    endpoint => 'BillingEndpoint', service => 'BillingService');
my ($inventory, $payment) = await Future->needs_all(
    Temporalio::Workflow::start_activity('ReserveInventory',
        args => [$order], start_to_close_timeout => 60),
    $billing->execute_operation('ChargePayment', $order->{payment}),
);
```

- One `Future->needs_all` over every branch's unawaited workflow future, whatever its kind (`README.md:605-608`); it returns the branches' results concatenated in branch order (CPAN `Future` § needs_all). [`corpus/concurrency/perl/Batch.pm`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/perl/Batch.pm) is the worked example.
- On the first failure it fails at once with that failure and cancels every branch still pending, a bound promise passed as a branch included (CPAN `Future` § needs_all; the SDK's `cpanfile` leaves `Future` unpinned, read at 0.54). An activity's cancellation is requested (`Workflow.pm:218-222`), and a child's or Nexus operation's too, unless its `cancellation_type` is abandon (`Workflow/Runner.pm:1296-1307,1688-1699`). Other SDKs leave the other branches running; for that, use `Future->wait_all` and check each future after.
- A `detach` call's branch is its `start_child_workflow` / `start_operation`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```perl
await Future->needs_all(map {
    Temporalio::Workflow::start_activity('ProcessBatchItem',
        args => [$_], start_to_close_timeout => 60)
} @$items);
```
