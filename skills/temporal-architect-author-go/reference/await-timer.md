# await timer

```twf
await timer(5m)
```

```go
if err := workflow.Sleep(ctx, 5*time.Minute); err != nil {
    return Result{}, err
}
```

- Units: `s`/`m`/`h` → `time.Second`/`time.Minute`/`time.Hour`; `d` → `24*time.Hour`. A variable duration passes straight through: `workflow.Sleep(ctx, backoff)`.
- A cancelled `ctx` returns a `*temporal.CanceledError`: `temporal-developer` `references/go/gotchas.md` § Cancellation.
- Inside `await one:` or a `promise`, use `workflow.NewTimer` (a future) instead — see [await-one.md](./await-one.md).
