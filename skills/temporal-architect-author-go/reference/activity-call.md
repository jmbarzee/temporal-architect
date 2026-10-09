# activity call

```twf
activity ValidateOrder(order) -> validated
```

```go
var validated ValidateResult
err := workflow.ExecuteActivity(ctx, ValidateOrder, order).Get(ctx, &validated)
if err != nil {
    return Result{}, err
}

// Struct pattern (activity-def.md): method reference via nil pointer
var a *Activities
err = workflow.ExecuteActivity(ctx, a.ValidateOrder, order).Get(ctx, &validated)
```

- Pass the function or method reference, never the string name — a string loses compile-time checking and breaks test discovery.
- No return value: `.Get(ctx, nil)`; still check `err`.
- `ctx` must carry `ActivityOptions` ([options.md](./options.md)). An `options:` block on the call becomes a per-call `workflow.WithActivityOptions` context.
