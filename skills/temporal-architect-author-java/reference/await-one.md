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
Promise<Void> timer = Workflow.newTimer(Duration.ofHours(24));
Workflow.await(() -> paymentsReceived.ready(payment) || timer.isCompleted());

if (paymentsReceived.ready(payment)) { // listed first, so it wins a tie
  paymentsReceived.claim();
  status = "processing";
} else {
  paymentsReceived.leave(payment);
  activities.cancelOrder(orderId);
  throw ApplicationFailure.newFailure("order cancelled", "OrderCancelled", new OrderResult("cancelled"));
}
```

One `Workflow.await` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Java needs no SDK opt-in for this shape: it reads state after every handler of the workflow task has run, since handler threads run before workflow threads (`internal/sync/DeterministicRunnerImpl.java:36-37`). Not `Promise.anyOf`: it completes in callback order (`internal/sync/CompletablePromiseImpl.java:25-31`), and a timer or activity result of the same workflow task settles its promise before any signal handler runs (`internal/statemachines/WorkflowStateMachines.java:857-858`, `internal/sync/SyncWorkflow.java:131-139`), so it can pick the timer over a signal listed first. Not `Workflow.await(timeout, c)` either, unless the timer is listed first: at a tie it reports the timeout (`internal/sync/SyncWorkflowContext.java:1390,1399`). [`corpus/concurrency/java/Batch.java`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/java/Batch.java) is the worked example, its `BatchTest` holding the tie and the `Promise.anyOf` counter-test; the `AwaitOne` fixture in [`corpus/messages/java/ArrivalsFixtures.java`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/java/ArrivalsFixtures.java) is the signal case above.

## Cases

| Case | Before `Workflow.await` | In the predicate | Winner |
|------|-------------------------|------------------|--------|
| signal, update | `long t = xs.begin()` | `xs.ready(t)` | `xs.claim()`; every losing message case calls `xs.leave(t)` |
| timer | `Promise<Void> timer = Workflow.newTimer(d)` | `timer.isCompleted()` | — |
| activity, child workflow, nexus, promise | `Promise<R> p = Async.function(…)` | `p.isCompleted()` | `p.get()` |
| condition | — | the condition | — |
| nested `await all:` | `Promise<Void> all = Promise.allOf(…)` | `all.isCompleted()` | `all.get()` |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place and blocks later waiters. The predicate only reads (`workflow/Workflow.java:891-893`); `claim` and `leave` come after the await. `isCompleted()` is also true for a failed promise (`workflow/Promise.java:34-35`); the winner's `get()` throws it.

## Notes

- **Losing cases are not cancelled**; they keep running until the run ends. Cancelling a losing timer (start it in a `CancellationScope`) is history hygiene: otherwise it fires later and adds workflow tasks. Cancelling a child only *requests* its cancellation; for its lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)). Scopes: `temporal-developer` `references/java/patterns.md` § Cancellation Scopes.
- An empty case body → the winner's `claim()` or `get()` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `begin` ticket per message case each iteration.
