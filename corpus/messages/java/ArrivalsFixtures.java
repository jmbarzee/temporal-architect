package messages;

import io.temporal.workflow.Async;
import io.temporal.workflow.CancellationScope;
import io.temporal.workflow.CompletablePromise;
import io.temporal.workflow.Promise;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Test workflows for Arrivals; registered only by ArrivalsTest. */
public final class ArrivalsFixtures {
  private ArrivalsFixtures() {}

  public interface XSignal {
    @SignalMethod(name = "X")
    void x(String v);
  }

  public abstract static class OfX implements XSignal {
    final Arrivals<String> xs = new Arrivals<>();

    @Override
    public void x(String v) {
      xs.add(v);
    }
  }

  /** Two waiters of X; the one started first sleeps before it waits, so the other begins waiting first. */
  @WorkflowInterface
  public interface TwoWaiters extends XSignal {
    @WorkflowMethod
    Map<String, String> run();
  }

  public static class TwoWaitersImpl extends OfX implements TwoWaiters {
    @Override
    public Map<String, String> run() {
      Map<String, String> took = new TreeMap<>();
      Promise<Void> createdFirst =
          Async.procedure(
              () -> {
                Workflow.sleep(Duration.ofSeconds(1));
                took.put("created first", xs.take());
              });
      Promise<Void> beganFirst = Async.procedure(() -> took.put("began first", xs.take()));
      Promise.allOf(createdFirst, beganFirst).get();
      return took;
    }
  }

  /** Binds a promise on X, then awaits X. */
  @WorkflowInterface
  public interface PromiseThenAwait extends XSignal {
    @WorkflowMethod
    Map<String, String> run();
  }

  public static class PromiseThenAwaitImpl extends OfX implements PromiseThenAwait {
    @Override
    public Map<String, String> run() {
      Promise<String> p = xs.promise();
      String awaited = xs.take();
      return new TreeMap<>(Map.of("promise", p.get(), "await", awaited));
    }
  }

  /** Starts a waiter of X and cancels it, then takes X. */
  @WorkflowInterface
  public interface CancelledWaiter extends XSignal {
    @WorkflowMethod
    String run();
  }

  public static class CancelledWaiterImpl extends OfX implements CancelledWaiter {
    @Override
    public String run() {
      CancellationScope waiter = Workflow.newCancellationScope(() -> xs.promise());
      waiter.run();
      Workflow.sleep(Duration.ofSeconds(1));
      waiter.cancel();
      return xs.take();
    }
  }

  /** await one: a case for X raced against a timer (listed second), then takes X. */
  @WorkflowInterface
  public interface AwaitOne extends XSignal {
    @WorkflowMethod
    List<String> run(Duration timeout);
  }

  public static class AwaitOneImpl extends OfX implements AwaitOne {
    @Override
    public List<String> run(Duration timeout) {
      List<String> took = new ArrayList<>();
      long ticket = xs.begin();
      CompletablePromise<Void> timer = Workflow.newPromise();
      CancellationScope timerScope =
          Workflow.newCancellationScope(() -> timer.completeFrom(Workflow.newTimer(timeout)));
      timerScope.run();
      Workflow.await(() -> xs.ready(ticket) || timer.isCompleted());
      if (xs.ready(ticket)) {
        took.add("case " + xs.claim()); // first listed wins
        timerScope.cancel();
      } else {
        xs.leave(ticket);
        took.add("timer");
      }
      took.add("then " + xs.take());
      return took;
    }
  }

  /** The naive mapping: each waiter awaits a non-empty queue, then takes its head. */
  @WorkflowInterface
  public interface NaiveTwoWaiters {
    @SignalMethod(name = "X")
    void x(String v);

    @WorkflowMethod
    Map<String, String> run();
  }

  public static class NaiveTwoWaitersImpl implements NaiveTwoWaiters {
    private final List<String> pending = new ArrayList<>();

    @Override
    public void x(String v) {
      pending.add(v);
    }

    private String take() {
      Workflow.await(() -> !pending.isEmpty());
      return pending.isEmpty() ? "lost" : pending.remove(0);
    }

    @Override
    public Map<String, String> run() {
      Map<String, String> took = new TreeMap<>();
      Promise<Void> createdFirst =
          Async.procedure(
              () -> {
                Workflow.sleep(Duration.ofSeconds(1));
                took.put("created first", take());
              });
      Promise<Void> beganFirst = Async.procedure(() -> took.put("began first", take()));
      Promise.allOf(createdFirst, beganFirst).get();
      return took;
    }
  }
}
