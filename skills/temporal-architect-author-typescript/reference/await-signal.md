# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```ts
const approves = new Arrivals<string>();
setHandler(Approve, (approver) => {
  status = 'approved';
  approves.add(approver);
});

const approver = await approves.take();
```

Every signal or update the design waits on gets an `Arrivals<T>`, `T` being its one param, a tuple of several (`[string, string]`, destructured at the take), or `void` for none. Copy the class from the corpus's [`messages/typescript/arrivals.ts`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/typescript/arrivals.ts) into the workflow's directory; [`workflows.ts`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/typescript/workflows.ts) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take` gives the oldest pending arrival, else waits for the next. Waiters are served in the order they began, by ticket. A bare `condition(() => pending.length > 0)` per waiter hands one arrival to two waiters that unblock together, and a flag or `Trigger` holds only one arrival; none of them is a `.twf` wait.
- `take` draws its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- An `await one` case uses `wait`, `ready`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- Code after `take` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
