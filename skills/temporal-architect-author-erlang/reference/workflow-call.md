# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```erlang
case start_child_workflow(TaskQueue, ~"ShipOrder", [
    {input, [Order]},
    {workflow_id, <<Wid/binary, "/ShipOrder">>},
    wait
]) of
    #{state := completed, result := [ShipResult]} ->
        %% ... the rest of the workflow, using ShipResult
        ok;
    #{state := State} ->
        fail_workflow_execution(#{message => <<"ShipOrder ", (atom_to_binary(State))/binary>>})
end
```

- `start_child_workflow(TaskQueue, Type, Opts)` (`temporal_sdk/temporal_sdk_workflow.erl:2060-2140`) starts the child by the `.twf` name as a binary: an atom would send its module name (`:2058-2059`). The **task queue is positional**; a child on the caller's queue passes the `TaskQueue` matched out of `Context` ([workflow-def.md](./workflow-def.md)). The args are `{input, [...]}`; with `wait` it blocks until the child closes, the result in `result := [ShipResult]`.
- **A closed child never raises**: match `completed` and close every other state with `fail_workflow_execution/1`, as for an activity ([activity-call.md](./activity-call.md)).
- **Always pass `workflow_id`.** A child with an `id_scheme:` takes its ID function, `{workflow_id, orders_ship_item:id(OrderId, ItemId)}` ([workflow-def.md](./workflow-def.md#id_scheme)); without one, derive it from the caller's `Wid` and something distinct per call.
- The rest is [author-elixir's workflow-call.md](../../temporal-architect-author-elixir/reference/workflow-call.md): `namespace` defaults to `"default"`, a child takes `workflow_id_reuse_policy` only, a qualified callee is the bare `.twf` name on the wire, the child's state is its own, and an unset `parent_close_policy` terminates the child with its parent ([options.md](./options.md#child-workflow-options)).
- Bound to a promise, the call is `P = start_child_workflow(TaskQueue, ~"ShipOrder", Opts)` without `wait`; `wait(P)` is the `await` ([promise.md](./promise.md)), and `{awaitable_event, start}` waits for its start alone. Fire-and-forget is [detach.md](./detach.md).
