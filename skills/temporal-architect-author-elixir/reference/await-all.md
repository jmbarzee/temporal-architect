# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	workflow ShipOrder(order) -> shipment
```

```elixir
reserve = start_activity("ReserveInventory", [order], @activity_opts)
ship = start_child_workflow(task_queue, "ShipOrder", input: [order], workflow_id: wid <> "/ShipOrder")

case wait_branches([reserve, ship]) do
  {:ok, [%{result: [inventory]}, %{result: [shipment]}]} ->
    # ... the rest of the workflow, using inventory and shipment

  {:failed, branch} ->
    await_open_before_close(false)
    fail_workflow_execution(failure(branch))
end
```

- Every branch is a [promise](./promise.md) handle, and `wait_branches/1`, below, returns their data maps in listed order once all complete, or the first branch to fail. Its `failure/1` keeps that branch's failure as the run's ([§ Branch failure](#branch-failure)).
- A timer branch is its handle, `start_timer(d)`, done once `:fired`. A signal branch is `p = Arrivals.promise("X")`, bound before `wait_branches` and taken after it with `Arrivals.await(p)` ([await-signal.md](./await-signal.md)); a signal cannot fail.
- A `detach` branch is its child started with `awaitable_event: :start` and `ABANDON`, which is ready at its start; `:initiate_failed` is its failure ([detach.md](./detach.md)).
- Nexus branches are unsupported ([nexus.md](./nexus.md)), and so is the update-handler form ([update-handler.md](./update-handler.md)). In a signal body, which runs in the main execution ([signal-handler.md](./signal-handler.md)), the failure fails the run, as spec 06 says.

## Branch failure

The first branch to fail fails the `await all` at once, with that failure, and the branches still running are not cancelled (`twf spec statement-syntax`, Await All Block). The mapping below holds for the SDK at the pin, whatever the language.

```elixir
@failed [:failed, :timedout, :canceled, :terminated, :initiate_failed]

# The branches' data maps in listed order, or the first branch to fail: the one that failed in
# the earliest workflow task, the first listed among those. The others keep running.
defp wait_branches(handles) do
  matches = Enum.map(handles, &is_awaited/1)
  failed = for {true, %{state: s, event_id: eid} = m} <- matches, s in @failed, do: {Arrivals.task_of(eid), m}

  cond do
    failed != [] -> {:failed, failed |> Enum.min_by(&elem(&1, 0)) |> elem(1)}
    Enum.all?(matches, &match?({true, _}, &1)) -> {:ok, Enum.map(matches, &elem(&1, 1))}
    true ->
      wait_any(for {h, {false, _}} <- Enum.zip(handles, matches), do: h)
      wait_branches(handles)
  end
end

# The branch's message, application type and details, the message as a charlist.
defp failure(%{failure: f}) do
  info =
    case f do
      %{failure_info: {:application_failure_info, i}} -> Map.take(i, [:type, :details])
      %{} -> %{}
    end

  Map.put(info, :message, to_charlist(Map.get(f, :message, "")))
end

defp failure(%{state: state}), do: %{message: ~c"#{state}"}
```

- **Not `wait_all`.** It is ready only once every branch is (`api/awaitable/temporal_sdk_api_awaitable.erl:87-98`), and a closed branch reports its state rather than raising, so a failure would surface only after every sibling closes.
- **A `wait_any` loop.** `is_awaited/1` reads each handle without blocking (`temporal_sdk/temporal_sdk_workflow.erl:2662-2672`). `wait_any/1` blocks until one handle in its list is ready (`:2722-2736`, `api/awaitable/temporal_sdk_api_awaitable.erl:71-86`), so it gets only the open ones: a ready handle would return at once.
- **The failure cause.** A failed activity or child carries its `failure`, decoded with its application `type` and `details` (`api/awaitable/temporal_sdk_api_awaitable_index.erl:1056-1065,1252-1259`, `api/temporal_sdk_api_failure.erl:54-86`). `fail_workflow_execution/1` takes no cause (`api/temporal_sdk_api_failure.erl:20-33`), so `failure/1` copies those fields. The message goes as a charlist ([close.md](./close.md)).
- **Two failures.** The branch that failed in the earlier workflow task surfaces, and within one task the first listed. `Arrivals.task_of/1` reads the task from the closing event's ID, which a failed branch carries (`api/awaitable/temporal_sdk_api_awaitable_index.erl:1058,1259`). Ranking by task keeps replay on the live run's pick: a round that issued no command can see later events on replay ([await-one.md](./await-one.md)).
- **`await_open_before_close(false)` before the close** (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`). It defaults to true (`worker/temporal_sdk_worker_opts.erl:191`, `executor/temporal_sdk_executor_workflow.erl:135`), which holds the close command back while any activity, timer or child the run started is still open (`executor/temporal_sdk_executor_workflow.erl:1106-1110`, `api/temporal_sdk_api_command.erl:38-45`). Without it, the run would fail only once its slowest sibling closes.
- **What else it frees.** The setting belongs to the run and stays once set (`executor/temporal_sdk_executor_workflow.erl:560-561`), so no later close waits for anything open: losing `await one` cases and detached children end with the run too, as spec 06 has them. A close that needs a branch's result must wait for that branch first. `Arrivals.on` and `detach` already set it ([signal-handler.md](./signal-handler.md), [detach.md](./detach.md)), so in a run with a signal handler the call changes nothing. It never reaches another run. The open branches get no cancel request: an activity is left to run, and a child follows `parent_close_policy`, since the SDK has no command that cancels a child (`temporal_sdk/temporal_sdk_workflow.erl:32`).

[`corpus/failure/elixir/job.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/elixir/job.ex) is the worked example; its test asserts the run fails with `Reject`'s failure while `Process` runs, with no cancel request in the history.

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```elixir
case items |> Enum.map(&start_activity("ProcessBatchItem", [&1], @activity_opts)) |> wait_branches() do
  {:ok, _results} ->
    # ... the rest of the workflow

  {:failed, branch} ->
    await_open_before_close(false)
    fail_workflow_execution(failure(branch))
end
```

Each call gets its own awaitable ID, a counter on the activity type (`temporal_sdk/temporal_sdk_workflow.erl:1660-1664`, `api/awaitable/temporal_sdk_api_awaitable.erl:220-228,244-258`). A child per item needs its own `workflow_id:` ([workflow-call.md](./workflow-call.md)).
