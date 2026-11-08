# workflow call (child)

```twf
workflow ShipOrder(order) -> shipResult
```

```elixir
with %{state: :completed, result: [ship_result]} <-
       start_child_workflow(context.worker_opts.task_queue, "ShipOrder",
         input: [order],
         workflow_id: context.task.workflow_execution.workflow_id <> "/ShipOrder",
         wait: true
       ) do
  # ... the rest of the workflow, using ship_result
else
  %{state: state} -> fail_workflow_execution(%{message: "ShipOrder #{state}"})
end
```

- `start_child_workflow(task_queue, type, opts)` (`temporal_sdk/temporal_sdk_workflow.erl:2060-2140`) starts the child by the `.twf` name, a string: an atom would send its module name (`:2058-2059`). The **task queue is required and positional**; a child on the caller's queue passes `context.worker_opts.task_queue` ([workflow-def.md](./workflow-def.md)). The args are `input:`, positional. With `wait: true` it blocks until the child closes and returns its data map, the result in `result: [ship_result]` (`:842-965`).
- **A closed child never raises**: it returns its state, `:completed`, `:initiate_failed`, `:failed`, `:canceled`, `:timedout` or `:terminated`. Match `:completed` and close every other state with `fail_workflow_execution/1`, as for an activity ([activity-call.md](./activity-call.md)).
- **Always pass `workflow_id:`.** A child with an `id_scheme:` takes its ID function, `workflow_id: ShipItem.id(order["id"], item["id"])` ([workflow-def.md](./workflow-def.md#id_scheme)). Without one, derive it from the caller's workflow ID and something distinct per call (a loop index where the call repeats): the SDK's default omits the parent's workflow ID, so two concurrent parents of one type collide (`:2063-2070`).
- Pass `namespace:` when the caller's namespace is not `"default"`: the child defaults to `"default"`, not the caller's (`:2072`). A child takes `workflow_id_reuse_policy:` only; it has no conflict policy ([options.md](./options.md#workflow-id-policies)).
- A qualified callee, `workflow orders.ShipOrder(...)`, is the `.twf` name `"ShipOrder"` on the wire, whatever the module's namespace: the callee's worker maps it to `Orders.ShipOrder`.
- Bound to a promise, the call is `p = start_child_workflow(tq, "ShipOrder", opts)` without `wait:`; `wait(p)` is the `await` ([promise.md](./promise.md)), and `awaitable_event: :start` waits for its start alone. Fire-and-forget is [detach.md](./detach.md).
- The child's state is its own: parent and child communicate only through its input and its result, since in-workflow signal send is unsupported ([signal-send.md](./signal-send.md)).
- Unset, `parent_close_policy:` leaves the server's default, terminate — the child is killed when the parent completes, fails, or times out. Set another policy ([options.md](./options.md#child-workflow-options)) when the child should outlive the parent.
