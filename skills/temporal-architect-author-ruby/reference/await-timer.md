# await timer

```twf
await timer(5m)
```

```ruby
Temporalio::Workflow.sleep(300)
```

- `Workflow.sleep(duration)` (`workflow.rb:392-404`) takes the `.twf` duration in seconds. A variable duration passes straight through: `Temporalio::Workflow.sleep(backoff_seconds)`.
- Never `sleep` / `Kernel.sleep`: `Kernel#sleep` is a default illegal workflow call (`worker.rb:326-327`), so the call raises `Temporalio::Workflow::NondeterminismError` (`internal/worker/workflow_instance/illegal_call_tracer.rb:56-128`); `temporal-developer` `references/ruby/gotchas.md` § Using Kernel.sleep.
- A cancelled wait raises `Temporalio::Error::CanceledError` from it (`workflow.rb:401`); cancellation: `temporal-developer` `references/ruby/patterns.md` § Cancellation (Token-based).
- As a `promise`, a timer runs in a `Temporalio::Workflow::Future`; as an inline race case, it sleeps with its own `cancellation:` so a loss can cancel it ([await-one.md](./await-one.md)).
