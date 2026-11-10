# activity call

```twf
activity ValidateOrder(order) -> validated
```

```erlang
case start_activity(~"ValidateOrder", [Order], [{start_to_close_timeout, {1, minute}}, wait]) of
    #{state := completed, result := [Validated]} ->
        %% ... the rest of the workflow, using Validated
        ok;
    #{state := State} ->
        fail_workflow_execution(#{message => <<"ValidateOrder ", (atom_to_binary(State))/binary>>})
end
```

- `start_activity(Type, Input, Opts)` (`temporal_sdk/temporal_sdk_workflow.erl:1657`) schedules the activity by the `.twf` name as a binary, `~"ValidateOrder"`: an atom would send its module name. `Input` is the positional payload list; with `wait` it blocks until the activity closes and returns its data map, the result in `result := [Validated]`.
- **A closed activity never raises**: it returns its state, `completed`, `failed`, `timedout` or `canceled`. Match `completed` in a `case`, and close every other state with `fail_workflow_execution/1`, unless the `.twf` handles it; never `#{state := completed} = …`, whose failed match fails only the workflow task. The states and why: [author-elixir activity-call.md](../../temporal-architect-author-elixir/reference/activity-call.md).
- Options are the call's proplist ([options.md](./options.md)).
- Bound to a promise, the call is `P = start_activity(~"ValidateOrder", [Order], Opts)`, without `wait`: the handle is the promise, and `wait(P)` is the `await` ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family ([worker.md](./worker.md#per-instance-worker-families)).
