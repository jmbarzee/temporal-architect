# condition

| DSL | Elixir |
|-----|--------|
| `state:` `condition jobReady` | `Process.put(:job_ready, nil)` at the start of `execute/2`, in the main execution: `nil` while unset, else the workflow task that set it |
| `set jobReady`, in a signal body | `Process.put(:job_ready, Process.get(:job_ready) \|\| Arrivals.arrival_task())` |
| `unset jobReady` | `Process.put(:job_ready, nil)` |
| `await jobReady` | `await_condition(["JobDone"], fn -> Process.get(:job_ready) != nil end)`, below |

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
- **A set records its task.** In a handler body, `Arrivals.arrival_task/0` is the workflow task of the arrival that body handles. A set keeps the task already recorded, since the condition became true at the first set after the last unset. The `ConditionCase` fixture in [`corpus/messages/elixir/arrivals_fixtures.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/arrivals_fixtures.ex) is this mapping.
- Like all state, a condition lives in the main execution, whose process dictionary no `start_execution` shares (`executor/temporal_sdk_executor_workflow.erl:2182-2195`). A query reads it from what the main execution publishes with `set_info` ([query-handler.md](./query-handler.md)).

## As an `await one:` case

A condition case is ready at its recorded task, `Process.get(:job_ready)`, read after syncing every signal whose body sets or unsets it, and woken by those signals' `{:signal_request, name}`. It never claims: a condition is read, not taken, so the arrivals stay for any waiter. A condition set in the workflow body and then raced in an `await one` is unmapped: outside a handler, `Arrivals.arrival_task/0` returns `:infinity` ([`corpus/elixir_support/arrivals.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/elixir_support/arrivals.ex)), and no constant rank is replay-safe, so flag that shape to the user rather than write it. Ranked by the arrival that set it, the case sees what the live run saw ([await-one.md](./await-one.md)); `ConditionCase` holds a set that wins though listed second, and a set then unset that is not ready ([composite-patterns.md](./composite-patterns.md#pattern-1-signal-set-condition-vs-timer-manageretention)).
