# condition

| DSL | Go |
|-----|----|
| `state:` `condition jobReady` | `jobReady := false` at workflow scope |
| `set jobReady` / `unset jobReady` | `jobReady = true` / `jobReady = false` |
| `await jobReady` | `err := workflow.Await(ctx, func() bool { return jobReady })` |

- `workflow.Await` re-evaluates on every workflow state transition and writes no history events. **Never poll with `workflow.Sleep` in a loop** — each iteration writes 2 events (timer started + fired) and can exhaust the 51,200-event limit, leaving the workflow unrecoverable.
- It re-evaluates only on state transitions (signals, activity completions, …), never on wall-clock time, so `Await(ctx, func() bool { return workflow.Now(ctx).After(deadline) })` may never return — use `workflow.Sleep` / `workflow.NewTimer` for time.
- It blocks forever if the condition is never set (logic bug, missing handler); use `workflow.AwaitWithTimeout` when a bounded wait fits.
- It returns `*CanceledError` when `ctx` is cancelled.
- A condition as an `await one:` case → goroutine + channel; see [await-one.md](./await-one.md#cases).
