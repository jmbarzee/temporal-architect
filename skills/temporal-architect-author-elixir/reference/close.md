# close

| DSL | Elixir |
|-----|--------|
| `close complete(Result{status: "done"})` | `complete_workflow_execution([%{"status" => "done"}])` |
| `close complete` (no return type) | `complete_workflow_execution([])` |
| `close fail(OrderResult{status: "cancelled"})` | `fail_workflow_execution(%{message: "order cancelled", type: "OrderCancelled", details: [%{"status" => "cancelled"}]})` |
| `close continue_as_new(next, limit)` | `continue_as_new_workflow(context.worker_opts.task_queue, "Counter", input: [next, limit])` — same workflow, new args |

- `complete_workflow_execution(result)` takes the result's payload list (`temporal_sdk/temporal_sdk_workflow.erl:2218-2226`). Make it the last statement of `execute/2`, whose own return value is ignored: a run whose executions all end without a close completes with `set_workflow_result/1`'s value, `[]` unless set (`executor/temporal_sdk_executor_workflow.erl:2069-2079`).
- `fail_workflow_execution(failure)` takes an application failure map: `message`, `type`, `non_retryable`, `details` (a payload list) and more (`temporal_sdk/temporal_sdk_workflow.erl:2236-2250`, `temporal_sdk/temporal_sdk.erl:156-167`). It is the only way to fail the run: a raise fails just the workflow task, which the server retries, and `handle_failure/4` only shapes that task failure (`executor/temporal_sdk_executor_workflow.erl:1370-1386,2256-2290`).
- `continue_as_new_workflow(task_queue, type, opts)` (`temporal_sdk/temporal_sdk_workflow.erl:2266-2300`) takes the **task queue positionally**, the caller's as `context.worker_opts.task_queue`, and the `.twf` name as a string; the new args are `input:`. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged so the ID still matches its inputs.
- Errors and continue-as-new idioms: [idioms.md § errors](./idioms.md#errors).
