# close

| DSL | Go |
|-----|----|
| `close complete(Result{status: "done"})` | `return Result{Status: "done"}, nil` |
| `close complete` (no return type) | `return nil` |
| `close fail(OrderResult{status: "cancelled"})` | `return OrderResult{}, temporal.NewApplicationError("order cancelled", "OrderCancelled", OrderResult{Status: "cancelled"})` |
| `close continue_as_new(userId, user)` | `return workflow.NewContinueAsNewError(ctx, UserEntity, userId, user)` — same workflow function, new args |

- `continue_as_new` keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: `temporal-developer` `references/go/error-handling.md` § Application Errors, § Non-Retryable Errors, § Workflow Failure.
