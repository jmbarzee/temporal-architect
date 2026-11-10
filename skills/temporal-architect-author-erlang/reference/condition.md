# condition

| DSL | Erlang |
|-----|--------|
| `state:` `condition jobReady` | `put(job_ready, undefined)` at the start of `execute/2`, in the main execution: `undefined` while unset, else the workflow task that set it |
| `set jobReady`, in a signal body | `set_condition(job_ready)`, below |
| `set jobReady`, in the workflow body | the same; outside a handler it records `infinity`, which `await jobReady` reads as set (raced in an `await one`, [unmapped](#as-an-await-one-case)) |
| `unset jobReady` | `put(job_ready, undefined)` |
| `await jobReady` | `await_condition([~"JobDone"], fun() -> get(job_ready) =/= undefined end)`, below |

```erlang
%% A set keeps the task already recorded: the condition became true at the first set after the last unset.
set_condition(C) ->
    case get(C) of
        undefined -> put(C, corpus_arrivals:arrival_task());
        _ -> ok
    end.

%% Waits until Cond holds; only the bodies of signals in Names can set it.
await_condition(Names, Cond) ->
    lists:foreach(fun corpus_arrivals:sync/1, Names),
    case Cond() of
        true ->
            ok;
        false ->
            await_any([{signal_request, N} || N <- Names]),
            await_condition(Names, Cond)
    end.
```

The SDK has no awaitable for local state (`temporal_sdk/temporal_sdk_workflow.erl:394-416`), so the wait is on the arrivals of the signals whose bodies set it; syncing them runs those bodies. In a handler body, `corpus_arrivals:arrival_task/0` is the workflow task of the arrival it handles. Why, and the corpus's `ConditionCase` fixture: [author-elixir condition.md](../../temporal-architect-author-elixir/reference/condition.md). Like all state, a condition lives in the main execution's process dictionary, and a query reads it from what `set_info` publishes ([query-handler.md](./query-handler.md)).

## As an `await one:` case

A condition case is ready at its recorded task, `get(job_ready)`, read after syncing every signal whose body sets or unsets it, and woken by those signals' `{signal_request, Name}`. It never claims: a condition is read, not taken. A condition set in the workflow body and then raced in an `await one` is unmapped: outside a handler, `arrival_task/0` returns `infinity` ([`corpus_arrivals.erl`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/erlang_support/corpus_arrivals.erl)), and no constant rank is replay-safe, so flag that shape to the user rather than write it ([author-elixir § As an `await one:` case](../../temporal-architect-author-elixir/reference/condition.md#as-an-await-one-case); [composite-patterns.md](./composite-patterns.md#pattern-1-signal-set-condition-vs-timer-manageretention)).
