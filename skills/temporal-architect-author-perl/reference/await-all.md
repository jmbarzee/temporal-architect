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
    also => Temporalio::Workflow::start_activity('ReserveInventory',
        args => [$order], start_to_close_timeout => 60),
    also => $billing->execute_operation('ChargePayment', $order->{payment}),
);
```

- One `Future->needs_all` over every branch's unawaited workflow future, whatever its kind (`README.md:605-608`), each prefixed `also =>`; it returns the branches' results concatenated in branch order (CPAN `Future` § needs_all). The SDK's `cpanfile` leaves `Future` unpinned; it is read at 0.54, and `also` needs 0.51 (`Future.pm:1104`), the floor `corpus/cpanfile` pins. [`corpus/concurrency/perl/Batch.pm`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/perl/Batch.pm) is the worked example.
- It fails at the first branch failure, with that failure (`Future/PP.pm:856-859`). When two fail, the first to fail surfaces; a later failure is dropped (`:849`). The corpus's `failure/perl/t/job.t` asserts the rule in the main body and in an [update handler](./update-handler.md).
- `also` keeps the other branches running, as spec 06 requires (`Future/PP.pm:674,706`). Without it, `needs_all` cancels every branch still pending, a bound promise included (`:700-708`), and an activity's cancellation is requested (`Workflow/Runner.pm:4528-4539`). A child or Nexus branch is never sent a cancel request: its future is an async sub's (`Workflow.pm:284-287`, `Workflow/NexusClient.pm:59-62`), so the cancel stops at the future it awaits and never reaches the handle's `cancel`.
- Not `Future->wait_all`: it waits for every branch, failed or not (`Future/PP.pm:731-739`).
- A `detach` call's branch is its `start_child_workflow` / `start_operation`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```perl
await Future->needs_all(map {
    (also => Temporalio::Workflow::start_activity('ProcessBatchItem',
        args => [$_], start_to_close_timeout => 60))
} @$items);
```
