# close

| DSL | Python |
|-----|--------|
| `close complete(Result{status: "done"})` | `return Result(status="done")` |
| `close complete` (no return type) | `return` |
| `close fail(OrderResult{status: "cancelled"})` | `raise ApplicationError("order cancelled", OrderResult(status="cancelled"), type="OrderCancelled")` |
| `close continue_as_new(userId, user)` | `workflow.continue_as_new(args=[user_id, user])` — same workflow, new args |

- `ApplicationError(message, *details, type=…, non_retryable=…)` from `temporalio.exceptions` (`temporalio/exceptions.py:142`); `continue_as_new` from `temporalio.workflow` (`temporalio/workflow/_workflow_ops.py:846`), one arg as `arg`, several as `args=[…]`.
- `continue_as_new` never returns (`NoReturn`): it raises to end the run. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: `temporal-developer` `references/python/error-handling.md` § Application Errors, § Non-Retryable Errors, § Workflow Failure.
