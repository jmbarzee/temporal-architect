package messages;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.temporal.client.WorkflowNotFoundException;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.testing.TestWorkflowEnvironment;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ArrivalsTest {
  private static final String TASK_QUEUE = "arrivals";
  private TestWorkflowEnvironment env;
  private int n;

  @BeforeEach
  void setUp() {
    env = TestWorkflowEnvironment.newInstance();
    env.newWorker(TASK_QUEUE)
        .registerWorkflowImplementationTypes(
            ArrivalsFixtures.TwoWaitersImpl.class,
            ArrivalsFixtures.PromiseThenAwaitImpl.class,
            ArrivalsFixtures.CancelledWaiterImpl.class,
            ArrivalsFixtures.AwaitOneImpl.class,
            ArrivalsFixtures.NaiveTwoWaitersImpl.class);
    env.start();
  }

  @AfterEach
  void tearDown() {
    env.close();
  }

  /** Runs the workflow type, sending X "1" after a minute and X "2" after two. */
  private <R> R withTwoXs(String type, Class<R> result, Object... args) {
    WorkflowStub h =
        env.getWorkflowClient()
            .newUntypedWorkflowStub(
                type,
                WorkflowOptions.newBuilder().setTaskQueue(TASK_QUEUE).setWorkflowId("wf-" + n++).build());
    h.start(args);
    env.sleep(Duration.ofMinutes(1));
    h.signal("X", "1");
    env.sleep(Duration.ofMinutes(1));
    try {
      h.signal("X", "2");
    } catch (WorkflowNotFoundException e) {
      // A workflow that needed only one X has completed by now.
    }
    return h.getResult(result);
  }

  @Test
  void arrivalsGoToWaitersInTheOrderTheyBegan() {
    assertEquals(
        Map.of("began first", "1", "created first", "2"), withTwoXs("TwoWaiters", Map.class));
  }

  @Test
  void aPromiseBeginsWaitingAtItsBinding() {
    assertEquals(Map.of("promise", "1", "await", "2"), withTwoXs("PromiseThenAwait", Map.class));
  }

  @Test
  void awaitOneTheCaseWinsAndTakes() {
    assertEquals(List.of("case 1", "then 2"), withTwoXs("AwaitOne", List.class, Duration.ofHours(1)));
  }

  @Test
  void awaitOneTheTimerWinsAndTheCaseTakesNothing() {
    assertEquals(List.of("timer", "then 1"), withTwoXs("AwaitOne", List.class, Duration.ofSeconds(1)));
  }

  @Test
  void aCancelledWaiterLeavesTheQueue() {
    assertEquals("1", withTwoXs("CancelledWaiter", String.class));
  }

  @Test
  void naiveAwaitPerWaiterServesThreadOrderNotWaitOrder() {
    // Java runs workflow threads one at a time, so no arrival is lost, but the waiter created
    // first takes the first arrival although the other began waiting first.
    assertEquals(
        Map.of("began first", "2", "created first", "1"), withTwoXs("NaiveTwoWaiters", Map.class));
  }
}
