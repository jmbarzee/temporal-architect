//! The Rust SDK cannot host a Nexus service, so a raw-gRPC stub on the endpoint's task queue
//! answers for `GreeterService`: `Hello` completes synchronously; `Greet` starts a stand-in `Greet`
//! workflow whose completion callback completes the operation asynchronously, except `Greet` for
//! Grace, which starts and never completes — the caller must not wait for it.

use std::sync::{Arc, Mutex};

use corpus_nexus::{
    CALLER_TASK_QUEUE,
    caller::{Caller, ENDPOINT, Greetings},
    caller_types,
};
use corpus_testkit::{Env, local};
use temporalio_client::{WorkflowGetResultOptions, WorkflowStartOptions};
use temporalio_common::{
    data_converters::{MultiArgs2, PayloadConverter, RawValue},
    protos::temporal::api::{
        common::v1::{Callback, callback},
        enums::v1::EventType,
        nexus::v1::{
            EndpointSpec, EndpointTarget, Response, StartOperationResponse, endpoint_target,
            request, response, start_operation_response,
        },
        operatorservice::v1::CreateNexusEndpointRequest,
        taskqueue::v1::TaskQueue,
        workflowservice::v1::{PollNexusTaskQueueRequest, RespondNexusTaskCompletedRequest},
    },
};
use temporalio_macros::{workflow, workflow_methods};
use temporalio_sdk::{WorkerOptions, WorkflowContext, WorkflowResult};

const GREETER_TASK_QUEUE: &str = "greeter";

/// A stand-in for the `greeterTypes` worker's `Greet`, so that `Greet` completes asynchronously.
#[workflow]
#[derive(Default)]
struct Greet;

#[workflow_methods]
impl Greet {
    #[run]
    async fn run(_ctx: &mut WorkflowContext<Self>, name: String) -> WorkflowResult<String> {
        Ok(format!("Greetings, {name}"))
    }
}

/// Answers Nexus tasks until the test ends; records each (operation, input) it saw.
async fn stub_handler(env: &Env, seen: Arc<Mutex<Vec<(String, String)>>>) {
    let pc = PayloadConverter::default();
    let mut svc = env.client.connection().workflow_service();
    loop {
        let Ok(poll) = svc
            .poll_nexus_task_queue(tonic::Request::new(PollNexusTaskQueueRequest {
                namespace: "default".into(),
                task_queue: Some(TaskQueue {
                    name: GREETER_TASK_QUEUE.into(),
                    ..Default::default()
                }),
                identity: "stub".into(),
                ..Default::default()
            }))
            .await
        else {
            continue;
        };
        let poll = poll.into_inner();
        let Some(request::Variant::StartOperation(start)) = poll.request.and_then(|r| r.variant)
        else {
            continue;
        };
        let name: String = RawValue::new(vec![start.payload.unwrap()]).to_value(&pc);
        seen.lock()
            .unwrap()
            .push((start.operation.clone(), name.clone()));
        let variant = match start.operation.as_str() {
            "Hello" => {
                start_operation_response::Variant::SyncSuccess(start_operation_response::Sync {
                    payload: Some(
                        RawValue::from_value(&format!("Hello, {name}"), &pc)
                            .payloads
                            .remove(0),
                    ),
                    links: vec![],
                })
            }
            _ => {
                if name != "Grace" {
                    let callback = Callback {
                        variant: Some(callback::Variant::Nexus(callback::Nexus {
                            url: start.callback,
                            header: start.callback_header,
                        })),
                        links: vec![],
                    };
                    env.client
                        .start_workflow(
                            Greet::run,
                            name.clone(),
                            WorkflowStartOptions::new(GREETER_TASK_QUEUE, format!("greet-{name}"))
                                .completion_callbacks(vec![callback])
                                .build(),
                        )
                        .await
                        .expect("Greet starts");
                }
                start_operation_response::Variant::AsyncSuccess(start_operation_response::Async {
                    operation_token: format!("greet-{name}"),
                    ..Default::default()
                })
            }
        };
        svc.respond_nexus_task_completed(tonic::Request::new(RespondNexusTaskCompletedRequest {
            namespace: "default".into(),
            identity: "stub".into(),
            task_token: poll.task_token,
            response: Some(Response {
                variant: Some(response::Variant::StartOperation(StartOperationResponse {
                    variant: Some(variant),
                })),
            }),
            ..Default::default()
        }))
        .await
        .expect("respond");
    }
}

async fn create_endpoint(env: &Env) {
    env.client
        .connection()
        .operator_service()
        .create_nexus_endpoint(tonic::Request::new(CreateNexusEndpointRequest {
            spec: Some(EndpointSpec {
                name: ENDPOINT.into(),
                description: None,
                target: Some(EndpointTarget {
                    variant: Some(endpoint_target::Variant::Worker(endpoint_target::Worker {
                        namespace: "default".into(),
                        task_queue: GREETER_TASK_QUEUE.into(),
                    })),
                }),
            }),
        }))
        .await
        .expect("endpoint");
}

#[tokio::test(flavor = "multi_thread")]
async fn caller_sync_and_async_and_a_detached_greet_it_never_waits_for() {
    local(async {
        let env = Env::start().await;
        create_endpoint(&env).await;
        let seen = Arc::new(Mutex::new(Vec::new()));
        let caller = env.worker(caller_types().unwrap());
        let greeter = env.worker(
            WorkerOptions::new(GREETER_TASK_QUEUE)
                .register_workflow::<Greet>()
                .unwrap()
                .build(),
        );
        let h = env
            .client
            .start_workflow(
                Caller::run,
                MultiArgs2("Ada".to_string(), "Grace".to_string()),
                WorkflowStartOptions::new(CALLER_TASK_QUEUE, "caller-1").build(),
            )
            .await
            .unwrap();
        let got = tokio::select! {
            r = env.skipping(h.get_result(WorkflowGetResultOptions::default())) => r.unwrap(),
            _ = stub_handler(&env, seen.clone()) => unreachable!(),
        };
        assert_eq!(
            got,
            Greetings {
                hello: "Hello, Ada".into(),
                greeting: "Greetings, Ada".into()
            }
        );
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                ("Hello".to_string(), "Ada".to_string()),
                ("Greet".to_string(), "Ada".to_string()),
                ("Greet".to_string(), "Grace".to_string()),
            ]
        );
        // Sync Hello completes without starting; async Greet(Ada) starts, then completes; the
        // detached Greet(Grace) starts and the caller closes without its completion.
        let evs = env.events("caller-1").await;
        let count = |t: EventType| evs.iter().filter(|e| e.event_type() == t).count();
        assert_eq!(count(EventType::NexusOperationStarted), 2);
        assert_eq!(count(EventType::NexusOperationCompleted), 2);
        caller.stop().await;
        greeter.stop().await;
        env.shutdown().await;
    })
    .await
}
