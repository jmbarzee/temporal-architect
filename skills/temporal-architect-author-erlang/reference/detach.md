# detach

The spec guarantees only that a detached call starts, outlives its caller, and is never observed (`twf spec statement-syntax`). The mechanics are [author-elixir's detach.md](../../temporal-architect-author-elixir/reference/detach.md): wait for the start, never the result, and keep the caller's close from reaching it; its cancellation never can.

```twf
detach workflow Archive(items)
```

```erlang
case start_child_workflow(TaskQueue, ~"Archive", [
    {input, [Items]},
    {workflow_id, <<Wid/binary, "/Archive">>},
    {parent_close_policy, 'PARENT_CLOSE_POLICY_ABANDON'},
    {awaitable_event, start},
    wait
]) of
    #{state := initiate_failed} ->
        fail_workflow_execution(#{message => "Archive did not start"});
    #{} ->
        %% Never wait for the result; let the caller close while the child runs.
        await_open_before_close(false)
end
```

- `{parent_close_policy, 'PARENT_CLOSE_POLICY_ABANDON'}` keeps the caller's close from reaching the child, and `{awaitable_event, start}` with `wait` returns at its start, its failed start, or a later state it already reached (`temporal_sdk/temporal_sdk_workflow.erl:261-286`).
- **On `initiate_failed`, close with `fail_workflow_execution/1`** (`temporal_sdk/temporal_sdk_workflow.erl:2236-2240`), so a failed start fails the caller. Any other state means the child started. Match it in a `case`, never with `=`: a failed match fails only the workflow task.
- **`await_open_before_close(false)`** (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`) keeps the caller's close from waiting for the child's whole run.
- **Cancellation is ABANDON by construction**: the SDK has no command that cancels a child (`temporal_sdk/temporal_sdk_workflow.erl:32`).
- A client start, `temporal_sdk:start_workflow/4`, has no parent: it starts the run and returns, and the caller never reads the result ([workflow-def.md](./workflow-def.md#id_scheme)).

```twf
detach nexus GreeterEndpoint GreeterService.Greet(friend)
```

Unsupported: Nexus is not implemented ([author-elixir § detach](../../temporal-architect-author-elixir/reference/detach.md)).
