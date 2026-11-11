pub mod await_all;
pub mod batch;
pub mod fixtures;

use temporalio_sdk::{WorkerOptions, workflows::WorkflowRegistrationError};

pub const BATCHES_TASK_QUEUE: &str = "batches";

/// The `batchTypes` worker's registrations, shared by the worker binary and the tests.
pub fn batch_types(
    activities: batch::BatchActivities,
) -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(BATCHES_TASK_QUEUE)
        .register_workflow::<batch::Batch>()?
        .register_workflow::<batch::Audit>()?
        .register_workflow::<batch::Archive>()?
        .register_activities(activities)
        .build())
}
