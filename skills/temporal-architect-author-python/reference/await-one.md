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

The SDK deviates from spec 06 by default: a message case, or a condition a handler sets, beats a timer or result listed before it when both become ready in one activation (#474). An activation applies its signals and updates and runs the workflow before it resolves timers, activities, children and Nexus operations (`temporalio/worker/_workflow_instance.py:481-535`), so the code after `wait_condition` sees only the message case ready. A message case listed first, or two message cases, already follow listed order.

Where a design depends on listed order, turn on the SDK's flag 2, `PROCESS_WORKFLOW_ACTIVATION_JOBS_AS_SINGLE_BATCH`, which applies every job before the workflow runs. 1.35.0 has no public switch: the flag is off by default, with a TODO to turn it on in a later release (`_workflow_instance.py:4196-4201`), and the only way on is the worker's private hook, called before `run()` (`temporalio/worker/_worker.py:773-782`):

```python
from temporalio.worker._workflow_instance import _WorkflowLogicFlag

worker = Worker(client, task_queue=TASK_QUEUE, workflows=[Order])
worker._set_default_workflow_logic_flag(
    _WorkflowLogicFlag.PROCESS_WORKFLOW_ACTIVATION_JOBS_AS_SINGLE_BATCH, enabled=True
)
```

Both names are private and may change in any release. A run records the flag in its history when first used, so its replay keeps the order (`_workflow_instance.py:2320-2326`).

## Notes

- **Losing cases are not cancelled**, as spec 06 says; activity, child and Nexus tasks keep running until the run ends, and `.cancel()` on one would request its cancellation. Cancel a losing timer: otherwise it fires later and adds a workflow task. For a child's lifecycle at parent close, use `parent_close_policy`. Cancellation: `temporal-developer` `references/python/patterns.md` § Cancellation Handling.
- An empty case body → the winner's `claim` or `await` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `wait` ticket per message case each iteration.
