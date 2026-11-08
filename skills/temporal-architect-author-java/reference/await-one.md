# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```java
long payment = paymentsReceived.begin();
CompletablePromise<Void> timer = Workflow.newPromise();
CancellationScope timerScope =
    Workflow.newCancellationScope(() -> timer.completeFrom(Workflow.newTimer(Duration.ofHours(24))));
timerScope.run();
Workflow.await(() -> paymentsReceived.ready(payment) || timer.isCompleted());

if (paymentsReceived.ready(payment)) { // listed first, so it wins a tie
  paymentsReceived.claim();
  timerScope.cancel(); // the inline timer lost
  status = "processing";
} else {
  paymentsReceived.leave(payment);
  activities.cancelOrder(orderId);
  throw ApplicationFailure.newFailure("order cancelled", "OrderCancelled", new OrderResult("cancelled"));
}
```

One `Workflow.await` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Java needs no SDK opt-in for this shape: it reads state after every handler of the workflow task has run, since handler threads run before workflow threads (`internal/sync/DeterministicRunnerImpl.java:36-37`). Not `Promise.anyOf`: it completes in callback order (`internal/sync/CompletablePromiseImpl.java:25-31`), and a timer or activity result of the same workflow task settles its promise before any signal handler runs (`internal/statemachines/WorkflowStateMachines.java:857-858`, `internal/sync/SyncWorkflow.java:131-139`), so it can pick the timer over a signal listed first. Not `Workflow.await(timeout, c)` either, unless the timer is listed first: at a tie it reports the timeout (`internal/sync/SyncWorkflowContext.java:1390,1399`), though it does cancel its own timer when the condition wins (SDK flag `CANCEL_AWAIT_TIMER_ON_CONDITION`, `:1375-1393`). [`corpus/concurrency/java/Batch.java`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/java/Batch.java) is the worked example, its `BatchTest` holding the tie, the `Promise.anyOf` counter-test, the losing timer's `TimerCanceled`, and a bound deadline (`BoundDeadline`) that survives the rounds it loses; the `AwaitOne` fixture in [`corpus/messages/java/ArrivalsFixtures.java`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/java/ArrivalsFixtures.java) is the signal case above.

## Cases

| Case | Before `Workflow.await` | In the predicate | Winner |
|------|-------------------------|------------------|--------|
| signal, update | `long t = xs.begin()` | `xs.ready(t)` | `xs.claim()`; every losing message case calls `xs.leave(t)` |
| inline timer | `timer` completed from `Workflow.newTimer(d)` in its own `timerScope`, as above | `timer.isCompleted()` | every other winner calls `timerScope.cancel()` |
| activity, child workflow, nexus, promise | `Promise<R> p = Async.function(…)` | `p.isCompleted()` | `p.get()` |
| condition | — | the condition | — |
| nested `await all:` | `Promise<Void> all = Promise.allOf(…)` | `all.isCompleted()` | `all.get()` |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place and blocks later waiters. The predicate only reads (`workflow/Workflow.java:891-893`); `claim` and `leave` come after the await. `isCompleted()` is also true for a failed promise (`workflow/Promise.java:34-35`); the winner's `get()` throws it.

## Notes

- **Losing cases** (spec 06): a losing inline timer is cancelled through its scope (`workflow/CancellationScope.java:21`), the wiring `Workflow.await(timeout, c)` uses for its own timer (`internal/sync/SyncWorkflowContext.java:1383-1392`), and history records `TimerCanceled`. Leave losing inline activities, children and Nexus operations running until the run ends, and never cancel a bound `promise` for losing a round: it starts outside any timer's scope. For a child's lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)). Scopes: `temporal-developer` `references/java/patterns.md` § Cancellation Scopes.
- An empty case body → the winner's `claim()` or `get()` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `begin` ticket per message case each iteration.
