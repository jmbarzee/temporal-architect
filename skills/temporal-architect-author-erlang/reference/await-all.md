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
case wait_branches([Reserve, Ship]) of
    {ok, [#{result := [Inventory]}, #{result := [Shipment]}]} ->
        %% ... the rest of the workflow, using Inventory and Shipment
        ok;
    {failed, Branch} ->
        await_open_before_close(false),
        fail_workflow_execution(failure(Branch))
end
```

Every branch is a [promise](./promise.md) handle. `wait_branches/1`, below, closes at the first failed branch, and `failure/1` keeps that branch's failure as the run's. Spec 06's branch-failure rule, why `wait_all` cannot map it, and why `await_open_before_close(false)` precedes the close: [author-elixir § Branch failure](../../temporal-architect-author-elixir/reference/await-all.md#branch-failure).

```erlang
-define(FAILED, [failed, timedout, canceled, terminated, initiate_failed]).

%% The branches' data maps in listed order, or the first branch to fail: the one that failed in
%% the earliest workflow task, the first listed among those. The others keep running.
wait_branches(Handles) ->
    Matches = [is_awaited(H) || H <- Handles],
    Failed = [
        {corpus_arrivals:task_of(Eid), M}
     || {true, #{state := S, event_id := Eid} = M} <- Matches, lists:member(S, ?FAILED)
    ],
    case Failed of
        [_ | _] ->
            {failed, element(2, hd(lists:keysort(1, Failed)))};
        [] ->
            case [H || {H, {false, _}} <- lists:zip(Handles, Matches)] of
                [] -> {ok, [M || {true, M} <- Matches]};
                Open -> wait_any(Open), wait_branches(Handles)
            end
    end.

%% The branch's message, application type and details, the message as a charlist.
failure(#{failure := F}) ->
    Info =
        case F of
            #{failure_info := {application_failure_info, I}} -> maps:with([type, details], I);
            #{} -> #{}
        end,
    Info#{message => unicode:characters_to_list(maps:get(message, F, ~""))};
failure(#{state := State}) ->
    #{message => atom_to_list(State)}.
```

`lists:keysort/2` is stable, so among branches that failed in one task the first listed surfaces. `failure/1` passes the message on as the charlist `fail_workflow_execution/1` needs ([close.md](./close.md)).

- A timer branch is its handle, `start_timer(D)`. A signal branch is `P = corpus_arrivals:promise(~"X")`, bound before `wait_branches` and taken after it with `corpus_arrivals:await(P)` ([await-signal.md](./await-signal.md)).
- A `detach` branch stays out of `wait_branches`: start it before the call, with `wait`, and close on `initiate_failed`, as [detach.md](./detach.md) does. Why: [author-elixir await-all.md](../../temporal-architect-author-elixir/reference/await-all.md).
- Nexus branches are unsupported ([author-elixir nexus.md](../../temporal-architect-author-elixir/reference/nexus.md)), and so is the update-handler form. In a signal body the failure fails the run ([signal-handler.md](./signal-handler.md)).

[`corpus/failure/erlang/failure_job.erl`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/erlang/failure_job.erl) is the worked example; its suite asserts the run fails with `Reject`'s failure while `Process` runs, with no cancel request in the history.

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```erlang
Handles = [
    start_activity(~"ProcessBatchItem", [I], [{start_to_close_timeout, {1, minute}}])
 || I <- Items
],
case wait_branches(Handles) of
    {ok, _Results} ->
        %% ... the rest of the workflow
        ok;
    {failed, Branch} ->
        await_open_before_close(false),
        fail_workflow_execution(failure(Branch))
end
```

Each call gets its own awaitable ID ([author-elixir § Fan-out](../../temporal-architect-author-elixir/reference/await-all.md#fan-out)). A child per item needs its own `workflow_id` ([workflow-call.md](./workflow-call.md)).
