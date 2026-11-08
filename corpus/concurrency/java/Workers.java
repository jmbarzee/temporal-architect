package concurrency;

import io.temporal.worker.Worker;

/** Each .twf worker's registrations, shared by the worker process and the tests. */
public final class Workers {
  public static final String BATCHES_TASK_QUEUE = "batches";

  private Workers() {}

  public static void registerBatchTypes(Worker worker) {
    worker.registerWorkflowImplementationTypes(
        Batch.Impl.class, Batch.Audit.Impl.class, Batch.Archive.Impl.class);
    worker.registerActivitiesImplementations(new Batch.ActivitiesImpl());
  }
}
