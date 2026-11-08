//! Test workflows for `await one`; registered only by the tests. Each takes signal `Ack`.

use std::time::Duration;

use temporalio_macros::{workflow, workflow_methods};
use temporalio_sdk::{
    SyncWorkflowContext, WorkflowContext, WorkflowResult, workflows::select,
};

/// Batch's `await one` over Ack and timer(1h), the cases listed in `order`; returns the winner.
#[workflow]
#[derive(Default)]
pub struct AwaitOneTie {
    acks: u32,
}

#[workflow_methods]
impl AwaitOneTie {
    #[signal(name = "Ack")]
    pub fn ack(&mut self, _ctx: &mut SyncWorkflowContext<Self>) {
        self.acks += 1;
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>, order: Vec<String>) -> WorkflowResult<String> {
        let ctx = &*ctx;
        let mut timer = ctx.timer(Duration::from_secs(3600));
        let mut ack = ctx.wait_condition(|s| s.acks > 0);
        // select! fixes its case order in code; one arm per listing.
        let won = if order[0] == "Ack" {
            select! {
                _ = ack => "Ack",
                _ = timer => "timer",
            }
        } else {
            select! {
                _ = timer => "timer",
                _ = ack => "Ack",
            }
        };
        Ok(won.to_string())
    }
}

/// A promise bound once, timer(24h), raced against Ack every round; returns the Acks counted.
#[workflow]
#[derive(Default)]
pub struct BoundDeadline {
    acks: u32,
}

#[workflow_methods]
impl BoundDeadline {
    #[signal(name = "Ack")]
    pub fn ack(&mut self, _ctx: &mut SyncWorkflowContext<Self>) {
        self.acks += 1;
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<u32> {
        let ctx = &*ctx;
        let mut counted = 0;
        // promise deadline <- timer(24h): bound before the rounds, so losing one never cancels it.
        let mut deadline = ctx.timer(Duration::from_secs(24 * 3600));
        loop {
            select! {
                _ = ctx.wait_condition(|s| s.acks > 0) => {
                    ctx.state_mut(|s| s.acks -= 1);
                    counted += 1;
                }
                _ = deadline => return Ok(counted),
            }
        }
    }
}

/// Batch's `await one` without the hand cancel: the losing timer is only dropped.
#[workflow]
#[derive(Default)]
pub struct DroppedTimer {
    acks: u32,
}

#[workflow_methods]
impl DroppedTimer {
    #[signal(name = "Ack")]
    pub fn ack(&mut self, _ctx: &mut SyncWorkflowContext<Self>) {
        self.acks += 1;
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<()> {
        let ctx = &*ctx;
        select! {
            _ = ctx.wait_condition(|s| s.acks > 0) => {}
            _ = ctx.timer(Duration::from_secs(3600)) => {}
        }
        Ok(())
    }
}

