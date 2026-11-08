# activity call

```twf
activity ValidateOrder(order) -> validated
```

```python
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities import OrderActivities

validated = await workflow.execute_activity_method(
    OrderActivities.validate_order, order, start_to_close_timeout=timedelta(minutes=1)
)
```

- `workflow.execute_activity(fn, …)` for a module function, `workflow.execute_activity_method(Cls.method, …)` for a method of an activities class ([activity-def.md](./activity-def.md)) (`temporalio/workflow/_activities.py:482,1023`). Import the activities under `imports_passed_through()`: `temporal-developer` `references/python/gotchas.md` § Importing Activities into Workflow Files.
- The function passed is the activity type it schedules: its `@activity.defn` name, never the Python name. A string name schedules untyped.
- One argument is `arg`; several are `args=[a, b]`, one payload each (`_arg_or_args`, `temporalio/common.py:1345`).
- A failed activity raises `ActivityError` at the `await`; let it propagate unless the `.twf` handles it.
- Options are the call's keyword arguments ([options.md](./options.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: pass `task_queue=` from the family's queue function, where the queue's inputs are, and set `schedule_to_start_timeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
