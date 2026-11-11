use std::{future::Future, sync::Arc, time::Duration};

use corpus_failure::{
    JOBS_TASK_QUEUE,
    job::{Job, JobActivities},
    job_types,
};
use corpus_testkit::{Env, local};
use temporalio_client::{
    WorkflowDescribeOptions, WorkflowExecuteUpdateOptions, WorkflowExecutionStatus,
    WorkflowGetResultOptions, WorkflowSignalOptions, WorkflowStartOptions,
    errors::WorkflowUpdateError,
};
use temporalio_common::protos::temporal::api::{
    enums::v1::EventType,
    failure::v1::{Failure, failure::FailureInfo},
    history::v1::history_event::Attributes,
};
use temporalio_macros::activities;
use temporalio_sdk::activities::{ActivityContext, ActivityError};
use tokio::sync::Semaphore;

/// Process, the slow branch, held until the semaphore closes.
struct Held(Arc<Semaphore>);

#[activities]
impl Held {
    #[allow(dead_code)] // the macro's marker constant: registered by name, never called
    #[activity(name = "Process")]
    async fn process(
        self: Arc<Self>,
        _ctx: ActivityContext,
        _item: String,
    ) -> Result<(), ActivityError> {
        let _ = self.0.acquire().await;
        Ok(())
    }
}

/// Releases the held Process when dropped, so a failed assertion still ends the test.
struct Release(Arc<Semaphore>);

impl Drop for Release {
    fn drop(&mut self) {
        self.0.close();
    }
}

/// Panics if `f` has not finished within 10s of real time: waiting for the held Process would hang.
async fn within<T>(f: impl Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(10), f)
        .await
        .expect("waited for every branch")
}

/// The failure and its causes, outermost first.
fn chain(f: &Failure) -> impl Iterator<Item = &Failure> {
    std::iter::successors(Some(f), |f| f.cause.as_deref())
}

/// Whether the chain holds Reject's own failure.
fn rejected(f: &Failure) -> bool {
    chain(f).any(|f| f.message == "rejected a")
}

/// The activity type of the chain's ActivityFailure.
fn failed_activity(f: &Failure) -> Option<&str> {
    chain(f).find_map(|f| match &f.failure_info {
        Some(FailureInfo::ActivityFailureInfo(i)) => {
            i.activity_type.as_ref().map(|t| t.name.as_str())
        }
        _ => None,
    })
}

#[tokio::test(flavor = "multi_thread")]
async fn reject_fails_the_update_then_the_run_while_process_is_held_and_never_cancelled() {
    local(async {
        let env = Env::start().await;
        let held = Arc::new(Semaphore::new(0));
        let release = Release(held.clone());
        let mut opts = job_types(JobActivities).unwrap();
        opts.register_activities(Held(held));
        let w = env.worker(opts);
        let h = env
            .client
            .start_workflow(
                Job::run,
                "a".to_string(),
                WorkflowStartOptions::new(JOBS_TASK_QUEUE, "job").build(),
            )
            .await
            .unwrap();

        let update =
            within(h.execute_update(Job::attempt, (), WorkflowExecuteUpdateOptions::default()))
                .await;
        assert!(
            matches!(&update, Err(WorkflowUpdateError::Failed(f)) if rejected(f)),
            "the update did not fail with Reject's failure: {update:?}"
        );
        assert_eq!(
            h.describe(WorkflowDescribeOptions::default())
                .await
                .unwrap()
                .status(),
            WorkflowExecutionStatus::Running,
            "the failed update failed the run"
        );

        h.signal(Job::proceed, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        assert!(
            within(h.get_result(WorkflowGetResultOptions::default()))
                .await
                .is_err(),
            "the run succeeded"
        );

        let events = env.events("job").await;
        let run_failure = events.iter().find_map(|e| match &e.attributes {
            Some(Attributes::WorkflowExecutionFailedEventAttributes(a)) => a.failure.as_ref(),
            _ => None,
        });
        assert!(
            run_failure.is_some_and(|f| failed_activity(f) == Some("Reject") && rejected(f)),
            "the run did not fail with Reject's failure: {run_failure:?}"
        );
        let processes = events
            .iter()
            .filter(|e| match &e.attributes {
                Some(Attributes::ActivityTaskScheduledEventAttributes(a)) => a
                    .activity_type
                    .as_ref()
                    .is_some_and(|t| t.name == "Process"),
                _ => false,
            })
            .count();
        assert_eq!(
            processes, 2,
            "Process did not start beside Reject in both await alls"
        );
        let has = |t| events.iter().any(|e| e.event_type() == t);
        assert!(
            !has(EventType::ActivityTaskCompleted),
            "Process completed first"
        );
        assert!(
            !has(EventType::ActivityTaskCancelRequested),
            "Process was cancelled"
        );

        drop(release);
        w.stop().await;
        env.shutdown().await;
    })
    .await
}
