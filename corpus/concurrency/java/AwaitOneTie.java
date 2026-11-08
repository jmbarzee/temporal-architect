package concurrency;

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

/** Batch's await one over Ack and timer(1h), with the cases listed in order; returns the winner. Registered only by BatchTest. */
@WorkflowInterface
public interface AwaitOneTie {
  /** With anyOf, the cases race through Promise.anyOf instead, to show it is not await one. */
  @WorkflowMethod
  String run(List<String> order, boolean anyOf);

  @SignalMethod(name = "Ack")
  void ack();

  class Impl implements AwaitOneTie {
    private int acks;
    private final CompletablePromise<Void> acked = Workflow.newPromise();

    @Override
    public void ack() {
      acks++;
      acked.complete(null);
    }

    @Override
    public String run(List<String> order, boolean anyOf) {
      CompletablePromise<Void> timer = Workflow.newPromise();
      CancellationScope timerScope =
          Workflow.newCancellationScope(() -> timer.completeFrom(Workflow.newTimer(Duration.ofHours(1))));
      timerScope.run();
      if (anyOf) {
        List<Promise<String>> cases = new ArrayList<>();
        for (String c : order) {
          cases.add((c.equals("Ack") ? acked : timer).thenApply(v -> c));
        }
        return Promise.anyOf(cases).get();
      }
      Workflow.await(() -> acks > 0 || timer.isCompleted());
      for (String c : order) {
        if (c.equals("Ack") ? acks > 0 : timer.isCompleted()) {
          if (c.equals("Ack")) {
            timerScope.cancel();
          }
          return c;
        }
      }
      throw new IllegalStateException("no case ready");
    }
  }
}
