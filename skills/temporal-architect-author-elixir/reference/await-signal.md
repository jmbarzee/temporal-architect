# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```elixir
Arrivals.on("Approve", fn [_approver] -> Process.put(:status, "approved") end)

# in the body:
[approver] = Arrivals.take("Approve")
```

Every signal the design waits on is registered with `Arrivals.on` ([signal-handler.md](./signal-handler.md)), and its waiters call `Arrivals` in the main execution.

- `take(name)` gives the oldest pending arrival's payload list, `[approver]`, else waits for the next. Several params bind positionally, `[a, b] = Arrivals.take("X")`; none, `Arrivals.take("Open")`.
- **Waiters are served in the order they began, by ticket.** `take` is `promise` then `await`, and `promise` draws its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)). The corpus's `WaiterOrder` and `PromiseThenAwait` fixtures ([`arrivals_fixtures.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/arrivals_fixtures.ex)) assert both.
- Not `wait({:signal, "Approve"})` per waiter: the index holds only the latest arrival, so two arrivals before the first look are read as the second one twice, and every later wait returns at once (`api/awaitable/temporal_sdk_api_awaitable_index.erl:381-384,863-868`). The corpus's `Naive` fixture asserts it.
- An `await one` case uses `ready_at` and `claim` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- `await update` is unsupported ([update-handler.md](./update-handler.md)).
- Code after `take` sees current state, which bodies run at a later sync may have changed; per-arrival data comes from the taken list.
