# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```erlang
corpus_arrivals:on(~"Approve", fun([_Approver]) -> put(status, ~"approved") end),

%% in the body:
[Approver] = corpus_arrivals:take(~"Approve"),
```

Every signal the design waits on is registered with `corpus_arrivals:on` ([signal-handler.md](./signal-handler.md)), and its waiters call `corpus_arrivals` in the main execution. Why each rule holds, and the corpus fixtures that assert it: [author-elixir await-signal.md](../../temporal-architect-author-elixir/reference/await-signal.md).

- `take(Name)` gives the oldest pending arrival's payload list, `[Approver]`, else waits for the next. Several params bind positionally, `[A, B] = corpus_arrivals:take(~"X")`; none, `[] = corpus_arrivals:take(~"Open")`.
- **Waiters are served in the order they began, by ticket.** `take` is `promise` then `await`, and `promise` takes its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- Not `wait({signal, ~"Approve"})` per waiter: the index holds only the latest arrival (`api/awaitable/temporal_sdk_api_awaitable_index.erl:381-384,863-868`).
- An `await one` case uses `ready_at` and `claim` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- `await update` is unsupported ([author-elixir update-handler.md](../../temporal-architect-author-elixir/reference/update-handler.md)).
