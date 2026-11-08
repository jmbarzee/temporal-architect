# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```python
# in __init__:
self.approves: Arrivals[str] = Arrivals()

@workflow.signal(name="Approve")
def approve(self, approver: str) -> None:
    self.status = "approved"
    self.approves.add(approver)

# in run:
approver = await self.approves.take()
```

Every signal or update the design waits on gets an `Arrivals[T]` attribute, `T` being its one param, a tuple of several (`tuple[str, str]`, unpacked at the take), or `None` for none. Copy the class from the corpus's [`messages/python/arrivals.py`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/python/arrivals.py) into the workflow's directory and import it under `workflow.unsafe.imports_passed_through()`; [`workflows.py`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/python/workflows.py) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take` gives the oldest pending arrival, else waits for the next. Waiters are served in the order they began, by ticket. A bare `wait_condition(lambda: len(self.pending) > 0)` per waiter hands one arrival to two waiters, since every condition is checked in one pass before either pops (`temporalio/worker/_workflow_instance.py:2827-2837`), and a flag holds only one arrival; neither is a `.twf` wait.
- `take` draws its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- An `await one` case uses `wait`, `ready`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- Code after `take` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
