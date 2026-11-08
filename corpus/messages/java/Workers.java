package messages;

import io.temporal.worker.Worker;

/** Each .twf worker's registrations, shared by the worker process and the tests. */
public final class Workers {
  public static final String APPROVALS_TASK_QUEUE = "approvals";

  private Workers() {}

  public static void registerApprovalTypes(Worker worker) {
    worker.registerWorkflowImplementationTypes(ApprovalImpl.class);
  }
}
