# close

| DSL | Haskell |
|-----|---------|
| `close complete(Result{status: "done"})` | `pure Result {status = "done"}` |
| `close complete` (no return type) | `pure ()` |
| `close fail(OrderResult{status: "cancelled"})` | `throwM ApplicationFailure {type' = "OrderCancelled", message = "order cancelled", nonRetryable = True, details = [encodeJSON OrderResult {status = "cancelled"}], stack = "", nextRetryDelay = Nothing}` |
| `close continue_as_new(userId, user)` | `continueAsNew userEntity defaultContinueAsNewOptions userId user` — same workflow, new args |

- `ApplicationFailure` is `Temporal.Exception`'s (`Exception.hs:436-443`), thrown with `throwM` (`Workflow` is `MonadThrow`, `Workflow/Internal/Monad.hs:301`). **Any exception fails the run**, not the workflow task: one that is not an `ApplicationFailure` goes out as one typed by its Haskell type name, retryable (`WorkflowInstance.hs:995-1000`, `Exception.hs:588-598`). A workflow run is retried only under a workflow retry policy.
- `continueAsNew workflow options args…` (`Workflow.hs:1553-1569`) ends the run by throwing; its result type is the workflow's, so it closes any branch. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs. `defaultContinueAsNewOptions` keeps the task queue, timeouts and retry policy unset (`Workflow/Types.hs:361-398`).
- Retryable vs non-retryable errors: [idioms.md § errors](./idioms.md#errors).
