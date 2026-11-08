package nexus;

import io.temporal.worker.Worker;

/** Each .twf worker's registrations, shared by the worker process and the tests. */
public final class Workers {
  public static final String CALLER_TASK_QUEUE = "caller";
  public static final String GREETER_TASK_QUEUE = "greeter";

  private Workers() {}

  public static void registerCallerTypes(Worker worker) {
    worker.registerWorkflowImplementationTypes(Caller.Impl.class);
  }

  public static void registerGreeterTypes(Worker worker) {
    registerGreeterTypes(worker, new Greet.ComposeImpl());
  }

  /** registerGreeterTypes with the activities given, so a test can hold one. */
  public static void registerGreeterTypes(Worker worker, Greet.GreeterActivities activities) {
    worker.registerWorkflowImplementationTypes(Greet.Impl.class);
    worker.registerActivitiesImplementations(activities);
    worker.registerNexusServiceImplementation(new GreeterServiceImpl());
  }
}
