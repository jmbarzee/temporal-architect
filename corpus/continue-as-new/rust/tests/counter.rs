use corpus_continue_as_new::{COUNTERS_TASK_QUEUE, counter::Counter, counter_types};
use corpus_testkit::{Env, local};
use temporalio_client::{WorkflowFetchHistoryOptions, WorkflowGetResultOptions, WorkflowStartOptions};
use temporalio_common::{data_converters::MultiArgs2, protos::temporal::api::enums::v1::EventType};

#[tokio::test(flavor = "multi_thread")]
async fn counter_completes_at_the_limit() {
    local(async {
        let env = Env::start().await;
        let w = env.worker(counter_types().unwrap());
        let h = env
            .client
            .start_workflow(Counter::run, MultiArgs2(2, 3), WorkflowStartOptions::new(COUNTERS_TASK_QUEUE, "counter-1").build())
            .await
            .unwrap();
        assert_eq!(env.skipping(h.get_result(WorkflowGetResultOptions::default())).await.unwrap(), 3);
        w.stop().await;
        env.shutdown().await;
    })
    .await
}

#[tokio::test(flavor = "multi_thread")]
async fn counter_continues_as_new_below_it() {
    local(async {
        let env = Env::start().await;
        let w = env.worker(counter_types().unwrap());
        let h = env
            .client
            .start_workflow(Counter::run, MultiArgs2(0, 3), WorkflowStartOptions::new(COUNTERS_TASK_QUEUE, "counter-2").build())
            .await
            .unwrap();
        // get_result follows the chain of runs to the last one's result.
        assert_eq!(env.skipping(h.get_result(WorkflowGetResultOptions::default())).await.unwrap(), 3);
        // The handle is bound to the first run, which continued as new.
        let first = h.fetch_history(WorkflowFetchHistoryOptions::default()).into_events().await.unwrap();
        assert_eq!(first.last().unwrap().event_type(), EventType::WorkflowExecutionContinuedAsNew);
        w.stop().await;
        env.shutdown().await;
    })
    .await
}
