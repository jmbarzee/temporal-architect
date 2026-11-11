# await all

```twf
await all:
	activity Count(items) -> count
	workflow Audit(items) -> audited
```

```rust
let all = AwaitAll::default();
let (count, audited) = all
    .wait(async {
        join!(
            all.branch(ctx.execute_activity(BatchActivities::count, items.clone(), activity_options())),
            all.branch(async {
                let audit = ctx.start_child_workflow(Audit::run, items.clone(), child_options(ctx)).await?;
                Ok::<_, WorkflowTermination>(audit.result().await?)
            }),
        )
    })
    .await?;
```

- `temporalio_sdk::workflows::join!` over every branch, whatever its kind, polled in declaration order (`crates/workflow/src/workflows.rs:72-90`); a branch of several steps is an `async` block. Each branch goes through `all.branch`, and the join through `all.wait`, one `AwaitAll` per `await all` ([§ A branch fails](#a-branch-fails)). This is the corpus's `Batch` ([`batch.rs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/rust/src/batch.rs)).
- Never `tokio::join!`, `futures::join!` or `futures::try_join!` in workflow code (`crates/sdk/README.md:244-250`).
- A `detach` call's branch awaits only its start ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```rust
let all = AwaitAll::default();
let results = all
    .wait(join_all(items.iter().map(|item| {
        all.branch(ctx.execute_activity(BatchActivities::process_batch_item, item.clone(), activity_options()))
    })))
    .await?;
```

`temporalio_sdk::workflows::join_all` returns the results in input order (`crates/workflow/src/workflows.rs:103-129`).

## A branch fails

The first branch to fail fails the `await all` at once, with its failure, and the other branches keep running (`twf spec statement-syntax`, Await All Block). `join!` and `join_all` wait for every branch, failed or not (`crates/workflow/src/lib.rs:99-105`, `workflows.rs:123-129`), so both forms go through `AwaitAll`, written once in the workflow crate:

```rust
use std::{cell::RefCell, future::Future};

use futures::FutureExt;
use temporalio_sdk::{WorkflowCancellationToken, WorkflowTermination, workflows::select};

/// One `await all`: it fails at its first branch failure, and the other branches keep running.
#[derive(Default)]
pub struct AwaitAll {
    failed: WorkflowCancellationToken,
    failure: RefCell<Option<WorkflowTermination>>,
}

impl AwaitAll {
    /// Every branch's output, or the first branch failure, the rest left running.
    pub async fn wait<T>(
        &self,
        branches: impl Future<Output = T>,
    ) -> Result<T, WorkflowTermination> {
        select! {
            done = branches.fuse() => Ok(done),
            _ = self.failed.cancelled() => Err(self.failure.take().expect("set before failed")),
        }
    }

    /// A branch: its value, or, on failure, it keeps the failure if first, wakes `wait`, and
    /// never completes.
    pub async fn branch<T, E: Into<WorkflowTermination>>(
        &self,
        call: impl Future<Output = Result<T, E>>,
    ) -> T {
        match call.await {
            Ok(v) => v,
            Err(e) => {
                self.failure.borrow_mut().get_or_insert(e.into());
                self.failed.cancel();
                std::future::pending().await
            }
        }
    }
}
```

- **A flag, not a cancel.** `failed` is a detached `WorkflowCancellationToken` (`crates/workflow/src/cancellation.rs:57-63`) passed to no call, so cancelling it cancels nothing. Its wake is SDK-guarded (`cancellation.rs:30`), so the nondeterminism detector stays quiet (`crates/sdk/README.md:252-262`), and `cancelled()` is fused (`:98-108`). Passing it as a call's `cancellation_token` (`crates/workflow/src/workflow_context/options.rs:278,498`) would cancel the branches, a departure from spec 06.
- **A failed branch never completes**, so the join completes only when every branch succeeds, and `wait` returns the first failure whenever any branch fails. `wait` polls the join, then the flag (`select!` is `select_biased!`, `crates/workflow/src/lib.rs:93-97`); `.fuse()` only lets `select!` take the join, and no `futures` or `tokio` combinator joins or races.
- **The rest keep running.** Returning drops the join, and a dropped call is not cancelled: its command future has no `Drop`, and cancelling is an explicit `cancel()` (`crates/workflow/src/workflow_context.rs:2736-2740,2786-2793`). An open activity ends with the run; a child follows `parent_close_policy` ([options.md](./options.md)).
- **Two failures.** The first to fail surfaces, and within one workflow task the first listed, as `join!` and `join_all` poll in that order (a `join_all` of more than 30 branches polls in wake order, so there the first resolved: futures-util 0.3.34 `src/future/join_all.rs:35,120-123`); a later failure is dropped.
- **Where it fails.** In the run, `?` returns it as `WorkflowTermination::Failed`, which fails the run with the branch's failure (`crates/workflow/src/runtime/instance.rs:846-859`). In an [update handler](./update-handler.md), returned as the `Err`, it fails only that update (`:1022-1030`), and the run goes on; the caller gets an application failure whose causes carry the branch's message (`:484-490`), not an activity failure. In a [signal handler](./signal-handler.md), which returns `()`, it is kept for the run to return.

[`corpus/failure/rust/`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/rust/) is the worked example; its test asserts the update fails while the run goes on, then the run fails with `Reject`'s failure while `Process` is held, with no cancel request in the history.
