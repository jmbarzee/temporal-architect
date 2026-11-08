# await timer

```twf
await timer(5m)
```

```perl
await Temporalio::Workflow::sleep(300);
```

- `Temporalio::Workflow::sleep($seconds)` (`Workflow.pm:339-341`) takes the `.twf` duration in seconds, fractional allowed. A variable duration passes straight through: `await Temporalio::Workflow::sleep($backoff)`. Always fully qualified: a bare `sleep` is the builtin, which the determinism guard rejects ([idioms.md](./idioms.md)).
- It returns the timer's future; cancelling it (`->cancel`) cancels the timer and dies with `Temporalio::Exception::Cancelled` at its `await` (`Workflow.pm:321-331`).
- Inside `await one:` or a `promise`, see [await-one.md](./await-one.md).
