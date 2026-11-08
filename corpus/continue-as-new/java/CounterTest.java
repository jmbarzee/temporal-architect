package continueasnew;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.temporal.api.common.v1.WorkflowExecution;
import io.temporal.api.enums.v1.WorkflowExecutionStatus;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowTargetOptions;
import io.temporal.testing.TestWorkflowEnvironment;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CounterTest {
  private TestWorkflowEnvironment env;

  @BeforeEach
  void setUp() {
    env = TestWorkflowEnvironment.newInstance();
    Workers.registerCounterTypes(env.newWorker(Workers.COUNTERS_TASK_QUEUE));
    env.start();
  }

  @AfterEach
  void tearDown() {
    env.close();
  }

  private Counter counter(String id) {
    return env.getWorkflowClient()
        .newWorkflowStub(
            Counter.class,
            WorkflowOptions.newBuilder()
                .setTaskQueue(Workers.COUNTERS_TASK_QUEUE)
                .setWorkflowId(id)
                .build());
  }

  @Test
  void counterCompletesAtTheLimit() {
    assertEquals(3, counter("counter-1").run(2, 3));
  }

  @Test
  void counterContinuesAsNewBelowIt() {
    WorkflowClient client = env.getWorkflowClient();
    WorkflowExecution first = WorkflowClient.start(counter("counter-2")::run, 0L, 3L);
    // A stub with no run id follows the chain of runs to the last one's result.
    assertEquals(3L, client.newUntypedWorkflowStub("counter-2").getResult(Long.class));
    assertEquals(
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_CONTINUED_AS_NEW,
        client
            .newUntypedWorkflowStub(WorkflowTargetOptions.newBuilder().setWorkflowExecution(first).build())
            .describe()
            .getStatus());
  }
}
