package concurrency;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.temporal.api.enums.v1.EventType;
import io.temporal.api.history.v1.HistoryEvent;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.testing.TestWorkflowEnvironment;
import io.temporal.worker.WorkerFactory;
import io.temporal.worker.WorkerOptions;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BatchTest {
  private TestWorkflowEnvironment env;

  @BeforeEach
  void setUp() {
    env = TestWorkflowEnvironment.newInstance();
  }

  @AfterEach
  void tearDown() {
    env.close();
  }

  private Batch batch(String id) {
    Workers.registerBatchTypes(env.newWorker(Workers.BATCHES_TASK_QUEUE));
    env.start();
    return env.getWorkflowClient()
        .newWorkflowStub(
            Batch.class,
            WorkflowOptions.newBuilder()
                .setTaskQueue(Workers.BATCHES_TASK_QUEUE)
                .setWorkflowId(id)
                .build());
  }

  @Test
  void batchAcknowledged() {
    Batch wf = batch("batch-1");
    WorkflowClient.start(wf::run, List.of("a", "b"));
    env.sleep(Duration.ofMinutes(1));
    wf.ack();
    WorkflowStub h = WorkflowStub.fromTyped(wf);
    assertEquals(new Batch.Report(2, true, "acknowledged"), h.getResult(Batch.Report.class));
  }

  @Test
  void batchTimesOut() {
    Batch wf = batch("batch-2");
    assertEquals(new Batch.Report(1, true, "unacknowledged"), wf.run(List.of("a")));
  }

  private List<HistoryEvent> events(String id) {
    return env.getWorkflowClient().fetchHistory(id).getEvents();
  }

  /** Waits up to 10s of real time for an event of the type; throws rather than hang. */
  private void until(String id, EventType type) throws InterruptedException {
    long deadline = System.currentTimeMillis() + 10_000;
    while (events(id).stream().noneMatch(e -> e.getEventType() == type)) {
      if (System.currentTimeMillis() > deadline) {
        throw new IllegalStateException(id + ": " + type + " never reached history");
      }
      Thread.sleep(20);
    }
  }

  private WorkerFactory worker() {
    WorkerFactory f = WorkerFactory.newInstance(env.getWorkflowClient());
    // A zero sticky timeout sends no sticky attributes (ReplayWorkflowTaskHandler), so the next
    // workflow task goes to the normal queue, not to a stopped worker's sticky queue.
    f.newWorker(
            "await-one",
            WorkerOptions.newBuilder().setStickyQueueScheduleToStartTimeout(Duration.ZERO).build())
        .registerWorkflowImplementationTypes(AwaitOneTie.Impl.class);
    f.start();
    return f;
  }

  /** Runs AwaitOneTie with the timer fired and Ack sent while no worker runs, so both reach one workflow task. */
  private String tie(List<String> order, boolean anyOf, boolean signalFirst)
      throws InterruptedException {
    String id = "tie-" + order + "-" + anyOf + "-" + signalFirst;
    WorkflowStub h =
        env.getWorkflowClient()
            .newUntypedWorkflowStub(
                "AwaitOneTie",
                WorkflowOptions.newBuilder().setTaskQueue("await-one").setWorkflowId(id).build());
    h.start(order, anyOf);
    WorkerFactory first = worker();
    until(id, EventType.EVENT_TYPE_TIMER_STARTED);
    first.shutdownNow();
    first.awaitTermination(10, TimeUnit.SECONDS);
    if (signalFirst) {
      h.signal("Ack");
    }
    // Skip time past the timer. With no worker to take the timer's workflow task, the
    // sleep may not return, so it runs on its own thread.
    Thread skip =
        new Thread(
            () -> {
              try {
                env.sleep(Duration.ofHours(1));
              } catch (RuntimeException ignored) {
                // the environment closed under it
              }
            });
    skip.setDaemon(true);
    skip.start();
    until(id, EventType.EVENT_TYPE_TIMER_FIRED);
    if (!signalFirst) {
      h.signal("Ack");
    }
    WorkerFactory second = worker();
    String got = h.getResult(String.class);
    second.shutdownNow();

    // Both ready on one resume: no workflow task started between the timer firing and Ack arriving.
    List<HistoryEvent> evs = events(id);
    int fired = indexOf(evs, EventType.EVENT_TYPE_TIMER_FIRED);
    int signaled = indexOf(evs, EventType.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED);
    assertTrue(fired >= 0 && signaled >= 0);
    assertEquals(signalFirst, signaled < fired, "history order");
    assertTrue(
        evs.subList(Math.min(fired, signaled), Math.max(fired, signaled)).stream()
            .noneMatch(e -> e.getEventType() == EventType.EVENT_TYPE_WORKFLOW_TASK_STARTED),
        "the timer and Ack reached different workflow tasks");
    return got;
  }

  private static int indexOf(List<HistoryEvent> evs, EventType type) {
    for (int i = 0; i < evs.size(); i++) {
      if (evs.get(i).getEventType() == type) {
        return i;
      }
    }
    return -1;
  }

  @Test
  void awaitOneTheFirstListedOfSeveralReadyCasesWins() throws InterruptedException {
    assertEquals("Ack", tie(List.of("Ack", "timer"), false, false));
    assertEquals("timer", tie(List.of("timer", "Ack"), false, false));
  }

  @Test
  void signalFirstCannotShareATaskWithTheTimer() {
    // Ack sent while no worker runs schedules a workflow task, and a pending workflow task holds
    // the test server's clock, so the timer never fires: this order cannot be engineered here.
    assertThrows(IllegalStateException.class, () -> tie(List.of("Ack", "timer"), false, true));
  }

  @Test
  void promiseAnyOfIsNotListedOrder() throws InterruptedException {
    // Ack is listed first, but the timer's promise completes as its event is applied, before
    // Ack's handler runs on a callback thread.
    assertEquals("timer", tie(List.of("Ack", "timer"), true, false));
  }
}
