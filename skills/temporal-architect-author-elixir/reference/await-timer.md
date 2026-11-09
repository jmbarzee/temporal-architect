# await timer

```twf
await timer(5m)
```

```elixir
start_timer({5, :minute}, [:wait])
```

- `start_timer(duration, opts)` (`temporal_sdk/temporal_sdk_workflow.erl:1966-1999`) takes the `.twf` duration as `{n, unit}` or integer milliseconds; `[:wait]` blocks the workflow until it fires (`:3011-3018`). A variable duration passes straight through: `start_timer(backoff_ms, [:wait])`. Never `Process.sleep/1`: it blocks the workflow task without a timer in history ([idioms.md § determinism](./idioms.md#determinism)).
- As a `promise` or an inline race case, a timer is the handle `t = start_timer(d)`, without `:wait`; `wait(t)` is the `await` ([promise.md](./promise.md)). Cancelling a timer that has fired raises, so a race cancels a losing timer only while it is unfired (`api/awaitable/temporal_sdk_api_awaitable_index_table.erl:308`; [await-one.md](./await-one.md)).
