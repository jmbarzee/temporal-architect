# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```ruby
payment = @payments_received.wait
timer_cancellation, cancel_timer = Temporalio::Cancellation.new(Temporalio::Workflow.cancellation)
timer = Temporalio::Workflow::Future.new do
  Temporalio::Workflow.sleep(24 * 3600, cancellation: timer_cancellation)
end
Temporalio::Workflow.wait_condition { @payments_received.ready?(payment) || timer.done? }

if @payments_received.ready?(payment) # listed first, so it wins a tie
  @payments_received.claim
  cancel_timer.call # the inline timer lost
  @status = 'processing'
else
  @payments_received.leave(payment)
  Temporalio::Workflow.execute_activity(CancelOrder, order_id, start_to_close_timeout: 60)
  raise Temporalio::Error::ApplicationError.new('order cancelled', OrderResult.new(status: 'cancelled'),
                                                type: 'OrderCancelled')
end
```

One `wait_condition` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Ruby needs no SDK opt-in for this shape: an activation applies every job before it runs the scheduler (`internal/worker/workflow_instance.rb:204,214`), and the scheduler runs every ready fiber, signal and update handlers included, before it checks any wait condition (`internal/worker/workflow_instance/scheduler.rb:33-66`), so the one condition sees a fired timer and a pending arrival of the same activation together. Two tempting forms are not `await one`:

- **Not `Workflow.timeout(secs) { wait_condition { … } }`**: its timer fiber raises into the waiter while the activation applies the timer's job, before any handler runs (`internal/worker/workflow_instance/context.rb:339-358`), so the timer wins a tie even when listed second.
- **Not `Workflow::Future.any_of` over a take per case**: it returns the first listed done future (`workflow/future.rb:17-22`), but by then every ready take has claimed its arrival, since the scheduler resumes each satisfied condition in turn before `any_of`'s own (`internal/worker/workflow_instance/scheduler.rb:45-66`), so a losing case consumes an arrival.

[`corpus/concurrency/ruby/workflows.rb`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/ruby/workflows.rb) (`Batch`) is the worked example; `await_one_test.rb` beside it holds the tie in both listing orders and the `Workflow.timeout` counter-test, `batch_test.rb` the losing timer's `TimerCanceled` and a bound deadline (`BoundDeadline`) that survives the rounds it loses; the `AwaitOne` and `RaceTakes` fixtures in [`corpus/messages/ruby/arrivals_fixtures.rb`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/ruby/arrivals_fixtures.rb) are the signal case above and the `any_of` counter-test.

## Cases

| Case | Before `wait_condition` | In the condition | Winner |
|------|-------------------------|------------------|--------|
| signal, update | `t = @xs.wait` | `@xs.ready?(t)` | `@xs.claim`; every losing message case calls `@xs.leave(t)` |
| inline timer | `timer`, a `Future` over `Workflow.sleep(d, cancellation: timer_cancellation)`, as above | `timer.done?` | every other winner calls `cancel_timer.call` |
| activity, child workflow, nexus, promise | `f = Workflow::Future.new { … }` ([promise.md](./promise.md)) | `f.done?` | `f.wait` |
| condition | — | the condition | — |
| nested `await all:` | `all = Workflow::Future.all_of(…)` | `all.done?` | `all.wait` |

A message case waits without taking: `ready?` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place and blocks later waiters. The condition only reads (`workflow.rb:530-531`); `claim` and `leave` come after the wait. `done?` is also true for a failed future (`workflow/future.rb:89-91`); the winner's `wait` raises it.

## Notes

- **Losing cases** (spec 06): a losing inline timer is cancelled through its own `Temporalio::Cancellation`, linked to the workflow's so a workflow cancellation still reaches it; cancelling it issues `CancelTimer` (`internal/worker/workflow_instance/outbound_implementation.rb:315-328`), and history records `TimerCanceled`. Leave losing inline activities, children and Nexus operations running until the run ends, and never cancel a bound `promise` for losing a round: it starts outside any race's cancellation. For a child's lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)). Cancellations: `temporal-developer` `references/ruby/patterns.md` § Cancellation (Token-based).
- An empty case body → the winner's `claim` or `wait` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `wait` ticket per message case each iteration.
