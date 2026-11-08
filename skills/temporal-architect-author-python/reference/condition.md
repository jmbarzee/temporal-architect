# condition

| DSL | Python |
|-----|--------|
| `state:` `condition jobReady` | `self.job_ready = False` in `__init__` |
| `set jobReady` / `unset jobReady` | `self.job_ready = True` / `self.job_ready = False` |
| `await jobReady` | `await workflow.wait_condition(lambda: self.job_ready)` |

- `workflow.wait_condition` (`temporalio/workflow/_context.py:1028`).
- A condition as an `await one:` case, a bounded wait included, → its `bool` in the race's predicate ([await-one.md](./await-one.md#cases)), not `wait_condition(fn, timeout=…)`, which raises on timeout instead of listing the timer as a case.
