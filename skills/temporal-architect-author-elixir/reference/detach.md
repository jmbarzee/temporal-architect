# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). In Elixir that is: wait for the start, never the result, and keep the caller's close from reaching it; its cancellation never can.

```twf
detach workflow Archive(items)
```

```elixir
case start_child_workflow(context.worker_opts.task_queue, "Archive",
       input: [items],
       workflow_id: context.task.workflow_execution.workflow_id <> "/Archive",
       parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON,
       awaitable_event: :start,
       wait: true
     ) do
  %{state: :initiate_failed} ->
    fail_workflow_execution(%{message: "Archive did not start"})

  %{} ->
    # Never wait for the result; let the caller close while the child runs.
    await_open_before_close(false)
end
```

- `parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON` keeps the caller's close from reaching the child; `awaitable_event: :start, wait: true` returns at the child's start, its failed start, or a later state the child has already reached (`temporal_sdk/temporal_sdk_workflow.erl:261-286`, `api/awaitable/temporal_sdk_api_awaitable_index.erl:343-352`).
- **On `:initiate_failed`, close with `fail_workflow_execution/1`** (`temporal_sdk/temporal_sdk_workflow.erl:2236-2240`), so a failed start fails the caller. Any other state means the child started: `:started`, or its close state when it finished before the caller resumed (`api/awaitable/temporal_sdk_api_awaitable_index.erl:343-352,1210-1260`). Never a pattern match: a failed match raises, and a raise fails only the workflow task, which the server retries while the caller stays open (`executor/temporal_sdk_executor_workflow.erl:1370-1386,2256-2290`).
- **`await_open_before_close(false)`** (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`): by default the caller's close waits until every open child closes (`executor/temporal_sdk_executor_workflow.erl:1106-1110`), which would hold the caller for the child's whole run.
- **Cancellation is ABANDON by construction**: it never reaches the child, since the SDK has no command that cancels a child or an external workflow (`temporal_sdk/temporal_sdk_workflow.erl:32`).
- A client start, `TemporalSdk.start_workflow/4`, has no parent: it starts the run and returns, and the caller never reads the result ([workflow-def.md](./workflow-def.md#id_scheme)).

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

Unsupported: Nexus is not implemented (`TODO.md:15`; [nexus.md](./nexus.md)), and there is no `cancel_nexus` (`temporal_sdk/temporal_sdk_workflow.erl:26`).
