package continueasnew;

import io.temporal.worker.Worker;

/** Each .twf worker's registrations, shared by the worker process and the tests. */
public final class Workers {
  public static final String COUNTERS_TASK_QUEUE = "counters";

  private Workers() {}

  public static void registerCounterTypes(Worker worker) {
    worker.registerWorkflowImplementationTypes(Counter.Impl.class);
    worker.registerActivitiesImplementations(new Counter.IncrementImpl());
  }
}
