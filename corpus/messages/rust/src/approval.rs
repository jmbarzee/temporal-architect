use serde::{Deserialize, Serialize};
use temporalio_macros::{workflow, workflow_methods};
use temporalio_sdk::{SyncWorkflowContext, WorkflowContext, WorkflowContextView, WorkflowResult};

use crate::arrivals::{Arrivals, take};
use crate::of;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub request: String,
    pub approver: String,
    pub note: String,
    pub status: String,
}

/// The workflow type is the struct's name, `Approval`. Handler names default to the method name,
/// so each handler names its `.twf` name.
#[workflow]
pub struct Approval {
    request: String,
    status: String,
    opens: Arrivals<()>,
    approves: Arrivals<String>,
    reviews: Arrivals<String>,
}

#[workflow_methods]
impl Approval {
    #[init]
    pub fn new(_ctx: &WorkflowContextView, request: String) -> Self {
        Self {
            request,
            status: "submitted".into(),
            opens: Arrivals::default(),
            approves: Arrivals::default(),
            reviews: Arrivals::default(),
        }
    }

    #[signal(name = "Open")]
    pub fn open(&mut self, _ctx: &mut SyncWorkflowContext<Self>) {
        self.status = "open".into();
        self.opens.add(());
    }

    #[signal(name = "Approve")]
    pub fn approve(&mut self, _ctx: &mut SyncWorkflowContext<Self>, approver: String) {
        self.status = "approved".into();
        self.approves.add(approver);
    }

    #[update(name = "Review")]
    pub fn review(&mut self, _ctx: &mut SyncWorkflowContext<Self>, note: String) -> String {
        self.status = "reviewed".into();
        self.reviews.add(note);
        self.status.clone()
    }

    #[query(name = "Status")]
    pub fn status(&self, _ctx: &WorkflowContextView) -> String {
        self.status.clone()
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<Decision> {
        take(ctx, of!(opens)).await?;
        let approval = take(ctx, of!(approves)); // begins waiting here, at its binding
        let note = take(ctx, of!(reviews)).await?;
        let approver = approval.await?;
        Ok(ctx.state(|s| Decision {
            request: s.request.clone(),
            approver,
            note,
            status: s.status.clone(),
        }))
    }
}
