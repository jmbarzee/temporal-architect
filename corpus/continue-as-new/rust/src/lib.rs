pub mod counter;

use temporalio_sdk::{WorkerOptions, workflows::WorkflowRegistrationError};

pub const COUNTERS_TASK_QUEUE: &str = "counters";

/// The `counterTypes` worker's registrations, shared by the worker binary and the tests.
pub fn counter_types() -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(COUNTERS_TASK_QUEUE)
        .register_workflow::<counter::Counter>()?
        .register_activities(counter::CounterActivities)
        .build())
}
