# activity call

```twf
activity ValidateOrder(order) -> validated
```

```elixir
with %{state: :completed, result: [validated]} <-
       start_activity("ValidateOrder", [order], wait: true) do
  # ... the rest of the workflow, using validated
else
  %{state: state} -> fail_workflow_execution(%{message: "ValidateOrder #{state}"})
end
```

- `start_activity(type, input, opts)` (`temporal_sdk/temporal_sdk_workflow.erl:1657`) schedules the activity by the `.twf` name, a string: an atom would send its module name (`:1769-1772`). `input` is the positional payload list. With `wait: true` it blocks the workflow until the activity closes and returns its data map (`:3011-3018`); the result is the activity's payload list, `result: [validated]`.
- **A closed activity never raises**: it returns its state, `:completed`, `:failed`, `:timedout` or `:canceled`, after its retries (`:541,554-700`). Match `:completed`, and close every other state with `fail_workflow_execution/1`, unless the `.twf` handles it. Never let a failed match decide: a raise in workflow code fails only the workflow task, which the server retries while the run stays open (`executor/temporal_sdk_executor_workflow.erl:1370-1386,2256-2290`).
- Options are the call's keyword list ([options.md](./options.md)); calls sharing options share one function or attribute.
- Bound to a promise, the call is `p = start_activity("ValidateOrder", [order], opts)`, without `wait:`: the handle is the promise, and `wait(p)` is the `await` ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: set `task_queue:` from the family's queue function with the workflow's inputs, and set `schedule_to_start_timeout:` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
