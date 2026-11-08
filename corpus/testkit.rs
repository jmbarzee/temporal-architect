//! The corpus's time-skipping test environment: Temporal's test server (downloaded and cached by
//! `temporalio-sdk-core`'s `ephemeral-server` feature), a client bound to it, and workers run on
//! the test's tokio runtime. The SDK's own `testing` feature starts only a dev server, which does
//! not skip time.

use std::{future::Future, time::Duration};

use temporalio_client::{
    Client, ClientOptions, ConnectionOptions, Url, WorkflowFetchHistoryOptions,
};
use temporalio_common::protos::temporal::api::{
    enums::v1::EventType, history::v1::HistoryEvent, testservice::v1::SleepRequest,
};
use temporalio_sdk::{Worker, WorkerOptions};
use temporalio_sdk_core::ephemeral_server::{
    EphemeralServer, TestServerConfig, default_cached_download,
};

pub use temporalio_sdk::Runtime;

/// Runs a test body on a `LocalSet`, so that it can start workers.
pub async fn local<T>(f: impl Future<Output = T>) -> T {
    tokio::task::LocalSet::new().run_until(f).await
}

pub struct Env {
    server: EphemeralServer,
    pub client: Client,
    pub runtime: Runtime,
}

/// A running worker; `stop` shuts it down and waits for it.
pub struct RunningWorker {
    shutdown: Box<dyn Fn() + Send + Sync>,
    done: tokio::task::JoinHandle<()>,
}

impl RunningWorker {
    pub async fn stop(self) {
        (self.shutdown)();
        let _ = tokio::time::timeout(Duration::from_secs(10), self.done).await;
    }
}

impl Env {
    pub async fn start() -> Env {
        let server = TestServerConfig::builder()
            .exe(default_cached_download())
            .build()
            .start_server_with_output(std::process::Stdio::null(), std::process::Stdio::null())
            .await
            .expect("test server starts");
        let conn =
            ConnectionOptions::new(Url::parse(&format!("http://{}", server.target)).unwrap())
                .identity("corpus".to_owned())
                .build();
        let client = Client::connect(conn, ClientOptions::new("default").build())
            .await
            .expect("client connects");
        let runtime = Runtime::from_current_tokio(Default::default()).expect("runtime");
        Env {
            server,
            client,
            runtime,
        }
    }

    /// Starts a worker on its own local task: `Worker::run` is not `Send` (workflow state is
    /// `Rc<RefCell<…>>`), so the test body runs inside [`local`].
    pub fn worker(&self, opts: WorkerOptions) -> RunningWorker {
        let mut worker = Worker::new(&self.runtime, self.client.clone(), opts).expect("worker");
        let shutdown = worker.shutdown_handle();
        let done = tokio::task::spawn_local(async move {
            worker.run().await.expect("worker runs");
        });
        RunningWorker {
            shutdown: Box::new(shutdown),
            done,
        }
    }

    /// Skips `d` of test-server time, as other SDKs' `env.sleep`.
    pub async fn sleep(&self, d: Duration) {
        skip(&self.client, d).await.expect("sleep");
    }

    /// [`sleep`](Self::sleep) on its own task, for a skip that may not return because it waits
    /// on a workflow task no worker takes; abort it when done.
    pub fn sleep_in_background(&self, d: Duration) -> tokio::task::JoinHandle<()> {
        let client = self.client.clone();
        tokio::spawn(async move {
            let _ = skip(&client, d).await;
        })
    }

    /// Runs `f` (usually a result wait) with time skipping unlocked, as other SDKs' result waits do.
    pub async fn skipping<T>(&self, f: impl Future<Output = T>) -> T {
        let mut ts = self.client.connection().test_service();
        ts.unlock_time_skipping(tonic::Request::new(Default::default()))
            .await
            .expect("unlock");
        let out = f.await;
        ts.lock_time_skipping(tonic::Request::new(Default::default()))
            .await
            .expect("lock");
        out
    }

    /// The workflow's history events.
    pub async fn events(&self, workflow_id: &str) -> Vec<HistoryEvent> {
        self.client
            .get_workflow_handle::<temporalio_client::UntypedWorkflow>(workflow_id)
            .fetch_history(WorkflowFetchHistoryOptions::default())
            .into_events()
            .await
            .expect("history")
    }

    pub async fn has(&self, workflow_id: &str, t: EventType) -> bool {
        self.events(workflow_id)
            .await
            .iter()
            .any(|e| e.event_type() == t)
    }

    /// Whether an event of the type reaches history within 10s of real time.
    pub async fn reaches(&self, workflow_id: &str, t: EventType) -> bool {
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !self.has(workflow_id, t).await {
            if std::time::Instant::now() >= deadline {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        true
    }

    pub async fn shutdown(mut self) {
        self.server.shutdown().await.expect("test server stops");
    }
}

async fn skip(client: &Client, d: Duration) -> Result<(), tonic::Status> {
    client
        .connection()
        .test_service()
        .unlock_time_skipping_with_sleep(tonic::Request::new(SleepRequest {
            duration: Some(d.try_into().unwrap()),
        }))
        .await
        .map(drop)
}
