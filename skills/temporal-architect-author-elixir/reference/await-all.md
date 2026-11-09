# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	workflow ShipOrder(order) -> shipment
```

```elixir
reserve = start_activity("ReserveInventory", [order], @activity_opts)
ship = start_child_workflow(task_queue, "ShipOrder", input: [order], workflow_id: wid <> "/ShipOrder")

with [%{state: :completed, result: [inventory]}, %{state: :completed, result: [shipment]}] <-
       wait_all([reserve, ship]) do
  # ... the rest of the workflow, using inventory and shipment
else
  [r, s] -> fail_workflow_execution(%{message: "ReserveInventory #{r.state}, ShipOrder #{s.state}"})
end
```

- One `wait_all` over every branch's [promise](./promise.md) handle (`temporal_sdk/temporal_sdk_workflow.erl:2706-2720`): it returns once every branch is ready, with their data maps in listed order (`api/awaitable/temporal_sdk_api_awaitable.erl:87-98`), as the corpus's [`Batch`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/elixir/batch.ex) reads `count` and `audited`.
- `wait_all` never fails early: a closed activity or child reports its state, so a failed branch leaves the others running to their close. Match `:completed` for every branch and close any other outcome with `fail_workflow_execution/1` ([activity-call.md](./activity-call.md)).
- A timer branch is its handle, `start_timer(d)`. A signal branch is `p = Arrivals.promise("X")`, bound before the `wait_all` and taken after it with `Arrivals.await(p)` ([await-signal.md](./await-signal.md)).
- A `detach` branch is its child started with `awaitable_event: :start` and `ABANDON`, which is ready at its start; only `:initiate_failed` means it never started ([detach.md](./detach.md)).
- Nexus branches are unsupported ([nexus.md](./nexus.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```elixir
results = items |> Enum.map(&start_activity("ProcessBatchItem", [&1], @activity_opts)) |> wait_all()

if Enum.all?(results, &match?(%{state: :completed}, &1)) do
  # ... the rest of the workflow
else
  fail_workflow_execution(%{message: "ProcessBatchItem failed"})
end
```

Each call gets its own awaitable ID, a counter on the activity type (`temporal_sdk/temporal_sdk_workflow.erl:1660-1664`, `api/awaitable/temporal_sdk_api_awaitable.erl:220-228,244-258`). A child per item needs its own `workflow_id:` ([workflow-call.md](./workflow-call.md)).
