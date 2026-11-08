# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```ts
const payment = paymentsReceived.wait();
const timer = new CancellationScope();
let timerFired = false;
timer.run(() => sleep('24h')).then(
  () => (timerFired = true),
  () => {}, // cancelled because the signal won
);
await condition(() => paymentsReceived.ready(payment) || timerFired);

if (paymentsReceived.ready(payment)) { // listed first, so it wins a tie
  paymentsReceived.claim();
  timer.cancel();
  status = 'processing';
} else {
  paymentsReceived.leave(payment);
  await CancelOrder(orderId);
  throw ApplicationFailure.create({ message: 'order cancelled', type: 'OrderCancelled', details: [{ status: 'cancelled' }] });
}
```

One `condition` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Not `Promise.race`: it picks the case that settles first, not the first listed, and a signal case raced that way must take its arrival before it knows it won. `condition(fn, timeout)` races the same way internally (`workflow/src/workflow.ts`). [`corpus/concurrency/typescript/workflows.ts`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/typescript/workflows.ts) is the worked example; its `await-one.test.ts` holds the tie.

## Cases

| Case | Before `condition` | In the predicate | Winner |
|------|--------------------|------------------|--------|
| signal, update | `const t = xs.wait()` | `xs.ready(t)` | `xs.claim()`; every losing message case calls `xs.leave(t)` |
| timer | `sleep(d)` run in a `CancellationScope`, its `.then` setting `fired` | `fired` | — |
| activity, child workflow, nexus, promise | `p.then(done, done)`, both setting `settled` | `settled` | `await p` |
| condition | — | the condition | — |
| nested `await all:` | `Promise.all([…])`, its `.then(done, done)` setting `settled` | `settled` | `await` it |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place and blocks later waiters. A settled-flag case handles rejection too, so a losing failure is no unhandled rejection ([promise.md](./promise.md)); the winner's `await p` rethrows it.

## Notes

- **Losing cases are not cancelled**; they keep running until the run ends. Cancelling a losing timer's scope is history hygiene: otherwise it fires later and adds workflow tasks. Cancelling a child only *requests* its cancellation; for its lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)). Scopes: `temporal-developer` `references/typescript/patterns.md` § Cancellation Scopes.
- An empty case body → the winner's `claim` or `await` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `wait` ticket per message case each iteration.
