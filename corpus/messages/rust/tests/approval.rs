use std::time::Duration;

use corpus_messages::{
    APPROVALS_TASK_QUEUE,
    approval::{Approval, Decision},
    approval_types,
};
use corpus_testkit::Env;
use temporalio_client::{
    WorkflowExecuteUpdateOptions, WorkflowGetResultOptions, WorkflowQueryOptions,
    WorkflowSignalOptions, WorkflowStartOptions,
};

// A macro, not a fn: the handle's type names the macro-generated `Run` marker, which is private.
macro_rules! start {
    ($env:expr, $id:expr) => {
        $env.client
            .start_workflow(
                Approval::run,
                "access".to_string(),
                WorkflowStartOptions::new(APPROVALS_TASK_QUEUE, $id).build(),
            )
            .await
            .expect("start")
    };
}

#[tokio::test(flavor = "multi_thread")]
async fn approval() {
    corpus_testkit::local(async {
        let env = Env::start().await;
        let w = env.worker(approval_types().unwrap());
        let h = start!(env, "approval-1");
        // Approve arrives before anything waits for it, and stays pending.
        env.sleep(Duration::from_secs(30)).await;
        h.signal(
            Approval::approve,
            "Grace".into(),
            WorkflowSignalOptions::default(),
        )
        .await
        .unwrap();
        env.sleep(Duration::from_secs(30)).await;
        h.signal(Approval::open, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        env.sleep(Duration::from_secs(60)).await;
        assert_eq!(
            h.query(Approval::status, (), WorkflowQueryOptions::default())
                .await
                .unwrap(),
            "open"
        );
        assert_eq!(
            h.execute_update(
                Approval::review,
                "LGTM".into(),
                WorkflowExecuteUpdateOptions::default()
            )
            .await
            .unwrap(),
            "reviewed"
        );
        let got = env
            .skipping(h.get_result(WorkflowGetResultOptions::default()))
            .await
            .unwrap();
        assert_eq!(
            got,
            Decision {
                request: "access".into(),
                approver: "Grace".into(),
                note: "LGTM".into(),
                status: "reviewed".into()
            }
        );
        w.stop().await;
        env.shutdown().await;
    })
    .await
}

#[tokio::test(flavor = "multi_thread")]
async fn review_caller_gets_its_result_before_any_waiter_takes_it() {
    corpus_testkit::local(async {
        let env = Env::start().await;
        let w = env.worker(approval_types().unwrap());
        let h = start!(env, "approval-2");
        // Review arrives while Approval still awaits Open, before anything waits for Review.
        env.sleep(Duration::from_secs(30)).await;
        assert_eq!(
            h.execute_update(
                Approval::review,
                "LGTM".into(),
                WorkflowExecuteUpdateOptions::default()
            )
            .await
            .unwrap(),
            "reviewed"
        );
        h.signal(Approval::open, (), WorkflowSignalOptions::default())
            .await
            .unwrap();
        env.sleep(Duration::from_secs(60)).await;
        h.signal(
            Approval::approve,
            "Grace".into(),
            WorkflowSignalOptions::default(),
        )
        .await
        .unwrap();
        let got = env
            .skipping(h.get_result(WorkflowGetResultOptions::default()))
            .await
            .unwrap();
        assert_eq!(
            got,
            Decision {
                request: "access".into(),
                approver: "Grace".into(),
                note: "LGTM".into(),
                status: "approved".into()
            }
        );
        w.stop().await;
        env.shutdown().await;
    })
    .await
}
