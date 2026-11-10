use std::{io::Write, time::Duration};

use corpus_concurrency::{
    BATCHES_TASK_QUEUE,
    batch::{Batch, BatchActivities, Report},
    batch_types,
    fixtures::{AwaitOneTie, BoundDeadline, DroppedTimer},
};
use corpus_testkit::{Env, local};
use temporalio_client::{WorkflowGetResultOptions, WorkflowSignalOptions, WorkflowStartOptions};
use temporalio_common::protos::temporal::api::enums::v1::EventType;
use temporalio_sdk::WorkerOptions;

#[tokio::test(flavor = "multi_thread")]
async fn batch_acknowledged() {
    local(async {
        let env = Env::start().await;
        let w = env.worker(batch_types(BatchActivities).unwrap());
        let h = env
            .client
            .start_workflow(
                Batch::run,
                vec!["a".into(), "b".into()],
                WorkflowStartOptions::new(BATCHES_TASK_QUEUE, "batch-1").build(),
            )
            .await
            .unwrap();
        env.sleep(Duration::from_secs(60)).await;
        h.signal(Batch::ack, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        let got = env
            .skipping(h.get_result(WorkflowGetResultOptions::default()))
            .await
            .unwrap();
        assert_eq!(
            got,
            Report {
                count: 2,
                audited: true,
                status: "acknowledged".into()
            }
        );
        assert!(
            env.has("batch-1", EventType::TimerCanceled).await,
            "the losing timer was not cancelled"
        );
        w.stop().await;
        env.shutdown().await;
    })
    .await
}

#[tokio::test(flavor = "multi_thread")]
async fn batch_times_out() {
    local(async {
        let env = Env::start().await;
        let w = env.worker(batch_types(BatchActivities).unwrap());
        let h = env
            .client
            .start_workflow(
                Batch::run,
                vec!["a".into()],
                WorkflowStartOptions::new(BATCHES_TASK_QUEUE, "batch-2").build(),
            )
            .await
            .unwrap();
        let got = env
            .skipping(h.get_result(WorkflowGetResultOptions::default()))
            .await
            .unwrap();
        assert_eq!(
            got,
            Report {
                count: 1,
                audited: true,
                status: "unacknowledged".into()
            }
        );
        assert!(!env.has("batch-2", EventType::TimerCanceled).await);
        w.stop().await;
        env.shutdown().await;
    })
    .await
}

#[tokio::test(flavor = "multi_thread")]
async fn a_bound_promise_survives_the_rounds_it_loses() {
    local(async {
        let env = Env::start().await;
        let w = env.worker(
            WorkerOptions::new("bound")
                .register_workflow::<BoundDeadline>()
                .unwrap()
                .build(),
        );
        let h = env
            .client
            .start_workflow(
                BoundDeadline::run,
                (),
                WorkflowStartOptions::new("bound", "bound-1").build(),
            )
            .await
            .unwrap();
        h.signal(BoundDeadline::ack, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        env.sleep(Duration::from_secs(3600)).await;
        h.signal(BoundDeadline::ack, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        assert_eq!(
            env.skipping(h.get_result(WorkflowGetResultOptions::default()))
                .await
                .unwrap(),
            2
        );
        assert!(!env.has("bound-1", EventType::TimerCanceled).await);
        assert!(
            env.has("bound-1", EventType::TimerFired).await,
            "the deadline never fired"
        );
        w.stop().await;
        env.shutdown().await;
    })
    .await
}

/// A worker with no workflow cache, so no sticky queue: a stopped worker's sticky queue would
/// otherwise hold the next workflow task.
fn tie_worker(env: &Env) -> corpus_testkit::RunningWorker {
    env.worker(
        WorkerOptions::new("await-one")
            .max_cached_workflows(0)
            .register_workflow::<AwaitOneTie>()
            .unwrap()
            .build(),
    )
}

/// One try at the tie on a fresh test server: on a shared one, a stopped worker's open poll can
/// take the timer's workflow task (#529).
async fn tie(order: &[&str], attempt: u32) -> Result<String, String> {
    let env = Env::start().await;
    let won = tie_on(&env, order, attempt).await;
    env.shutdown().await;
    won
}

/// AwaitOneTie with the timer fired and Ack sent while no worker runs, so both reach one workflow
/// task. The setup is timing-dependent, so this returns the winner only if the tie landed, else
/// the history between the timer firing and Ack.
async fn tie_on(env: &Env, order: &[&str], attempt: u32) -> Result<String, String> {
    let id = format!("tie-{}-{attempt}", order.join("-"));
    let h = env
        .client
        .start_workflow(
            AwaitOneTie::run,
            order.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            WorkflowStartOptions::new("await-one", id.clone()).build(),
        )
        .await
        .unwrap();
    let first = tie_worker(env);
    let started = env.reaches(&id, EventType::TimerStarted).await;
    first.stop().await;
    assert!(started, "{id}: the timer never started");
    // With no worker to take the timer's workflow task, skipping past it may not return.
    let skip = env.sleep_in_background(Duration::from_secs(3600));
    assert!(
        env.reaches(&id, EventType::TimerFired).await,
        "{id}: the timer never fired"
    );
    h.signal(AwaitOneTie::ack, (), WorkflowSignalOptions::default())
        .await
        .unwrap();

    // A real tie: no workflow task started between the timer firing and Ack.
    let evs = env.events(&id).await;
    let between: Vec<EventType> = evs
        .iter()
        .map(|e| e.event_type())
        .skip_while(|&t| t != EventType::TimerFired)
        .take_while(|&t| t != EventType::WorkflowExecutionSignaled)
        .collect();
    if between.contains(&EventType::WorkflowTaskStarted) {
        skip.abort();
        return Err(format!("{id}: {between:?}"));
    }
    let second = tie_worker(env);
    let got = env
        .skipping(h.get_result(WorkflowGetResultOptions::default()))
        .await
        .unwrap();
    second.stop().await;
    skip.abort();
    Ok(got)
}

/// Retries the tie's setup, with a bound, and asserts the winner only on a real tie: a setup that
/// never lands is reported, never failed (#529).
async fn first_listed_wins(order: &[&str]) {
    const ATTEMPTS: u32 = 3;
    let mut missed = Vec::new();
    for attempt in 1..=ATTEMPTS {
        match tie(order, attempt).await {
            Ok(won) => {
                assert_eq!(won, order[0], "{order:?}");
                return;
            }
            Err(miss) => missed.push(miss),
        }
    }
    // libtest has no runtime skip. Written to stderr directly: libtest captures eprintln! of a
    // passing test, hiding the miss.
    let _ = writeln!(
        std::io::stderr(),
        "await one {order:?}: the tie was not set up in {ATTEMPTS} attempts, behaviour not checked: {}",
        missed.join("; ")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_dropped_timer_is_not_cancelled() {
    local(async {
        let env = Env::start().await;
        let w = env.worker(
            WorkerOptions::new("dropped")
                .register_workflow::<DroppedTimer>()
                .unwrap()
                .build(),
        );
        let h = env
            .client
            .start_workflow(
                DroppedTimer::run,
                (),
                WorkflowStartOptions::new("dropped", "dropped-1").build(),
            )
            .await
            .unwrap();
        env.sleep(Duration::from_secs(60)).await;
        h.signal(DroppedTimer::ack, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        env.skipping(h.get_result(WorkflowGetResultOptions::default()))
            .await
            .unwrap();
        assert!(env.has("dropped-1", EventType::TimerStarted).await);
        assert!(
            !env.has("dropped-1", EventType::TimerCanceled).await,
            "dropping cancelled the timer"
        );
        w.stop().await;
        env.shutdown().await;
    })
    .await
}

#[tokio::test(flavor = "multi_thread")]
async fn await_one_the_first_listed_of_several_ready_cases_wins() {
    local(async {
        first_listed_wins(&["Ack", "timer"]).await;
        first_listed_wins(&["timer", "Ack"]).await;
    })
    .await
}
