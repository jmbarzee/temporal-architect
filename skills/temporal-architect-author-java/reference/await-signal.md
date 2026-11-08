# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```java
private final Arrivals<String> approves = new Arrivals<>();

@Override
public void approve(String approver) {
  status = "approved";
  approves.add(approver);
}

// in the @WorkflowMethod body:
String approver = approves.take();
```

Every signal or update the design waits on gets an `Arrivals<T>` field, `T` being its one param, a `record` of several (read through its accessors after the take), or `Boolean` for none (`add(true)`). Copy the class from the corpus's [`messages/java/Arrivals.java`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/java/Arrivals.java) into the workflow's package; [`ApprovalImpl.java`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/java/ApprovalImpl.java) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take` gives the oldest pending arrival, else blocks for the next. Waiters are served in the order they began, by ticket. A bare `Workflow.await(() -> !pending.isEmpty())` per waiter loses nothing, since workflow threads run one at a time, but serves waiters in thread-creation order, not the order they began waiting (`internal/sync/DeterministicRunnerImpl.java:61,215,472`; the corpus's `ArrivalsTest` asserts it); tickets fix it. A `WorkflowQueue` (`temporal-developer` `references/java/determinism.md` § Safe Builtin Alternatives) takes the same way (`internal/sync/WorkflowQueueImpl.java:23-26`), and a `boolean` flag holds only one arrival; none of them is a `.twf` wait.
- `promise()` draws its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- An `await one` case uses `begin`, `ready`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- A waiter cancelled through its `CancellationScope` leaves the queue (`take`'s `finally`). Scopes: `temporal-developer` `references/java/patterns.md` § Cancellation Scopes.
- A signal with no params that only an `await one` waits on may count its arrivals instead, as the corpus's `Batch` does (`acks++`; `acks > 0`; `acks--`).
- Code after `take` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
