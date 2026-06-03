# close

## close complete

### DSL

```twf
close complete(Result{status: "done"})
```

### Go

```go
return Result{Status: "done"}, nil
```

## close complete (no value)

### DSL

```twf
close complete
```

### Go

```go
return nil
```

## close fail

### DSL

```twf
close fail(OrderResult{status: "cancelled"})
```

### Go

```go
return OrderResult{}, temporal.NewApplicationError("order cancelled", "OrderCancelled", OrderResult{Status: "cancelled"})
```

## close continue_as_new

### DSL

```twf
close continue_as_new(userId, user)
```

### Go

```go
return workflow.NewContinueAsNewError(ctx, UserEntity, userId, user)
```

## Notes

- `close complete(value)` → `return value, nil`
- `close fail(value)` → return zero value + `temporal.NewApplicationError`. Pass the struct as error details to preserve structured data across workflow boundaries. Use `NewNonRetryableApplicationError` when the failure should not be retried
- `close continue_as_new` passes args to the same workflow function via `workflow.NewContinueAsNewError`
- `close complete` with no args and no return type → `return nil`

## When to use each error type

- **`temporal.NewApplicationError(msg, errType, details...)`** — structured workflow error. The `errType` string enables callers to distinguish error types. Pass the original struct as `details` to preserve data across workflow boundaries. Retryable by default
- **`temporal.NewNonRetryableApplicationError(msg, errType, cause, details...)`** — same as above but the workflow will not be retried. Use for permanent failures (invalid input, business rule violations)
- **Retryable vs non-retryable:** retryable errors trigger the workflow's retry policy (if configured). Non-retryable errors fail the workflow immediately regardless of retry policy
- Plain `fmt.Errorf` or `errors.New` produces an untyped error — callers cannot distinguish error types or extract structured details. Prefer `ApplicationError` for workflow-boundary errors
