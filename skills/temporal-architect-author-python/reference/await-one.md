# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```python
payment = self.payments_received.wait()
timer = asyncio.create_task(workflow.sleep(timedelta(hours=24)))
await workflow.wait_condition(lambda: self.payments_received.ready(payment) or timer.done())

if self.payments_received.ready(payment):  # listed first, so it wins a tie
    self.payments_received.claim()
    timer.cancel()
    self.status = "processing"
else:
    self.payments_received.leave(payment)
    await workflow.execute_activity(cancel_order, order_id, start_to_close_timeout=timedelta(minutes=1))
    raise ApplicationError("order cancelled", OrderResult(status="cancelled"), type="OrderCancelled")
```

One `wait_condition` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Not `workflow.wait(…, return_when=FIRST_COMPLETED)` over a take per case: every ready take claims in the same condition pass, before `wait` returns, so a losing case consumes its arrival (`temporalio/worker/_workflow_instance.py:2827-2837`). [`corpus/concurrency/python/workflows.py`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/python/workflows.py) is the worked example; its `test_await_one.py` holds the tie.

## Cases

| Case | Before `wait_condition` | In the predicate | Winner |
|------|-------------------------|------------------|--------|
| signal, update | `t = self.xs.wait()` | `self.xs.ready(t)` | `self.xs.claim()`; every losing message case calls `self.xs.leave(t)` |
| timer | `timer = asyncio.create_task(workflow.sleep(d))` | `timer.done()` | — |
| activity, child workflow, nexus, promise | the call's task `p` ([promise.md](./promise.md)) | `p.done()` | `await p` |
| condition | — | the condition | — |
| nested `await all:` | `g = asyncio.gather(…)` | `g.done()` | `await g` |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place and blocks later waiters. The winner's `await p` raises its failure.

## Tie order in 1.35.0

By default the SDK deviates from spec 06's first-listed rule (#474). An activation applies its signals and updates and runs the workflow before it resolves its timers and activity, child and Nexus results (`temporalio/worker/_workflow_instance.py:481-535`). So when both become ready in one workflow task, a message case, or a condition a handler sets, beats a non-message case listed before it. A message case listed first, or two message cases, already follow listed order.

The fix is the SDK's flag 2, `PROCESS_WORKFLOW_ACTIVATION_JOBS_AS_SINGLE_BATCH`, which applies every job before the workflow runs. It is off by default in 1.35.0, and the SDK plans to make it the default once two published releases recognize it (`_workflow_instance.py:4197-4201`). A run records the flag in its history when first used, so its replay keeps the order (`_workflow_instance.py:2320-2326`). The only switch today is the private `Worker._set_default_workflow_logic_flag` (`temporalio/worker/_worker.py:773-782`): pending upstream ([draft](https://github.com/jmbarzee/temporal-architect/issues/363#issuecomment-6723056854), item 4), private API, may change.

## Notes

- **Losing cases** (spec 06): `.cancel()` a losing inline timer; leave losing inline activities, children and Nexus operations running until the run ends, and never cancel a bound `promise` for losing a round. For a child's lifecycle at parent close, use `parent_close_policy`. Cancellation: `temporal-developer` `references/python/patterns.md` § Cancellation Handling.
- An empty case body → the winner's `claim` or `await` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `wait` ticket per message case each iteration.
