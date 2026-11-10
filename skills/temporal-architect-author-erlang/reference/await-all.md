# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	workflow ShipOrder(order) -> shipment
```

```erlang
Reserve = start_activity(~"ReserveInventory", [Order], [{start_to_close_timeout, {1, minute}}]),
Ship = start_child_workflow(TaskQueue, ~"ShipOrder", [
    {input, [Order]}, {workflow_id, <<Wid/binary, "/ShipOrder">>}
]),
case wait_all([Reserve, Ship]) of
    [#{state := completed, result := [Inventory]}, #{state := completed, result := [Shipment]}] ->
        %% ... the rest of the workflow, using Inventory and Shipment
        ok;
    [#{state := R}, #{state := S}] ->
        fail_workflow_execution(#{
            message => iolist_to_binary(io_lib:format("ReserveInventory ~p, ShipOrder ~p", [R, S]))
        })
end
```

One `wait_all/1` over every branch's [promise](./promise.md) handle (`temporal_sdk/temporal_sdk_workflow.erl:2706-2720`), returning their data maps in listed order. Spec 06's branch-failure rule, and why `wait_all` never fails early: [author-elixir await-all.md](../../temporal-architect-author-elixir/reference/await-all.md). Match `completed` for every branch in one `case` clause, and close any other outcome with `fail_workflow_execution/1` ([activity-call.md](./activity-call.md)).

- A timer branch is its handle, `start_timer(D)`. A signal branch is `P = corpus_arrivals:promise(~"X")`, bound before the `wait_all` and taken after it with `corpus_arrivals:await(P)` ([await-signal.md](./await-signal.md)).
- A `detach` branch is its child started with `{awaitable_event, start}` and `'PARENT_CLOSE_POLICY_ABANDON'` ([detach.md](./detach.md)).
- Nexus branches are unsupported ([author-elixir nexus.md](../../temporal-architect-author-elixir/reference/nexus.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```erlang
Results = wait_all([
    start_activity(~"ProcessBatchItem", [I], [{start_to_close_timeout, {1, minute}}])
 || I <- Items
]),
case lists:all(fun(#{state := S}) -> S =:= completed end, Results) of
    true ->
        %% ... the rest of the workflow
        ok;
    false ->
        fail_workflow_execution(#{message => ~"ProcessBatchItem failed"})
end
```

Each call gets its own awaitable ID ([author-elixir § Fan-out](../../temporal-architect-author-elixir/reference/await-all.md#fan-out)). A child per item needs its own `workflow_id` ([workflow-call.md](./workflow-call.md)).
