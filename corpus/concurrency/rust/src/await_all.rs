use std::{cell::RefCell, future::Future};

use futures::FutureExt;
use temporalio_sdk::{WorkflowCancellationToken, WorkflowTermination, workflows::select};

/// One `await all`: it fails at its first branch failure, and the other branches keep running.
#[derive(Default)]
pub struct AwaitAll {
    failed: WorkflowCancellationToken,
    failure: RefCell<Option<WorkflowTermination>>,
}

impl AwaitAll {
    /// Every branch's output, or the first branch failure, the rest left running.
    pub async fn wait<T>(
        &self,
        branches: impl Future<Output = T>,
    ) -> Result<T, WorkflowTermination> {
        select! {
            done = branches.fuse() => Ok(done),
            _ = self.failed.cancelled() => Err(self.failure.take().expect("set before failed")),
        }
    }

    /// A branch: its value, or, on failure, it keeps the failure if first, wakes `wait`, and
    /// never completes.
    pub async fn branch<T, E: Into<WorkflowTermination>>(
        &self,
        call: impl Future<Output = Result<T, E>>,
    ) -> T {
        match call.await {
            Ok(v) => v,
            Err(e) => {
                self.failure.borrow_mut().get_or_insert(e.into());
                self.failed.cancel();
                std::future::pending().await
            }
        }
    }
}
