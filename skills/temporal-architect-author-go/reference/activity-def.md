# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
    result = validate(order)
    return result
```

```go
func (a *Activities) ValidateOrder(ctx context.Context, order Order) (ValidateResult, error) {
    return a.validator.Validate(ctx, order)
}
```

- Stdlib `context.Context`, not `workflow.Context`. `error` is always the last return; no DSL return type → `func (...) Name(ctx context.Context, params...) error`.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches `ctx` only if the activity heartbeats ([heartbeat.md](./heartbeat.md)). A long-running activity must heartbeat and check `ctx.Done()`; otherwise its goroutine keeps running after Temporal has recorded the timeout.

## Activity Implementation Pattern

Generate all four pieces:

1. **Activity struct** — one interface field per external dependency.
2. **Activity methods** — thin translation: validate input, call the interface, translate output.
3. **Interfaces** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real SDK integration: client construction, request/response conversion, error handling.

Methods and interfaces are mechanical; concrete implementations need the SDK knowledge from dependency resolution.
