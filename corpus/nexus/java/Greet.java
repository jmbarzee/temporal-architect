package nexus;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityOptions;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;

@WorkflowInterface
public interface Greet {
  @WorkflowMethod
  String run(String name);

  /** The activity type is the method name with its first letter capitalized: compose is Compose. */
  @ActivityInterface
  interface GreeterActivities {
    String compose(String name);
  }

  class ComposeImpl implements GreeterActivities {
    @Override
    public String compose(String name) {
      return "Greetings, " + name;
    }
  }

  class Impl implements Greet {
    private final GreeterActivities activities =
        Workflow.newActivityStub(
            GreeterActivities.class,
            ActivityOptions.newBuilder().setStartToCloseTimeout(Duration.ofMinutes(1)).build());

    @Override
    public String run(String name) {
      return activities.compose(name);
    }
  }
}
