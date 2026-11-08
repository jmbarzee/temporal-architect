package nexus;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.temporal.api.enums.v1.WorkflowExecutionStatus;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.testing.TestWorkflowEnvironment;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class NexusTest {
  private TestWorkflowEnvironment env;

  @BeforeEach
  void setUp() {
    env = TestWorkflowEnvironment.newInstance();
    env.createNexusEndpoint(GreeterService.ENDPOINT, Workers.GREETER_TASK_QUEUE);
  }

  @AfterEach
  void tearDown() {
    env.close();
  }

  @Test
  void callerSyncAndAsyncAndADetachedGreetItNeverWaitsFor() throws InterruptedException {
    CountDownLatch release = new CountDownLatch(1);
    Workers.registerCallerTypes(env.newWorker(Workers.CALLER_TASK_QUEUE));
    // Grace's greeting is held until after Caller returns.
    Workers.registerGreeterTypes(
        env.newWorker(Workers.GREETER_TASK_QUEUE),
        name -> {
          if (name.equals("Grace")) {
            try {
              release.await();
            } catch (InterruptedException e) {
              throw new IllegalStateException(e);
            }
          }
          return "Greetings, " + name;
        });
    env.start();
    WorkflowClient client = env.getWorkflowClient();

    Caller caller =
        client.newWorkflowStub(
            Caller.class,
            WorkflowOptions.newBuilder()
                .setTaskQueue(Workers.CALLER_TASK_QUEUE)
                .setWorkflowId("caller-1")
                .build());
    assertEquals(new Caller.Greetings("Hello, Ada", "Greetings, Ada"), caller.run("Ada", "Grace"));

    String grace = Greet.id("Grace");
    assertEquals(
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_RUNNING,
        client.newUntypedWorkflowStub(grace).describe().getStatus(),
        "Caller awaited its detached Greet");
    release.countDown();
    assertEquals("Greetings, Grace", client.newUntypedWorkflowStub(grace).getResult(String.class));
  }

  @Test
  void greet() {
    Workers.registerGreeterTypes(env.newWorker(Workers.GREETER_TASK_QUEUE));
    env.start();
    Greet greet = env.getWorkflowClient().newWorkflowStub(Greet.class, Greet.startOptions("Ada"));
    assertEquals("Greetings, Ada", greet.run("Ada"));
  }
}
