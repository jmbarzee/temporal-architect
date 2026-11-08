# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```perl
my $timer = Temporalio::Workflow::sleep(24 * 3600);
await Temporalio::Workflow::wait_condition(sub { $payments_received->ready || $timer->is_ready });

if ($payments_received->ready) {    # listed first, so it wins a tie
    $payments_received->claim;
    $timer->cancel unless $timer->is_ready;
    $status = 'processing';
}
else {
    await Temporalio::Workflow::execute_activity('CancelOrder',
        args => [$order_id], start_to_close_timeout => 60);
    Temporalio::Exception::Application->throw(message => 'order cancelled',
        type => 'OrderCancelled', details => [{ status => 'cancelled' }]);
}
```

One `wait_condition` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. The check sees the state that satisfied the wait, since the code after `await` runs inside the condition's `done` (`Workflow/Runner.pm:2045-2054`). [`corpus/concurrency/perl/Batch.pm`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/perl/Batch.pm) is the worked example; its `t/await_one.t` holds the tie, and `AwaitOne.pm` in `corpus/messages/perl/t/lib/` the signal case above, using `Arrivals`.

Not `Future->wait_any`: it resolves with the case that completes first, not the first listed, and cancels every other case (CPAN `Future` § wait_any, read at 0.54), which for an activity requests its cancellation (`Workflow.pm:218-222`); the corpus's two-timer tie returns the later-listed timer. Not `wait_condition(…, timeout => $s)`: it races the condition against its own timer, failing with `Temporalio::Exception::Timeout` when the timer resolves first (`Workflow/Runner.pm:1990-2006`), so job order, not listed order, decides.

## Cases

| Case | Before `wait_condition` | In the predicate | Winner |
|------|-------------------------|------------------|--------|
| signal, update | — | `$xs->ready` | `$xs->claim` |
| timer | `my $timer = Temporalio::Workflow::sleep($s)` | `$timer->is_ready` | — |
| activity, child workflow, nexus, promise | its future `$p` ([promise.md](./promise.md)) | `$p->is_ready` | `await $p` |
| condition | — | the condition | — |
| nested `await all:` | `my $all = Future->needs_all(…)` | `$all->is_ready` | `await $all` |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner `claim`s the arrival; a losing case leaves it pending. An earlier waiter is served first, so a case waits behind it (`AwaitOneBehindPromise.pm`). `is_ready` is also true for a failed future; the winner's `await $p` dies with its failure.

## Tie order (#474)

sdk-perl deviates from spec 06's first-listed rule (#474). An activation applies its signals and updates, then checks conditions, before it applies its timers and activity, child and Nexus results (`Workflow/Runner.pm:2129-2141,2312-2323`). So when both become ready in one workflow task, a message case, or a condition a handler sets, beats a non-message case listed before it. A message case listed first, two message cases, or two non-message cases follow listed order. Perl has no opt-in to change it; `t/await_one.t` asserts `Ack` for both orders.

## Notes

- **Losing cases** (spec 06): `->cancel` a losing inline timer (it emits `CancelTimer`, `Workflow.pm:321-331`), or it fires later and adds a workflow task. Leave losing inline activities, children and Nexus operations running until the run ends, and never cancel a bound promise for losing a round. For a child's lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)).
- An empty case body → the winner's `claim` or `await` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh timer each iteration.
