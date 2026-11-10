package concurrency;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
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
    assertTrue(has("batch-1", EventType.EVENT_TYPE_TIMER_CANCELED), "the losing timer was not cancelled");
  }

  @Test
  void batchTimesOut() {
    Batch wf = batch("batch-2");
    assertEquals(new Batch.Report(1, true, "unacknowledged"), wf.run(List.of("a")));
    assertFalse(has("batch-2", EventType.EVENT_TYPE_TIMER_CANCELED));
  }

  @Test
  void aBoundPromiseSurvivesTheRoundsItLoses() {
    env.newWorker("bound").registerWorkflowImplementationTypes(BoundDeadline.Impl.class);
    env.start();
    BoundDeadline wf =
        env.getWorkflowClient()
            .newWorkflowStub(
                BoundDeadline.class,
                WorkflowOptions.newBuilder().setTaskQueue("bound").setWorkflowId("bound-1").build());
    WorkflowClient.start(wf::run);
    wf.ack();
    env.sleep(Duration.ofHours(1));
    wf.ack();
    assertEquals(2, WorkflowStub.fromTyped(wf).getResult(Integer.class));
    assertFalse(has("bound-1", EventType.EVENT_TYPE_TIMER_CANCELED));
    assertTrue(has("bound-1", EventType.EVENT_TYPE_TIMER_FIRED), "the deadline never fired");
  }

  private boolean has(String id, EventType type) {
    return events(id).stream().anyMatch(e -> e.getEventType() == type);
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

  /**
   * Runs AwaitOneTie with the timer fired and Ack sent while no worker runs, so both reach one
   * workflow task, and returns the winner.
   *
   * <p>In CI the setup sometimes misses: a workflow task starts between the timer firing and Ack
   * arriving, most likely on a poll the stopped first worker left open at the test server (#529). A
   * miss is retried on a fresh test server; if every attempt misses, the test is aborted (skipped),
   * so it never asserts the behaviour on a tie that was not set up.
   */
  private String tie(List<String> order, boolean anyOf) throws InterruptedException {
    final int attempts = 3;
    List<String> missed = new ArrayList<>();
    for (int attempt = 1; attempt <= attempts; attempt++) {
      env.close();
      env = TestWorkflowEnvironment.newInstance();
      String id = "tie-" + order + "-" + anyOf + "-" + attempt;
      WorkflowStub h =
          env.getWorkflowClient()
              .newUntypedWorkflowStub(
                  "AwaitOneTie",
                  WorkflowOptions.newBuilder().setTaskQueue("await-one").setWorkflowId(id).build());
      h.start(order, anyOf);
      String miss = setUpTie(id, h);
      if (miss == null) {
        WorkerFactory second = worker();
        try {
          return h.getResult(String.class);
        } finally {
          second.shutdownNow();
        }
      }
      missed.add(miss);
    }
    return Assumptions.abort(
        "the tie was not set up in " + attempts + " attempts: " + String.join("; ", missed));
  }

  /**
   * Fires the timer and sends Ack while no worker runs. Returns null when both reach one workflow
   * task, otherwise the history between them.
   */
  private String setUpTie(String id, WorkflowStub h) throws InterruptedException {
    WorkerFactory first = worker();
    until(id, EventType.EVENT_TYPE_TIMER_STARTED);
    first.shutdownNow();
    first.awaitTermination(10, TimeUnit.SECONDS);
    // Skip time past the timer. With no worker to take the timer's workflow task, the
    // sleep may not return, so it runs on its own thread.
    TestWorkflowEnvironment skipping = env;
    Thread skip =
        new Thread(
            () -> {
              try {
                skipping.sleep(Duration.ofHours(1));
              } catch (RuntimeException ignored) {
                // the environment closed under it
              }
            });
    skip.setDaemon(true);
    skip.start();
    until(id, EventType.EVENT_TYPE_TIMER_FIRED);
    h.signal("Ack");

    List<HistoryEvent> between =
        events(id).stream()
            .dropWhile(e -> e.getEventType() != EventType.EVENT_TYPE_TIMER_FIRED)
            .takeWhile(e -> e.getEventType() != EventType.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED)
            .toList();
    return between.stream()
            .anyMatch(e -> e.getEventType() == EventType.EVENT_TYPE_WORKFLOW_TASK_STARTED)
        ? id + ": " + between.stream().map(e -> e.getEventType().name()).collect(Collectors.joining(","))
        : null;
  }

  @Test
  void awaitOneTheFirstListedOfSeveralReadyCasesWins() throws InterruptedException {
    assertEquals("Ack", tie(List.of("Ack", "timer"), false));
    assertEquals("timer", tie(List.of("timer", "Ack"), false));
  }

  @Test
  void promiseAnyOfIsNotListedOrder() throws InterruptedException {
    // Ack is listed first, but the timer's promise completes as its event is applied, before
    // Ack's handler runs on a callback thread.
    assertEquals("timer", tie(List.of("Ack", "timer"), true));
  }
}
