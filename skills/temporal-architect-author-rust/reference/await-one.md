# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```rust
let mut timer = ctx.timer(Duration::from_secs(24 * 3600));
select! {
    payment = take(ctx, of!(payments_received)).fuse() => {
        payment?;
        timer.cancel(); // the inline timer lost
        ctx.state_mut(|s| s.status = "processing".into());
    }
    _ = timer => {
        ctx.execute_activity(OrderActivities::cancel_order, order_id, activity_options()).await?;
        return Err(ApplicationFailure::new("order cancelled").into());
    }
}
```

`temporalio_sdk::workflows::select!`, its arms in `.twf` order: it is `select_biased!`, polling arms top to bottom (`crates/workflow/src/workflows.rs:46-70`, `crates/workflow/src/lib.rs:93-97`), so the first listed ready case wins. That holds whatever order the workflow task's jobs arrive in: every job is applied, signal handlers run included, before workflow code is first polled (`crates/workflow/src/runtime/instance.rs:1079-1130`, `crates/sdk/src/workflow_future.rs:457-541`). Never `futures::select!` (random poll order, which the nondeterminism detector does not catch) or `tokio::select!` (`crates/sdk/README.md:244-250,279-281`). [`corpus/concurrency/rust/src/batch.rs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/rust/src/batch.rs) is the worked example, its tests holding the tie in both orders, the losing timer's `TimerCanceled`, and a bound deadline that survives the rounds it loses; the `AwaitOne` fixture in [`corpus/messages/rust/src/fixtures.rs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/rust/src/fixtures.rs) is the signal case above.

## Cases

| Case | Arm | Losing |
|------|-----|--------|
| signal, update | `v = take(ctx, of!(xs)).fuse()` | dropped: leaves the `Arrivals` line without taking |
| inline timer | `let mut timer = ctx.timer(d);` before `select!`; `_ = timer` | every other arm calls `timer.cancel()` |
| inline activity | `r = ctx.execute_activity(…)` | dropped; keeps running |
| inline child workflow, nexus | the start bound before `select!` (`let start = ctx.start_child_workflow(…);`), so it starts even when an earlier case is ready; the arm is `r = async { … start.await? … .result().await … }.fuse()` | dropped; keeps running |
| promise | `r = p`, borrowed ([promise.md](./promise.md)) | untouched |
| condition | `_ = ctx.wait_condition(\|s\| …)` | — |
| nested `await all:` | its branch calls bound before `select!` (`let a = all.branch(ctx.execute_activity(…));`), so they start even when an earlier case is ready; the arm is `r = all.wait(async { join!(a, b) }).fuse()` ([await-all.md](./await-all.md)) | as its branches |

A message case takes only if it wins: `select!` polls a later arm only while every earlier one is pending, and a dropped `take` leaves the line ([await-signal.md](./await-signal.md)). SDK futures and `ctx.wait_condition` are already fused (`crates/workflow/src/workflow_context.rs:2543-2549,2636-2639`); an async block or `take` needs `.fuse()`.

## Notes

- **Losing cases** (spec 06): dropping an SDK future cancels nothing, since its command future has no `Drop` (`crates/workflow/src/workflow_context.rs:2741-2800`). So a losing inline timer is cancelled by `timer.cancel()` in the winning arm (`CancellableFuture`, `:2636-2639`), and history records `TimerCanceled`; losing inline activities, children and Nexus operations are dropped and keep running until the run ends; a bound promise is only borrowed, never cancelled. For a child's lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)).
- An empty case body → the arm's value alone, `?` applied.
- Event-driven/entity workflows repeat the `select!` in a loop, with a fresh `take` per message case each iteration.
