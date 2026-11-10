# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```erlang
T = start_timer({24, hour}),
case race(T) of
    payment ->
        put(status, ~"processing"),
        %% ... the rest of the workflow
        ok;
    timer ->
        %% activity CancelOrder(orderId), as an inline call, then:
        fail_workflow_execution(#{
            message => ~"order cancelled",
            type => ~"OrderCancelled",
            details => [#{~"status" => ~"cancelled"}]
        })
end

%% Listed order: signal PaymentReceived, then the timer.
race(T) ->
    Cases = [
        {payment, corpus_arrivals:ready_at(~"PaymentReceived")},
        {timer, corpus_arrivals:timer_ready_at(T)}
    ],
    case corpus_arrivals:first(Cases) of
        payment ->
            corpus_arrivals:claim(~"PaymentReceived"),
            %% Cancelling a fired timer raises, so the losing inline timer is cancelled only if unfired.
            corpus_arrivals:timer_ready_at(T) =:= undefined andalso cancel_timer(T),
            payment;
        timer ->
            timer;
        undefined ->
            await_any([{signal_request, ~"PaymentReceived"}, T]),
            race(T)
    end.
```

**Cases are ranked by the workflow task each became ready in, then by listed order.** `corpus_arrivals:first/1` takes `[{Case, ReadyAt}]` in `.twf` order and returns the case ready in the earliest task, the first listed among those; `undefined` means none is ready, so the race waits on every case with `await_any/1` (`temporal_sdk/temporal_sdk_workflow.erl:2614-2626`) and ranks again. A ready-at is the task from `corpus_arrivals:task_of/1`, the first `WorkflowTaskStarted` after the event, read with `select_history/1` (`temporal_sdk/temporal_sdk_workflow.erl:2944-2945`). Why a raw first-ready pick is not replay-safe across tasks, and the corpus tie tests: [author-elixir await-one.md](../../temporal-architect-author-elixir/reference/await-one.md).

## Cases

| Case | Ready at, in `corpus_arrivals:first/1` | Woken by, in `await_any/1` | Winner |
|------|----------------------------------------|----------------------------|--------|
| signal | `corpus_arrivals:ready_at(~"X")` | `{signal_request, ~"X"}` | `corpus_arrivals:claim(~"X")` gives the payload list |
| inline timer | `corpus_arrivals:timer_ready_at(T)`, `T = start_timer(D)` started before the race | `T` | — |
| activity, child workflow, promise | `task_at(P)`, below | `P` | `wait(P)`, matched on `completed` |
| timer promise | `corpus_arrivals:timer_ready_at(P)` | `P` | — |
| condition | `get(c)`, the task recorded by its `set`, after syncing the signals whose bodies set or unset it; set in the workflow body, unmapped ([condition.md](./condition.md#as-an-await-one-case)) | `{signal_request, Name}` of each of those signals | — |
| nested `await all:` | the latest of its branches' tasks, `undefined` while any is | each branch | each `wait` |
| update, nexus | unsupported ([author-elixir update-handler.md](../../temporal-architect-author-elixir/reference/update-handler.md), [nexus.md](../../temporal-architect-author-elixir/reference/nexus.md)) | — | — |

```erlang
%% The task a closed activity or child became ready in, or undefined while it runs.
task_at(P) ->
    case is_awaited(P) of
        {true, #{event_id := Eid}} -> corpus_arrivals:task_of(Eid);
        {false, _} -> undefined
    end.
```

A closed activity or child carries its closing event's ID (`api/awaitable/temporal_sdk_api_awaitable_index.erl:973,1245`). A signal case peeks and takes only if it wins: `ready_at` reads the oldest pending arrival, and only the winner `claim`s it ([await-signal.md](./await-signal.md)).

## Notes

- **Losing cases** (spec 06): a losing inline timer is cancelled only if unfired, since cancelling a fired timer raises (`api/awaitable/temporal_sdk_api_awaitable_index_table.erl:308`). Losing inline activities and children keep running until the run ends, and a bound promise is never cancelled for losing a round ([author-elixir § Notes](../../temporal-architect-author-elixir/reference/await-one.md#notes)).
- Every case lives in the main execution, the race included ([signal-handler.md](./signal-handler.md)).
- An empty case body → the winner's `claim` or `wait` alone.
- Event-driven/entity workflows repeat the race in a loop, ranking afresh each round; a bound deadline survives the rounds it loses ([composite-patterns.md](./composite-patterns.md)).
