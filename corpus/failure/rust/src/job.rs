use std::time::Duration;

use temporalio_common::RetryPolicy;
use temporalio_macros::{activities, workflow, workflow_methods};
use temporalio_sdk::{
    ActivityOptions, ApplicationFailure, SyncWorkflowContext, WorkflowContext, WorkflowContextView,
    WorkflowResult, WorkflowTermination,
    activities::{ActivityContext, ActivityError},
    workflows::join,
};

use crate::await_all::AwaitAll;

/// An activity's default name is `Type::method`, so each names its `.twf` name.
pub struct JobActivities;

#[activities]
impl JobActivities {
    #[activity(name = "Reject")]
    pub async fn reject(_ctx: ActivityContext, item: String) -> Result<(), ActivityError> {
        Err(ApplicationFailure::builder(format!("rejected {item}"))
            .type_name("Rejected".into())
            .build()
            .into())
    }

    #[activity(name = "Process")]
    pub async fn process(_ctx: ActivityContext, _item: String) -> Result<(), ActivityError> {
        Ok(())
    }
}

impl JobActivities {
    pub fn reject_defaults() -> ActivityOptions {
        ActivityOptions::with_start_to_close_timeout(Duration::from_secs(60))
            .retry_policy(RetryPolicy::builder().maximum_attempts(1).build())
            .build()
    }

    pub fn process_defaults() -> ActivityOptions {
        ActivityOptions::start_to_close_timeout(Duration::from_secs(60))
    }
}

#[workflow]
pub struct Job {
    item: String,
    proceeding: bool,
}

#[workflow_methods]
impl Job {
    #[init]
    pub fn new(_ctx: &WorkflowContextView, item: String) -> Self {
        Self {
            item,
            proceeding: false,
        }
    }

    #[signal(name = "Proceed")]
    pub fn proceed(&mut self, _ctx: &mut SyncWorkflowContext<Self>) {
        self.proceeding = true;
    }

    /// Reject's failure fails only this update; the run goes on.
    #[update(name = "Attempt")]
    pub async fn attempt(
        ctx: &mut WorkflowContext<Self>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(reject_and_process(ctx).await?)
    }

    /// Reject's failure fails the run.
    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<()> {
        ctx.wait_condition(|s| s.proceeding).await?;
        reject_and_process(ctx).await
    }
}

/// await all: fails at Reject's failure, and Process is left running, never cancelled.
async fn reject_and_process(ctx: &WorkflowContext<Job>) -> Result<(), WorkflowTermination> {
    let item = ctx.state(|s| s.item.clone());
    let all = AwaitAll::default();
    all.wait(async {
        join!(
            all.branch(ctx.execute_activity(
                JobActivities::reject,
                item.clone(),
                JobActivities::reject_defaults()
            )),
            all.branch(ctx.execute_activity(
                JobActivities::process,
                item.clone(),
                JobActivities::process_defaults()
            )),
        )
    })
    .await?;
    Ok(())
}
