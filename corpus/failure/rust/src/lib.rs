pub mod await_all;
pub mod job;

use temporalio_sdk::{WorkerOptions, workflows::WorkflowRegistrationError};

pub const JOBS_TASK_QUEUE: &str = "jobs";

/// The `jobTypes` worker's registrations, shared by the worker binary and the tests.
pub fn job_types(
    activities: job::JobActivities,
) -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(JOBS_TASK_QUEUE)
        .register_workflow::<job::Job>()?
        .register_activities(activities)
        .build())
}
