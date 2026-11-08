# close

| DSL | C# |
|-----|----|
| `close complete(Result{status: "done"})` | `return new Result("done");` |
| `close complete` (no return type) | `return;` |
| `close fail(OrderResult{status: "cancelled"})` | `throw new ApplicationFailureException("order cancelled", errorType: "OrderCancelled", details: new object?[] { new OrderResult("cancelled") });` |
| `close continue_as_new(userId, user)` | `throw Workflow.CreateContinueAsNewException((UserEntity wf) => wf.RunAsync(userId, user));` — same workflow, new args |

- `ApplicationFailureException` is in `Temporalio.Exceptions` (`Exceptions/ApplicationFailureException.cs:30-36`). Only a `FailureException` (or cancellation) fails the run: any other exception fails the workflow task, which retries (`Worker/WorkflowInstance.cs:1208-1215`).
- `Workflow.CreateContinueAsNewException` (`Workflows/Workflow.cs:294-321`) builds the exception the run throws to end itself. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: `temporal-developer` `references/dotnet/error-handling.md` § Application Failures, § Workflow Failure.
