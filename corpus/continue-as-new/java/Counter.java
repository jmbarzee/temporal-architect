package continueasnew;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityOptions;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;

@WorkflowInterface
public interface Counter {
  @WorkflowMethod
  long run(long count, long limit);

  /** The activity type is the method name with its first letter capitalized: increment is Increment. */
  @ActivityInterface
  interface CounterActivities {
    long increment(long count);
  }

  class IncrementImpl implements CounterActivities {
    @Override
    public long increment(long count) {
      return count + 1;
    }
  }

  class Impl implements Counter {
    private final CounterActivities activities =
        Workflow.newActivityStub(
            CounterActivities.class,
            ActivityOptions.newBuilder().setStartToCloseTimeout(Duration.ofMinutes(1)).build());

    @Override
    public long run(long count, long limit) {
      Workflow.sleep(Duration.ofMinutes(1));
      long next = activities.increment(count);
      if (next >= limit) {
        return next;
      }
      // The stub's call never returns: it ends this run and starts the next.
      return Workflow.newContinueAsNewStub(Counter.class).run(next, limit);
    }
  }
}
