package messages;

import io.temporal.workflow.Async;
import io.temporal.workflow.Promise;
import io.temporal.workflow.Workflow;
import java.util.ArrayList;
import java.util.List;

/**
 * A signal's or update's pending arrivals and the waiters for them, each oldest first: a handler
 * adds an arrival when it returns, and the waiter that began waiting first takes the oldest.
 */
public final class Arrivals<T> {
  private final List<T> pending = new ArrayList<>();
  private final List<Long> waiters = new ArrayList<>(); // tickets, in the order their waiters began
  private long next;

  public void add(T v) {
    pending.add(v);
  }

  /** Waits for the oldest arrival: {@code await signal X}. */
  public T take() {
    return takeAt(begin());
  }

  /** {@code promise p <- signal X}: the ticket is taken now, so the promise begins waiting at its binding. */
  public Promise<T> promise() {
    long ticket = begin();
    return Async.function(() -> takeAt(ticket));
  }

  /** take for a waiter that began earlier with begin. */
  private T takeAt(long ticket) {
    try {
      Workflow.await(() -> ready(ticket));
      return claim();
    } finally {
      leave(ticket);
    }
  }

  /** Begins a waiter. An await one case begins, checks ready without taking, and claims only if it wins; win or lose, it leaves. */
  public long begin() {
    long ticket = next++;
    waiters.add(ticket);
    return ticket;
  }

  /** Whether an arrival is pending and ticket is the earliest waiter. */
  public boolean ready(long ticket) {
    return !pending.isEmpty() && waiters.get(0) == ticket;
  }

  /** Gives the oldest arrival to the earliest waiter, which must be ready. */
  public T claim() {
    waiters.remove(0);
    return pending.remove(0);
  }

  /** Ends a waiter that did not claim; after a claim it does nothing. */
  public void leave(long ticket) {
    waiters.remove(Long.valueOf(ticket));
  }
}
