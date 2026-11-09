# condition

| DSL | Elixir |
|-----|--------|
| `state:` `condition jobReady` | `Process.put(:job_ready, false)` at the start of `execute/2`, in the main execution |
| `set jobReady` / `unset jobReady` | `Process.put(:job_ready, true)` / `Process.put(:job_ready, false)`, in a signal body or the workflow body |
| `await jobReady` | `await_condition(["JobDone"], fn -> Process.get(:job_ready) end)`, below |

```elixir
# Waits until cond holds; only the bodies of signals in names can set it.
defp await_condition(names, cond) do
  Enum.each(names, &Arrivals.sync/1)

  unless cond.() do
    await_any(Enum.map(names, &{:signal_request, &1}))
    await_condition(names, cond)
  end
end
```

- The SDK has no awaitable for local state (`temporal_sdk/temporal_sdk_workflow.erl:395-416`), so the wait is on what can change it: the arrivals of the signals whose bodies set it. Syncing them runs those bodies ([signal-handler.md](./signal-handler.md)).
- Like all state, a condition lives in the main execution, whose process dictionary no `start_execution` shares (`executor/temporal_sdk_executor_workflow.erl:2182-2195`). A query reads it from what the main execution publishes with `set_info` ([query-handler.md](./query-handler.md)).
- **As an `await one:` case**, a condition is ready in the task of the arrival whose body set it. When one signal's body sets it on every arrival, nothing unsets it, and nothing takes that signal's arrivals, that is `Arrivals.ready_at(name)`, and the case never claims ([composite-patterns.md](./composite-patterns.md#pattern-1-signal-set-condition-vs-timer-manageretention)). Any other condition shape in an `await one` is unmapped until #586 adds per-arrival task ranking to `Arrivals`: flag it to the user rather than fall back to a `Process.get` read.
