# close

| DSL | Go |
|-----|----|
| `close complete(Result{status: "done"})` | `return Result{Status: "done"}, nil` |
| `close complete` (no return type) | `return nil` |
| `close fail(OrderResult{status: "cancelled"})` | `return OrderResult{}, temporal.NewApplicationError("order cancelled", "OrderCancelled", OrderResult{Status: "cancelled"})` |
| `close continue_as_new(userId, user)` | `return workflow.NewContinueAsNewError(ctx, UserEntity, userId, user)` — same workflow function, new args |

- `temporal.NewApplicationError(msg, errType, details...)` — `errType` lets callers distinguish failures; pass the DSL value as `details` to carry structured data across the workflow boundary. Retryable: triggers the workflow's retry policy, if one is configured.
- `temporal.NewNonRetryableApplicationError(msg, errType, cause, details...)` — fails immediately regardless of retry policy. Use for permanent failures (invalid input, business-rule violations).
- Avoid `fmt.Errorf` / `errors.New` at the workflow boundary — callers can neither distinguish the type nor extract details.
