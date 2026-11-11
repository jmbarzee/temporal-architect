package failure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.temporal.api.enums.v1.EventType;
import io.temporal.api.enums.v1.WorkflowExecutionStatus;
import io.temporal.api.history.v1.HistoryEvent;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowFailedException;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.client.WorkflowUpdateException;
import io.temporal.failure.ActivityFailure;
import io.temporal.testing.TestWorkflowEnvironment;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

// Waiting for Process, which runs until tearDown, would hang: fail instead.
@Timeout(30)
class JobTest {
  private TestWorkflowEnvironment env;

  /** Process, the slow branch, runs until the test ends. */
  private final CountDownLatch released = new CountDownLatch(1);

  @BeforeEach
  void setUp() {
    env = TestWorkflowEnvironment.newInstance();
    Workers.registerJobTypes(
        env.newWorker(Workers.JOBS_TASK_QUEUE),
        new Job.ActivitiesImpl() {
          @Override
          public void process(String item) {
            try {
              released.await();
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
            }
          }
        });
    env.start();
  }

  @AfterEach
  void tearDown() {
    released.countDown();
    env.close();
  }

  private Job start(String id) {
    Job wf =
        env.getWorkflowClient()
            .newWorkflowStub(
                Job.class,
                WorkflowOptions.newBuilder()
                    .setTaskQueue(Workers.JOBS_TASK_QUEUE)
                    .setWorkflowId(id)
                    .build());
    WorkflowClient.start(wf::run, "a");
    return wf;
  }

  @Test
  void aBranchFailureFailsTheRunWhileTheOtherBranchRuns() {
    Job wf = start("job-1");
    wf.proceed();
    WorkflowFailedException e =
        assertThrows(
            WorkflowFailedException.class, () -> WorkflowStub.fromTyped(wf).getResult(Void.class));
    assertRejected(e.getCause());
    assertProcessStillRunning("job-1");
  }

  @Test
  void aBranchFailureInAnUpdateFailsOnlyThatUpdate() {
    Job wf = start("job-2");
    WorkflowUpdateException e = assertThrows(WorkflowUpdateException.class, wf::attempt);
    assertRejected(e.getCause());
    assertEquals(
        WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_RUNNING,
        WorkflowStub.fromTyped(wf).describe().getStatus());
    assertProcessStillRunning("job-2");
  }

  private static void assertRejected(Throwable cause) {
    assertEquals("Reject", assertInstanceOf(ActivityFailure.class, cause).getActivityType());
  }

  /** Process was scheduled, and neither completed nor was asked to cancel. */
  private void assertProcessStillRunning(String id) {
    List<EventType> types =
        env.getWorkflowClient().fetchHistory(id).getEvents().stream()
            .map(HistoryEvent::getEventType)
            .toList();
    assertTrue(types.contains(EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED));
    assertFalse(types.contains(EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED), "Process completed");
    assertFalse(
        types.contains(EventType.EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED),
        "Process was asked to cancel");
  }
}
