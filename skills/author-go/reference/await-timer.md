# await timer

## DSL

```twf
await timer(5m)
```

## Go

```go
err := workflow.Sleep(ctx, 5*time.Minute)
if err != nil {
    return Result{}, err
}
```

## Notes

- Duration units: `s` → `time.Second`, `m` → `time.Minute`, `h` → `time.Hour`, `d` → `24*time.Hour`
- Variable durations: `await timer(backoff)` → use the variable directly: `workflow.Sleep(ctx, backoff)`
- Inside `await one:`, timers use `workflow.NewTimer` instead — see [await-one.md](./await-one.md)

## Pitfalls

- `workflow.Sleep` returns `*CanceledError` when the context is cancelled (either by `workflow.WithCancel` or by external workflow cancellation). Do not treat this as a generic failure — check for `*temporal.CanceledError` to enable clean cancellation handling:
  ```go
  err := workflow.Sleep(ctx, duration)
  if err != nil {
      if temporal.IsCanceledError(err) {
          // clean cancellation — run cleanup logic
      }
      return Result{}, err
  }
  ```
