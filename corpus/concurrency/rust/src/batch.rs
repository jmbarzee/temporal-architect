use std::time::Duration;

use serde::{Deserialize, Serialize};
use temporalio_macros::{activities, workflow, workflow_methods};
use temporalio_sdk::{
    ActivityOptions, CancellableFuture, ChildWorkflowCancellationType, ChildWorkflowOptions,
    ParentClosePolicy, SyncWorkflowContext, WorkflowContext, WorkflowContextView, WorkflowResult,
    activities::{ActivityContext, ActivityError},
    workflows::{join, select},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Report {
    pub count: i64,
    pub audited: bool,
    pub status: String,
}

/// An activity's default name is `Type::method`, so each names its `.twf` name.
pub struct BatchActivities;

#[activities]
impl BatchActivities {
    #[activity(name = "Count")]
    pub async fn count(_ctx: ActivityContext, items: Vec<String>) -> Result<i64, ActivityError> {
        Ok(items.len() as i64)
    }

    #[activity(name = "Store")]
    pub async fn store(_ctx: ActivityContext, _items: Vec<String>) -> Result<(), ActivityError> {
        Ok(())
    }
}

fn activity_options() -> ActivityOptions {
    ActivityOptions::start_to_close_timeout(Duration::from_secs(60))
}

/// A child's task queue is written out: an unset one goes to the server empty, which the
/// Temporal server reads as the parent's queue but the time-skipping test server does not.
fn child_options<W>(ctx: &WorkflowContext<W>) -> ChildWorkflowOptions {
    ChildWorkflowOptions::builder()
        .task_queue(ctx.task_queue().to_string())
        .build()
}

#[workflow]
pub struct Batch {
    items: Vec<String>,
    status: String,
    acks: u32, // pending arrivals of Ack
}

#[workflow_methods]
impl Batch {
    #[init]
    pub fn new(_ctx: &WorkflowContextView, items: Vec<String>) -> Self {
        Self {
            items,
            status: "unacknowledged".into(),
            acks: 0,
        }
    }

    #[signal(name = "Ack")]
    pub fn ack(&mut self, _ctx: &mut SyncWorkflowContext<Self>) {
        self.status = "acknowledged".into();
        self.acks += 1;
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<Report> {
        let items = ctx.state(|s| s.items.clone());
        let ctx = &*ctx;

        // await all
        let (count, audited) = join!(
            ctx.execute_activity(BatchActivities::count, items.clone(), activity_options()),
            async {
                let audit = ctx
                    .start_child_workflow(Audit::run, items.clone(), child_options(ctx))
                    .await?;
                Ok::<_, temporalio_sdk::WorkflowTermination>(audit.result().await?)
            },
        );
        let (count, audited) = (count?, audited?);

        // detach: abandon the child on parent close and never request its cancellation; wait
        // only for its start.
        let detached = ChildWorkflowOptions::builder()
            .task_queue(ctx.task_queue().to_string())
            .parent_close_policy(ParentClosePolicy::Abandon)
            .cancel_type(ChildWorkflowCancellationType::Abandon)
            .build();
        ctx.start_child_workflow(Archive::run, items, detached)
            .await?;

        // await one: select! polls the cases in listed order, so Ack wins a tie with the timer.
        // A dropped timer is not cancelled, so the losing inline timer is cancelled by hand
        // (spec 06).
        let mut timer = ctx.timer(Duration::from_secs(3600));
        select! {
            _ = ctx.wait_condition(|s| s.acks > 0) => {
                ctx.state_mut(|s| s.acks -= 1);
                timer.cancel();
            }
            _ = timer => {}
        }

        Ok(Report {
            count,
            audited,
            status: ctx.state(|s| s.status.clone()),
        })
    }
}

#[workflow]
#[derive(Default)]
pub struct Audit;

#[workflow_methods]
impl Audit {
    #[run]
    pub async fn run(_ctx: &mut WorkflowContext<Self>, items: Vec<String>) -> WorkflowResult<bool> {
        Ok(!items.is_empty())
    }
}

#[workflow]
#[derive(Default)]
pub struct Archive;

#[workflow_methods]
impl Archive {
    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>, items: Vec<String>) -> WorkflowResult<()> {
        ctx.execute_activity(BatchActivities::store, items, activity_options())
            .await?;
        Ok(())
    }
}
