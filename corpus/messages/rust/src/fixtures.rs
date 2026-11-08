//! Test workflows for `Arrivals`; registered only by the arrivals tests. Each takes signal `X`.

use std::{collections::BTreeMap, collections::VecDeque, time::Duration};

use futures::FutureExt;
use temporalio_macros::{workflow, workflow_methods};
use temporalio_sdk::{
    CancellableFuture, SyncWorkflowContext, WorkflowContext, WorkflowResult,
    workflows::{join, select},
};

use crate::arrivals::{Arrivals, take};
use crate::of;

/// Two waiters of X; the one created first sleeps before it waits, so the other begins first.
#[workflow]
#[derive(Default)]
pub struct TwoWaiters {
    xs: Arrivals<String>,
}

#[workflow_methods]
impl TwoWaiters {
    #[signal(name = "X")]
    pub fn x(&mut self, _ctx: &mut SyncWorkflowContext<Self>, v: String) {
        self.xs.add(v);
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<BTreeMap<String, String>> {
        let ctx = &*ctx;
        let created_first = async {
            ctx.timer(Duration::from_secs(1)).await;
            take(ctx, of!(xs)).await
        };
        let began_first = take(ctx, of!(xs));
        let (c, b) = join!(created_first, began_first);
        Ok(BTreeMap::from([("created first".into(), c?), ("began first".into(), b?)]))
    }
}

/// Binds a promise on X, then awaits X.
#[workflow]
#[derive(Default)]
pub struct PromiseThenAwait {
    xs: Arrivals<String>,
}

#[workflow_methods]
impl PromiseThenAwait {
    #[signal(name = "X")]
    pub fn x(&mut self, _ctx: &mut SyncWorkflowContext<Self>, v: String) {
        self.xs.add(v);
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<BTreeMap<String, String>> {
        let p = take(ctx, of!(xs));
        let awaited = take(ctx, of!(xs)).await?;
        Ok(BTreeMap::from([("promise".into(), p.await?), ("await".into(), awaited)]))
    }
}

/// Starts a waiter of X and drops it, then takes X.
#[workflow]
#[derive(Default)]
pub struct CancelledWaiter {
    xs: Arrivals<String>,
}

#[workflow_methods]
impl CancelledWaiter {
    #[signal(name = "X")]
    pub fn x(&mut self, _ctx: &mut SyncWorkflowContext<Self>, v: String) {
        self.xs.add(v);
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<String> {
        let waiter = take(ctx, of!(xs));
        ctx.timer(Duration::from_secs(1)).await;
        drop(waiter);
        Ok(take(ctx, of!(xs)).await?)
    }
}

/// await one: a case for X raced against an inline timer (listed second), then takes X.
#[workflow]
#[derive(Default)]
pub struct AwaitOne {
    xs: Arrivals<String>,
}

#[workflow_methods]
impl AwaitOne {
    #[signal(name = "X")]
    pub fn x(&mut self, _ctx: &mut SyncWorkflowContext<Self>, v: String) {
        self.xs.add(v);
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>, timeout: Duration) -> WorkflowResult<Vec<String>> {
        let mut took = Vec::new();
        let mut timer = ctx.timer(timeout);
        select! {
            v = take(ctx, of!(xs)).fuse() => {
                timer.cancel(); // the inline timer lost (spec 06)
                took.push(format!("case {}", v?));
            }
            _ = timer => took.push("timer".into()),
        }
        took.push(format!("then {}", take(ctx, of!(xs)).await?));
        Ok(took)
    }
}

/// The naive mapping: each waiter awaits a non-empty queue, then takes its head.
#[workflow]
#[derive(Default)]
pub struct NaiveTwoWaiters {
    pending: VecDeque<String>,
}

#[workflow_methods]
impl NaiveTwoWaiters {
    #[signal(name = "X")]
    pub fn x(&mut self, _ctx: &mut SyncWorkflowContext<Self>, v: String) {
        self.pending.push_back(v);
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<BTreeMap<String, String>> {
        let ctx = &*ctx;
        let naive_take = || async {
            ctx.wait_condition(|s| !s.pending.is_empty()).await?;
            Ok::<_, temporalio_sdk::WorkflowCancellationError>(
                ctx.state_mut(|s| s.pending.pop_front()).unwrap_or_else(|| "lost".into()),
            )
        };
        let created_first = async {
            ctx.timer(Duration::from_secs(1)).await;
            naive_take().await
        };
        let began_first = naive_take();
        let (c, b) = join!(created_first, began_first);
        Ok(BTreeMap::from([("created first".into(), c?), ("began first".into(), b?)]))
    }
}
