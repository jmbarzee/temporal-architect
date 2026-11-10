# close

| DSL | Erlang |
|-----|--------|
| `close complete(Result{status: "done"})` | `complete_workflow_execution([#{~"status" => ~"done"}])` |
| `close complete` (no return type) | `complete_workflow_execution([])` |
| `close fail(OrderResult{status: "cancelled"})` | `fail_workflow_execution(#{message => ~"order cancelled", type => ~"OrderCancelled", details => [#{~"status" => ~"cancelled"}]})` |
| `close continue_as_new(next, limit)` | `continue_as_new_workflow(TaskQueue, ~"Counter", [{input, [Next, Limit]}])` — same workflow, new args |

- `complete_workflow_execution(Result)` takes the result's payload list (`temporal_sdk/temporal_sdk_workflow.erl:2218-2226`); make it the last expression of `execute/2`, whose own value is ignored.
- `fail_workflow_execution(Failure)` takes an application failure map, `message`, `type`, `non_retryable`, `details` (a payload list) and more, with binary values (`temporal_sdk/temporal_sdk.erl:156-167`). It is the only way to fail the run: a raise fails just the workflow task.
- `continue_as_new_workflow(TaskQueue, Type, Opts)` (`temporal_sdk/temporal_sdk_workflow.erl:2266-2300`) takes the **task queue positionally**, the caller's matched out of `Context` ([workflow-def.md](./workflow-def.md)), the `.twf` name as a binary, and the new args as `{input, [...]}`. It keeps the workflow ID; for a schemed workflow, pass the scheme's roots unchanged.
- The mechanics, and why: [author-elixir close.md](../../temporal-architect-author-elixir/reference/close.md). Errors and continue-as-new idioms: [author-elixir idioms.md § errors](../../temporal-architect-author-elixir/reference/idioms.md#errors).
