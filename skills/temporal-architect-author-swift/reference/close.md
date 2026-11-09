# close

| DSL | Swift |
|-----|------|
| `close complete(Result{status: "done"})` | `return Result(status: "done")` |
| `close complete` (no return type) | `return` |
| `close fail(OrderResult{status: "cancelled"})` | `throw ApplicationError(message: "order cancelled", details: [try context.payloadConverter.convertValue(OrderResult(status: "cancelled"))], type: "OrderCancelled")` |
| `close continue_as_new(next, limit)` | `throw try await context.makeContinueAsNewError(options: .init(), input: Input(next: next, limit: limit))` — same workflow, new input |

- `ApplicationError(message:cause:stackTrace:details:type:…)` (`Temporal/Errors/Failures/ApplicationError.swift:58-66`) carries its details as raw payloads, so a value goes through `context.payloadConverter` (`Temporal/Worker/Workflow/WorkflowContext.swift:137`). Only a `TemporalFailureError` such as `ApplicationError` fails the run: any other error fails the workflow task, which retries (`Temporal/Worker/Workflow/WorkflowInstance.swift:994-1012`).
- `context.makeContinueAsNewError(options:input:)` (`WorkflowContext.swift:1056-1065`) returns the error that, thrown out of `run`, ends this run and starts the next (`WorkflowInstance.swift:996-998`). Pass the workflow's one input: its parameter pack accepts several values, but each is its own payload, and the next run decodes exactly one (`WorkflowInstance.swift:232-239`). It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Retryable vs non-retryable errors: [`Examples/ErrorHandling`](https://github.com/apple/swift-temporal-sdk/tree/1.5.0/Examples/ErrorHandling) § Non-Retryable Errors.
