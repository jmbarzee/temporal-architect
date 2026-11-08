# close

| DSL | Java |
|-----|------|
| `close complete(Result{status: "done"})` | `return new Result("done");` |
| `close complete` (no return type) | `return;` |
| `close fail(OrderResult{status: "cancelled"})` | `throw ApplicationFailure.newFailure("order cancelled", "OrderCancelled", new OrderResult("cancelled"));` |
| `close continue_as_new(next, limit)` | `return Workflow.newContinueAsNewStub(Counter.class).run(next, limit);` — same workflow, new args |

- `ApplicationFailure.newFailure(message, type, details...)` is in `io.temporal.failure` (`failure/ApplicationFailure.java:66`). Only a `TemporalFailure` (or a type listed in `WorkflowImplementationOptions.setFailWorkflowExceptionTypes`) fails the run: any other exception fails the workflow task, which retries (`internal/sync/WorkflowExecutionHandler.java:129-145`).
- `Workflow.newContinueAsNewStub(Class)` (`workflow/Workflow.java:575`) gives a stub whose workflow method never returns: the call ends this run and starts the next. `Workflow.continueAsNew(args...)` (`:585`) is the untyped form. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: `temporal-developer` `references/java/error-handling.md` § Application Errors, § Non-Retryable Errors, § Workflow Failure; continue-as-new: `references/java/patterns.md` § Continue-as-New.
