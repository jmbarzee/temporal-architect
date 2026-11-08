package messages;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.testing.TestWorkflowEnvironment;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ApprovalTest {
  private TestWorkflowEnvironment env;

  @BeforeEach
  void setUp() {
    env = TestWorkflowEnvironment.newInstance();
    Workers.registerApprovalTypes(env.newWorker(Workers.APPROVALS_TASK_QUEUE));
    env.start();
  }

  @AfterEach
  void tearDown() {
    env.close();
  }

  private Approval start(String id) {
    Approval wf =
        env.getWorkflowClient()
            .newWorkflowStub(
                Approval.class,
                WorkflowOptions.newBuilder()
                    .setTaskQueue(Workers.APPROVALS_TASK_QUEUE)
                    .setWorkflowId(id)
                    .build());
    WorkflowClient.start(wf::run, "access");
    return wf;
  }

  @Test
  void approval() {
    Approval wf = start("approval-1");
    // Approve arrives before anything waits for it, and stays pending.
    env.sleep(Duration.ofSeconds(30));
    wf.approve("Grace");
    env.sleep(Duration.ofSeconds(30));
    wf.open();
    env.sleep(Duration.ofMinutes(1));
    assertEquals("open", wf.status());
    assertEquals("reviewed", wf.review("LGTM"));
    Approval.Decision got = result("approval-1");
    assertEquals(new Approval.Decision("access", "Grace", "LGTM", "reviewed"), got);
  }

  @Test
  void reviewCallerGetsItsResultBeforeAnyWaiterTakesIt() {
    Approval wf = start("approval-2");
    // Review arrives while Approval still awaits Open, before anything waits for Review.
    env.sleep(Duration.ofSeconds(30));
    assertEquals("reviewed", wf.review("LGTM"));
    wf.open();
    env.sleep(Duration.ofMinutes(1));
    wf.approve("Grace");
    assertEquals(new Approval.Decision("access", "Grace", "LGTM", "approved"), result("approval-2"));
  }

  private Approval.Decision result(String id) {
    return env.getWorkflowClient().newUntypedWorkflowStub(id).getResult(Approval.Decision.class);
  }
}
