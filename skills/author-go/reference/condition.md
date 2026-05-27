# condition

## DSL

```twf
workflow JobCoordinator(config: JobConfig):
    state:
        condition jobReady

    # ... later in body:
    set jobReady

    # ... elsewhere:
    await jobReady
```

## Go

```go
func JobCoordinator(ctx workflow.Context, config JobConfig) error {
    jobReady := false

    // ... later in body:
    jobReady = true

    // ... elsewhere:
    err := workflow.Await(ctx, func() bool { return jobReady })
    if err != nil {
        return err
    }
}
```

## Notes

- `condition name` in `state:` → `name := false` (a `bool` variable)
- `set name` → `name = true`
- `unset name` → `name = false`
- `await name` → `workflow.Await(ctx, func() bool { return name })`
- Conditions in `await one:` become selector cases via a goroutine that awaits the condition and sends to a channel — see the "condition promise" pattern in [await-one.md](./await-one.md)

## Pitfalls

- **Never poll with `workflow.Sleep` in a loop.** Each `Sleep` generates 2 history events (timer-started + timer-fired). A tight polling loop can exhaust the 51,200 event limit and force the workflow into a non-recoverable state. Always use `workflow.Await` — it generates zero history events and re-evaluates on every state transition:
  ```go
  // WRONG: polling loop — 2 history events per iteration
  for !ready {
      workflow.Sleep(ctx, 5*time.Second)
  }

  // RIGHT: zero history events, wakes on any state change
  workflow.Await(ctx, func() bool { return ready })
  ```
- **Indefinite blocking.** `workflow.Await` blocks until the condition returns `true`. If the condition is never set (logic bug, missing signal handler, unreachable code path), the workflow hangs indefinitely. Consider using `workflow.AwaitWithTimeout` when a bounded wait is appropriate
- **Time-based conditions are unreliable.** `workflow.Await(ctx, func() bool { return workflow.Now(ctx).After(deadline) })` may never return — the condition is only re-evaluated on workflow state transitions (signals, activity completions, etc.), not on wall-clock time. Use `workflow.Sleep` or `workflow.NewTimer` for time-based waits
- `workflow.Await` returns `*CanceledError` if the context is cancelled
