pub mod approval;
pub mod arrivals;
pub mod fixtures;

use temporalio_sdk::{WorkerOptions, workflows::WorkflowRegistrationError};

pub const APPROVALS_TASK_QUEUE: &str = "approvals";

/// The `approvalTypes` worker's registrations, shared by the worker binary and the tests.
pub fn approval_types() -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(APPROVALS_TASK_QUEUE)
        .register_workflow::<approval::Approval>()?
        .build())
}
