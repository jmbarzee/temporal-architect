use std::time::Duration;

use temporalio_common::data_converters::MultiArgs2;
use temporalio_macros::{activities, workflow, workflow_methods};
use temporalio_sdk::{
    ActivityOptions, ContinueAsNewOptions, WorkflowContext, WorkflowResult,
    activities::{ActivityContext, ActivityError},
};

pub struct CounterActivities;

#[activities]
impl CounterActivities {
    #[activity(name = "Increment")]
    pub async fn increment(_ctx: ActivityContext, count: i64) -> Result<i64, ActivityError> {
        Ok(count + 1)
    }
}

#[workflow]
#[derive(Default)]
pub struct Counter;

#[workflow_methods]
impl Counter {
    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>, args: MultiArgs2<i64, i64>) -> WorkflowResult<i64> {
        let MultiArgs2(count, limit) = args;
        ctx.timer(Duration::from_secs(60)).await;
        let next = ctx
            .execute_activity(
                CounterActivities::increment,
                count,
                ActivityOptions::start_to_close_timeout(Duration::from_secs(60)),
            )
            .await?;
        if next >= limit {
            return Ok(next);
        }
        // continue_as_new only ever returns the termination to propagate.
        match ctx.continue_as_new(MultiArgs2(next, limit), ContinueAsNewOptions::default())? {}
    }
}
