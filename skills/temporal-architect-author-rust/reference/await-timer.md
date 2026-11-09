# await timer

```twf
await timer(5m)
```

```rust
ctx.timer(Duration::from_secs(300)).await;
```

- `ctx.timer(d)` (`workflow/src/workflow_context.rs:2352-2358`) takes the `.twf` duration as a `std::time::Duration`, which converts into `TimerOptions` (`workflow/src/workflow_context/options.rs:627-634`). A variable duration passes straight through: `ctx.timer(backoff)`. Never `tokio::time::sleep`: the nondeterminism detector fails the task (`sdk/README.md:264`).
- It resolves to `TimerResult::Fired`, or `Cancelled` once cancelled (`workflow/src/runtime/model.rs:56-61`); a timer inherits the workflow's cancellation (`sdk/README.md:373-374`), so check the result where cancellation matters.
- As a `promise`, a timer is `let t = ctx.timer(d);`, started at once ([promise.md](./promise.md)); as an inline race case that loses, dropping it does not cancel it, so the winner calls `cancel()` ([await-one.md](./await-one.md)).
