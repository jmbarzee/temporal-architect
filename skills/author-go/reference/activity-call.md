# activity call

## DSL

```twf
activity ValidateOrder(order) -> validated
```

## Go

```go
var validated ValidateResult
err := workflow.ExecuteActivity(ctx, ValidateOrder, order).Get(ctx, &validated)
if err != nil {
    return Result{}, err
}
```

## With inline options

### DSL

```twf
activity ValidateOrder(order) -> validated
    options:
        start_to_close_timeout: 30s
```

### Go

```go
actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
    StartToCloseTimeout: 30 * time.Second,
})
var validated ValidateResult
err := workflow.ExecuteActivity(actCtx, ValidateOrder, order).Get(ctx, &validated)
if err != nil {
    return Result{}, err
}
```

For the full options reference, see [options.md](./options.md).

## Notes

- No return value: omit the `Get` target variable, still check `err`
- The activity function is passed by reference (not a string) — `workflow.ExecuteActivity(ctx, FuncName, args...)`
- When using the struct method pattern (see [Activity Implementation Pattern](./activity-def.md#activity-implementation-pattern)), pass a method reference via nil pointer: `var a *Activities; workflow.ExecuteActivity(ctx, a.ValidateOrder, order)`
- `ctx` must carry activity options; see [options.md](./options.md) for setting `ActivityOptions`

## When to use inline options vs shared context

- **Shared default context** (set `ActivityOptions` on `ctx` once near the top of the workflow): use when most activities share the same timeout and retry settings. This is the common case
- **Per-activity inline options** (create a new context with `workflow.WithActivityOptions`): use when a specific activity needs different timeouts or retry behavior (e.g., a long-running activity alongside short ones)
- When the DSL has an `options:` block on an activity call, always use per-activity inline options

## Pitfalls

- `ctx` must carry `ActivityOptions` with at least one of `StartToCloseTimeout` or `ScheduleToCloseTimeout`. Omitting both produces a runtime error when the activity is scheduled
