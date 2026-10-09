# await timer

```twf
await timer(5m)
```

```go
err := workflow.Sleep(ctx, 5*time.Minute)
if err != nil {
    if temporal.IsCanceledError(err) {
        // clean cancellation — run cleanup logic
    }
    return Result{}, err
}
```

- Units: `s`/`m`/`h` → `time.Second`/`time.Minute`/`time.Hour`; `d` → `24*time.Hour`. A variable duration passes straight through: `workflow.Sleep(ctx, backoff)`.
- `Sleep` returns `*temporal.CanceledError` when `ctx` is cancelled (`workflow.WithCancel` or external cancellation) — treat it as clean cancellation, not a generic failure.
- Inside `await one:` or a `promise`, use `workflow.NewTimer` (a future) instead — see [await-one.md](./await-one.md).
