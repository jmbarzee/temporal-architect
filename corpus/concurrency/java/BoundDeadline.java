package concurrency;

import io.temporal.workflow.Promise;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.time.Duration;

/** A promise bound once, timer(24h), raced against Ack every round; returns the Acks counted. Registered only by BatchTest. */
@WorkflowInterface
public interface BoundDeadline {
  @WorkflowMethod
  int run();

  @SignalMethod(name = "Ack")
  void ack();

  class Impl implements BoundDeadline {
    private int acks; // pending arrivals of Ack

    @Override
    public void ack() {
      acks++;
    }

    @Override
    public int run() {
      int counted = 0;
      // promise deadline <- timer(24h): bound before the rounds, so losing one never cancels it.
      Promise<Void> deadline = Workflow.newTimer(Duration.ofHours(24));
      while (true) {
        Workflow.await(() -> acks > 0 || deadline.isCompleted());
        if (acks == 0) {
          return counted;
        }
        acks--;
        counted++;
      }
    }
  }
}
