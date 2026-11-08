use serde::{Deserialize, Serialize};
use temporalio_common::{
    data_converters::{MultiArgs2, PayloadConverter, RawValue},
    protos::coresdk::nexus::nexus_operation_result::Status,
};
use temporalio_macros::{workflow, workflow_methods};
use temporalio_sdk::{
    ApplicationFailure, NexusOperationCancellationType, NexusOperationOptions, WorkflowContext,
    WorkflowResult,
};

pub const ENDPOINT: &str = "GreeterEndpoint";
pub const SERVICE: &str = "GreeterService";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Greetings {
    pub hello: String,
    pub greeting: String,
}

/// The Nexus caller is untyped (`experimental` feature): endpoint, service and operation are
/// strings and the one input is a payload.
fn op(pc: &PayloadConverter, operation: &str, input: &String) -> NexusOperationOptions {
    NexusOperationOptions::builder()
        .endpoint(ENDPOINT)
        .service(SERVICE)
        .operation(operation)
        .input(RawValue::from_value(input, pc).payloads.remove(0))
        .build()
}

/// `nexus GreeterEndpoint GreeterService.<operation>(input) -> result`
async fn call<W>(
    ctx: &WorkflowContext<W>,
    operation: &str,
    input: &String,
) -> WorkflowResult<String> {
    let pc = ctx.payload_converter().clone();
    let started = ctx
        .start_nexus_operation(op(&pc, operation, input))
        .await
        .map_err(|f| ApplicationFailure::new(f.message))?;
    match started.result().await.status {
        Some(Status::Completed(p)) => Ok(RawValue::new(vec![p]).to_value(&pc)),
        other => Err(ApplicationFailure::new(format!("{operation}: {other:?}")).into()),
    }
}

#[workflow]
#[derive(Default)]
pub struct Caller;

#[workflow_methods]
impl Caller {
    /// Two `.twf` params, two payloads: `MultiArgs2` is the SDK's positional form.
    #[run]
    pub async fn run(
        ctx: &mut WorkflowContext<Self>,
        args: MultiArgs2<String, String>,
    ) -> WorkflowResult<Greetings> {
        let MultiArgs2(name, friend) = args;
        let hello = call(ctx, "Hello", &name).await?;
        let greeting = call(ctx, "Greet", &name).await?;
        // detach: never request cancellation; wait for the start, never the result.
        let pc = ctx.payload_converter().clone();
        let mut detached = op(&pc, "Greet", &friend);
        detached.cancellation_type = Some(NexusOperationCancellationType::Abandon);
        ctx.start_nexus_operation(detached)
            .await
            .map_err(|f| ApplicationFailure::new(f.message))?;
        Ok(Greetings { hello, greeting })
    }
}
