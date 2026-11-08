# close

| DSL | Ruby |
|-----|------|
| `close complete(Result{status: "done"})` | `return Result.new(status: 'done')` |
| `close complete` (no return type) | `return` |
| `close fail(OrderResult{status: "cancelled"})` | `raise Temporalio::Error::ApplicationError.new('order cancelled', OrderResult.new(status: 'cancelled'), type: 'OrderCancelled')` |
| `close continue_as_new(next, limit)` | `raise Temporalio::Workflow::ContinueAsNewError.new(nxt, limit)` — same workflow, new args |

- `Error::ApplicationError.new(message, *details, type:, non_retryable:)` (`error/failure.rb:69-104`). Only a `Temporalio::Error::Failure`, a `Timeout::Error`, or a type listed by `workflow_failure_exception_type` (or the worker's `workflow_failure_exception_types:`) fails the run: any other exception fails the workflow task, which retries (`internal/worker/workflow_instance.rb:690,705-708`).
- `Workflow::ContinueAsNewError.new(*args)` (`workflow.rb:659-718`), raised from `execute`, ends this run and starts the next with those args; it keeps the workflow ID, so for a schemed workflow pass the scheme's roots unchanged so the ID still matches its inputs. `next` is a Ruby keyword: name the variable otherwise (`nxt`).
- Retryable vs non-retryable errors: `temporal-developer` `references/ruby/error-handling.md` § Application Errors, § Non-Retryable Errors, § Workflow Failure; continue-as-new: `references/ruby/patterns.md` § Continue-as-New.
