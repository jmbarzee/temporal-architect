package concurrency;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityOptions;
import io.temporal.api.enums.v1.ParentClosePolicy;
import io.temporal.workflow.Async;
import io.temporal.workflow.ChildWorkflowCancellationType;
import io.temporal.workflow.ChildWorkflowOptions;
import io.temporal.workflow.Promise;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;
import java.util.List;

@WorkflowInterface
public interface Batch {
  @WorkflowMethod
  Report run(List<String> items);

  @SignalMethod(name = "Ack")
  void ack();

  record Report(long count, boolean audited, String status) {}

  /** Activity types are method names with the first letter capitalized: Count, Store. */
  @ActivityInterface
  interface BatchActivities {
    long count(List<String> items);

    void store(List<String> items);
  }

  class ActivitiesImpl implements BatchActivities {
    @Override
    public long count(List<String> items) {
      return items.size();
    }

    @Override
    public void store(List<String> items) {}
  }

  ActivityOptions ACTIVITY_OPTIONS =
      ActivityOptions.newBuilder().setStartToCloseTimeout(Duration.ofMinutes(1)).build();

  class Impl implements Batch {
    private String status = "unacknowledged";
    private int acks; // pending arrivals of Ack

    @Override
    public void ack() {
      status = "acknowledged";
      acks++;
    }

    @Override
    public Report run(List<String> items) {
      BatchActivities activities = Workflow.newActivityStub(BatchActivities.class, ACTIVITY_OPTIONS);
      Audit audit = Workflow.newChildWorkflowStub(Audit.class);

      // await all
      Promise<Long> count = Async.function(activities::count, items);
      Promise<Boolean> audited = Async.function(audit::run, items);
      Promise.allOf(count, audited).get();

      // detach: abandon the child, never request its cancellation, and wait only for its start.
      Archive archive =
          Workflow.newChildWorkflowStub(
              Archive.class,
              ChildWorkflowOptions.newBuilder()
                  .setParentClosePolicy(ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON)
                  .setCancellationType(ChildWorkflowCancellationType.ABANDON)
                  .build());
      Async.procedure(archive::run, items);
      Workflow.getWorkflowExecution(archive).get();

      // await one: one await over every case, then the first listed that is ready wins,
      // so Ack wins a tie with the timer. The losing timer is not cancelled (spec 06).
      Promise<Void> timer = Workflow.newTimer(Duration.ofHours(1));
      Workflow.await(() -> acks > 0 || timer.isCompleted());
      if (acks > 0) {
        acks--;
      }

      return new Report(count.get(), audited.get(), status);
    }
  }

  @WorkflowInterface
  interface Audit {
    @WorkflowMethod
    boolean run(List<String> items);

    class Impl implements Audit {
      @Override
      public boolean run(List<String> items) {
        return !items.isEmpty();
      }
    }
  }

  @WorkflowInterface
  interface Archive {
    @WorkflowMethod
    void run(List<String> items);

    class Impl implements Archive {
      @Override
      public void run(List<String> items) {
        Workflow.newActivityStub(BatchActivities.class, ACTIVITY_OPTIONS).store(items);
      }
    }
  }
}
