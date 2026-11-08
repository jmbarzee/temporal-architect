# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```rust
#[workflow]
pub struct Approval {
    status: String,
    approves: Arrivals<String>,
}

#[signal(name = "Approve")]
pub fn approve(&mut self, _ctx: &mut SyncWorkflowContext<Self>, approver: String) {
    self.status = "approved".into();
    self.approves.add(approver);
}

// in #[run]:
let approver = take(ctx, of!(approves)).await?;
```

Every signal or update the design waits on gets an `Arrivals<T>` field, `T` being its one param, a tuple of several (destructured after the take), or `()` for none. Copy [`messages/rust/src/arrivals.rs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/rust/src/arrivals.rs) (with its `of!` macro) into the crate; [`approval.rs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/rust/src/approval.rs) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take(ctx, of!(field))` is a plain function: it joins the line at the call and returns the wait, which yields the oldest pending arrival or waits for the next, or `Err(WorkflowCancellationError)` if the workflow is cancelled (`crates/workflow/src/workflow_context.rs:2543-2549`). Awaited at once it is `await signal`; bound and awaited later it is a [promise](./promise.md).
- Waiters are matched by position: the k-th in line owns the k-th oldest pending arrival. Rust futures run only when polled, so an unawaited promise keeps its arrival without blocking the waiters behind it. A bare `ctx.wait_condition(|s| !s.pending.is_empty())` then `pop_front` per waiter loses nothing but serves the order the waiters are polled (`join!`'s declaration order), not the order they began; the corpus's `naive_wait_per_waiter_serves_poll_order_not_wait_order` asserts it. Neither that nor a `bool` flag, which holds one arrival, is a `.twf` wait.
- A dropped wait leaves the line without taking: a cancelled waiter, or a losing `await one` case ([await-one.md](./await-one.md)).
- A signal with no params that only an `await one` waits on may count its arrivals instead, as the corpus's `Batch` does (`acks += 1`; `acks > 0`; `acks -= 1`).
- Code after the take sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
