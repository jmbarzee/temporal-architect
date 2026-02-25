# activity definition

## DSL

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
    result = validate(order)
    return result
```

## Go

```go
func ValidateOrder(ctx context.Context, order Order) (ValidateResult, error) {
    result, err := validate(ctx, order)
    if err != nil {
        return ValidateResult{}, err
    }
    return result, nil
}
```

## Notes

- Activities use `context.Context` (stdlib), not `workflow.Context`
- Every activity returns `error` as the last return value
- No return type in DSL → `func Name(ctx context.Context, params...) error`
- Activity bodies in `.twf` are pseudocode — ask the user about real implementation logic when it's ambiguous
- In practice, activities are methods on a struct with injected dependencies — see [Activity Implementation Pattern](#activity-implementation-pattern) below

## Activity Implementation Pattern

Activities follow a thin-wrapper pattern with dependency injection:

1. **Activity struct** holds interfaces as fields (one per external dependency)
2. **Activity methods** are thin translation layers: validate inputs, call the interface, translate the output
3. **Interfaces** are shaped by what activities need, informed by real SDK capabilities from the dependency map (see [dependency-resolution.md](./dependency-resolution.md))
4. **Concrete implementations** of those interfaces contain the real SDK integration — client construction, request/response conversion, error handling

The skill generates all four pieces. Activity methods and interfaces are mechanical. Concrete implementations require SDK knowledge from the dependency resolution step.

## Pitfalls

- **Context cancellation.** The activity's `context.Context` is a real stdlib context subject to cancellation. When Temporal times out or cancels an activity, the context is cancelled — but only if the activity calls `activity.RecordHeartbeat`. Without heartbeating, the activity goroutine never learns about cancellation and keeps running until it returns on its own
- Long-running activities must check `ctx.Done()` or `ctx.Err()` to respect cancellation:
  ```go
  select {
  case <-ctx.Done():
      return Result{}, ctx.Err()
  default:
      // continue processing
  }
  ```
- Activities that ignore `ctx.Done()` waste resources after timeout — the goroutine continues executing even though Temporal has already recorded the failure
