# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```python
handle_a = workflow.start_activity(process_a, items.a, start_to_close_timeout=timedelta(minutes=1))
# ... do other work ...
result_a = await handle_a
```

Every promise is an `asyncio.Task`, so `await` gives its result or raises its failure.

| `promise p <- …` | Python |
|------------------|--------|
| `activity` | `workflow.start_activity(…)`, an `ActivityHandle` task (`temporalio/workflow/_activities.py:62`) |
| `workflow` | `asyncio.create_task(workflow.execute_child_workflow(W.run, …))`; a child the design also signals is `await workflow.start_child_workflow(W.run, …)`, a `ChildWorkflowHandle` task (`temporalio/workflow/_workflow_ops.py:54`) |
| `timer(5m)` | `asyncio.create_task(workflow.sleep(timedelta(minutes=5)))` |
| `nexus …` | `asyncio.create_task(client.execute_operation(Svc.op, …))` |
| `signal Approve` / `update Review` | `self.approves.take()` |

- A promise on a signal or update begins waiting at its binding, not at its `await`: `take` is a plain `def` that draws its ticket from the message's `Arrivals` and creates the task ([await-signal.md](./await-signal.md)), as the corpus's `approval = self.approves.take()` does. An `async def take` would return a coroutine that draws nothing until its `await`, so a waiter that began later could take first.
- In `await one:`, a promise is a `.done()` case ([await-one.md](./await-one.md#cases)).
