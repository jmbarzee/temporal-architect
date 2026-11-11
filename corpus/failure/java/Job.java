package failure;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.failure.ApplicationFailure;
import io.temporal.workflow.Async;
import io.temporal.workflow.Promise;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.UpdateMethod;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInit;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;

@WorkflowInterface
public interface Job {
  @WorkflowMethod
  void run(String item);

  @SignalMethod(name = "Proceed")
  void proceed();

  @UpdateMethod(name = "Attempt")
  void attempt();

  /** Activity types are method names with the first letter capitalized: Reject, Process. */
  @ActivityInterface
  interface JobActivities {
    ActivityOptions REJECT_DEFAULTS =
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(1))
            .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(1).build())
            .build();

    ActivityOptions PROCESS_DEFAULTS =
        ActivityOptions.newBuilder().setStartToCloseTimeout(Duration.ofMinutes(1)).build();

    void reject(String item);

    void process(String item);
  }

  class ActivitiesImpl implements JobActivities {
    @Override
    public void reject(String item) {
      throw ApplicationFailure.newFailure("rejected " + item, "Rejected");
    }

    @Override
    public void process(String item) {}
  }

  class Impl implements Job {
    private final JobActivities rejects =
        Workflow.newActivityStub(JobActivities.class, JobActivities.REJECT_DEFAULTS);
    private final JobActivities processes =
        Workflow.newActivityStub(JobActivities.class, JobActivities.PROCESS_DEFAULTS);
    private final String item;
    private boolean proceeding;

    @WorkflowInit
    public Impl(String item) {
      this.item = item;
    }

    @Override
    public void proceed() {
      proceeding = true;
    }

    @Override
    public void attempt() {
      rejectAndProcess();
    }

    @Override
    public void run(String item) {
      Workflow.await(() -> proceeding);
      rejectAndProcess();
    }

    // await all: allOf fails at Reject's failure, and Process keeps running. Left uncaught,
    // the failure fails the run from run() and only the update from attempt().
    private void rejectAndProcess() {
      Promise<Void> reject = Async.procedure(rejects::reject, item);
      Promise<Void> process = Async.procedure(processes::process, item);
      Promise.allOf(reject, process).get();
    }
  }
}
