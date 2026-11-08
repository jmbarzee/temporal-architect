//! The `callerTypes` worker. The Rust SDK has no Nexus handler (`GreeterService` and its worker
//! are unsupported in Rust), so only the caller is authored here; the tests stand in a handler.

pub mod caller;

use temporalio_sdk::{WorkerOptions, workflows::WorkflowRegistrationError};

pub const CALLER_TASK_QUEUE: &str = "caller";

/// The `callerTypes` worker's registrations, shared by the worker binary and the tests.
pub fn caller_types() -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(CALLER_TASK_QUEUE)
        .register_workflow::<caller::Caller>()?
        .build())
}
