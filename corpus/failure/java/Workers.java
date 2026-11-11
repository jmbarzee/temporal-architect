package failure;

import io.temporal.worker.Worker;

/** Each .twf worker's registrations, shared by the worker process and the tests. */
public final class Workers {
  public static final String JOBS_TASK_QUEUE = "jobs";

  private Workers() {}

  public static void registerJobTypes(Worker worker, Job.JobActivities activities) {
    worker.registerWorkflowImplementationTypes(Job.Impl.class);
    worker.registerActivitiesImplementations(activities);
  }
}
