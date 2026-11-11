# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`wait: true`, or `[:wait]` for a timer); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```elixir
handle_a = start_activity("ProcessA", [items["a"]], @activity_opts)
# ... do other work ...
with %{state: :completed, result: [result_a]} <- wait(handle_a) do
  # ... the rest of the workflow, using result_a
else
  %{state: state} -> fail_workflow_execution(%{message: ~c"ProcessA #{state}"})
end
```

| `promise p <- …` | Elixir | `await p` |
|------------------|--------|-----------|
| `activity` | `p = start_activity("Name", [args], opts)`, without `wait:` ([activity-call.md](./activity-call.md)) | `wait(p)`, matched on `:completed` |
| `workflow` | `p = start_child_workflow(task_queue, "Name", input: [args], workflow_id: …)`, without `wait:` ([workflow-call.md](./workflow-call.md)) | `wait(p)`, matched on `:completed` |
| `timer(5m)` | `p = start_timer({5, :minute})` ([await-timer.md](./await-timer.md)) | `wait(p)` |
| `signal Approve` | `p = Arrivals.promise("Approve")` ([await-signal.md](./await-signal.md)) | `[approver] = Arrivals.await(p)` |
| `nexus …` / `update …` | unsupported ([nexus.md](./nexus.md), [update-handler.md](./update-handler.md)) | — |

- A call returns its handle unless `wait:` is set (`temporal_sdk/temporal_sdk_workflow.erl:1657,1966-1999,2060-2140`); `wait(p)` blocks until it is ready and returns its data map (`:2690-2703`). A closed activity or child returns its state and never raises, so match `:completed` and close any other state with `fail_workflow_execution/1`, as for an inline call ([activity-call.md](./activity-call.md)).
- **A promise on a signal begins waiting at its binding**, not at its `await`: `Arrivals.promise` draws its ticket when called, as the corpus's `approval = Arrivals.promise("Approve")` does ([`approval.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/approval.ex)). Bind and await it in the main execution, never in a `start_execution` ([signal-handler.md](./signal-handler.md)).
- In `await one:`, a promise is a case ranked by the task it became ready in ([await-one.md](./await-one.md#cases)). Losing a round never cancels it, a `timer` promise included: it stays awaitable (spec 06).
