# condition

## DSL

```twf
workflow ClusterManager(config: Config):
    state:
        condition clusterStarted

    # ... later in body:
    set clusterStarted

    # ... elsewhere:
    await clusterStarted
```

## Go

```go
func ClusterManager(ctx workflow.Context, config Config) error {
    clusterStarted := false

    // ... later in body:
    clusterStarted = true

    // ... elsewhere:
    err := workflow.Await(ctx, func() bool { return clusterStarted })
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
- Conditions in `await one:` become selector cases via `workflow.AwaitWithTimeout` or a separate goroutine — see [await-one.md](./await-one.md)

## Pitfalls

- **Indefinite blocking.** `workflow.Await` blocks until the condition returns `true`. If the condition is never set (logic bug, missing signal handler, unreachable code path), the workflow hangs indefinitely. Consider using `workflow.AwaitWithTimeout` when a bounded wait is appropriate
- **Time-based conditions are unreliable.** `workflow.Await(ctx, func() bool { return workflow.Now(ctx).After(deadline) })` may never return — the condition is only re-evaluated on workflow state transitions (signals, activity completions, etc.), not on wall-clock time. Use `workflow.Sleep` or `workflow.NewTimer` for time-based waits
- `workflow.Await` returns `*CanceledError` if the context is cancelled
