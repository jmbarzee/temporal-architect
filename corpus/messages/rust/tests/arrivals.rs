use std::{collections::BTreeMap, time::Duration};

use corpus_messages::fixtures::{AwaitOne, CancelledWaiter, NaiveTwoWaiters, PromiseThenAwait, TwoWaiters};
use corpus_testkit::Env;
use temporalio_client::{WorkflowGetResultOptions, WorkflowSignalOptions, WorkflowStartOptions};
use temporalio_sdk::WorkerOptions;

const TQ: &str = "arrivals";

async fn env() -> (Env, corpus_testkit::RunningWorker) {
    let env = Env::start().await;
    let opts = WorkerOptions::new(TQ)
        .register_workflow::<TwoWaiters>().unwrap()
        .register_workflow::<PromiseThenAwait>().unwrap()
        .register_workflow::<CancelledWaiter>().unwrap()
        .register_workflow::<AwaitOne>().unwrap()
        .register_workflow::<NaiveTwoWaiters>().unwrap()
        .build();
    let w = env.worker(opts);
    (env, w)
}

/// Runs the workflow, sending X "1" after a minute and X "2" after two.
macro_rules! with_two_xs {
    ($wf:ident, $input:expr) => {corpus_testkit::local(async {
        let (env, w) = env().await;
        let h = env
            .client
            .start_workflow($wf::run, $input, WorkflowStartOptions::new(TQ, stringify!($wf)).build())
            .await
            .unwrap();
        env.sleep(Duration::from_secs(60)).await;
        h.signal($wf::x, "1".to_string(), WorkflowSignalOptions::default()).await.unwrap();
        env.sleep(Duration::from_secs(60)).await;
        // A workflow that needed only one X has completed by now.
        let _ = h.signal($wf::x, "2".to_string(), WorkflowSignalOptions::default()).await;
        let got = env.skipping(h.get_result(WorkflowGetResultOptions::default())).await.unwrap();
        w.stop().await;
        env.shutdown().await;
        got
    }).await};
}

fn map(kv: &[(&str, &str)]) -> BTreeMap<String, String> {
    kv.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn arrivals_go_to_waiters_in_the_order_they_began() {
    assert_eq!(with_two_xs!(TwoWaiters, ()), map(&[("began first", "1"), ("created first", "2")]));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_promise_begins_waiting_at_its_binding() {
    assert_eq!(with_two_xs!(PromiseThenAwait, ()), map(&[("promise", "1"), ("await", "2")]));
}

#[tokio::test(flavor = "multi_thread")]
async fn await_one_the_case_wins_and_takes() {
    assert_eq!(with_two_xs!(AwaitOne, Duration::from_secs(3600)), vec!["case 1", "then 2"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn await_one_the_timer_wins_and_the_case_takes_nothing() {
    assert_eq!(with_two_xs!(AwaitOne, Duration::from_secs(1)), vec!["timer", "then 1"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_dropped_waiter_leaves_the_line() {
    assert_eq!(with_two_xs!(CancelledWaiter, ()), "1");
}

#[tokio::test(flavor = "multi_thread")]
async fn naive_wait_per_waiter_serves_poll_order_not_wait_order() {
    // join! polls its futures in declaration order, so no arrival is lost, but the waiter
    // declared first takes the first arrival although the other began waiting first.
    assert_eq!(with_two_xs!(NaiveTwoWaiters, ()), map(&[("began first", "2"), ("created first", "1")]));
}
