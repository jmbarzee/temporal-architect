package nexus;

import io.temporal.workflow.NexusOperationCancellationType;
import io.temporal.workflow.NexusOperationOptions;
import io.temporal.workflow.NexusServiceOptions;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

@WorkflowInterface
public interface Caller {
  @WorkflowMethod
  Greetings run(String name, String friend);

  record Greetings(String hello, String greeting) {}

  class Impl implements Caller {
    private final GreeterService greeter =
        Workflow.newNexusServiceStub(
            GreeterService.class,
            NexusServiceOptions.newBuilder().setEndpoint(GreeterService.ENDPOINT).build());

    // detach: never propagate cancellation (NexusOperationCancellationType is @Experimental).
    private final GreeterService detached =
        Workflow.newNexusServiceStub(
            GreeterService.class,
            NexusServiceOptions.newBuilder()
                .setEndpoint(GreeterService.ENDPOINT)
                .setOperationOptions(
                    NexusOperationOptions.newBuilder()
                        .setCancellationType(NexusOperationCancellationType.ABANDON)
                        .build())
                .build());

    @Override
    public Greetings run(String name, String friend) {
      String hello = greeter.hello(name);
      String greeting = greeter.greet(name);
      // detach: wait for the start, never the result.
      Workflow.startNexusOperation(detached::greet, friend).getExecution().get();
      return new Greetings(hello, greeting);
    }
  }
}
