# await timer

```twf
await timer(5m)
```

```erlang
start_timer({5, minute}, [wait])
```

- `start_timer(Duration, Opts)` (`temporal_sdk/temporal_sdk_workflow.erl:1966-1999`) takes the `.twf` duration as `{N, Unit}` or integer milliseconds; `[wait]` blocks the workflow until it fires. A variable duration passes straight through: `start_timer(BackoffMs, [wait])`. Never `timer:sleep/1`: it blocks the workflow task without a timer in history ([author-elixir idioms.md § determinism](../../temporal-architect-author-elixir/reference/idioms.md#determinism)).
- As a `promise` or an inline race case, a timer is the handle `T = start_timer(D)`, without `wait`; `wait(T)` is the `await` ([promise.md](./promise.md)). A race cancels a losing timer only while it is unfired, since cancelling a fired timer raises ([author-elixir await-timer.md](../../temporal-architect-author-elixir/reference/await-timer.md); [await-one.md](./await-one.md)).
