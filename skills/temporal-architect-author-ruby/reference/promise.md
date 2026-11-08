# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`Workflow.execute_activity` blocks the fiber at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```ruby
handle_a = Temporalio::Workflow::Future.new do
  Temporalio::Workflow.execute_activity(ProcessA, items.a, start_to_close_timeout: 60)
end
# ... do other work ...
result_a = handle_a.wait
```

| `promise p <- …` | Ruby |
|------------------|------|
| `activity` / `workflow` | `Workflow::Future.new { Workflow.execute_activity(…) }` / `{ Workflow.execute_child_workflow(…) }` (`workflow/future.rb:75-93`); a child the design also signals: [signal-send.md](./signal-send.md) |
| `timer(5m)` | `Workflow::Future.new { Workflow.sleep(300) }` (`workflow.rb:402`) |
| `nexus …` | `Workflow::Future.new { client.execute_operation('Op', arg) }` on the Nexus client ([nexus.md](./nexus.md)) |
| `signal Approve` / `update Review` | `@approves.take` |

- `wait` returns the result or raises the failure (`workflow/future.rb:140-146`). A failed future never waited on keeps its failure, never failing the workflow (`workflow/future.rb:82-91`).
- A promise on a signal or update begins waiting at its binding, not at its `wait`: `take` draws its ticket from the message's `Arrivals` before it builds the `Future` ([await-signal.md](./await-signal.md)), as the corpus's `approval = @approves.take` does. Not `Workflow::Future.new { @approves.take_now }`: the block runs in a new fiber that `Fiber.schedule` queues as ready (`workflow/future.rb:82`, `internal/worker/workflow_instance/scheduler.rb:163-176`), so it first runs once the binding fiber yields, and a later `await signal` that waits first takes first (the corpus's `test_a_naive_future_promise_begins_waiting_late`).
- In `await one:`, a promise is a `done?` case ([await-one.md](./await-one.md#cases)). Losing a round never cancels it, a `timer` promise included: its `sleep` takes only the workflow's cancellation, never one a race cancels, and stays awaitable (spec 06), as the corpus's `BoundDeadline` shows.
