# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```elixir
t = start_timer({24, :hour})

case race(t) do
  :payment ->
    Process.put(:status, "processing")
    # ... the rest of the workflow

  :timer ->
    # activity CancelOrder(orderId), as an inline call, then:
    fail_workflow_execution(%{message: "order cancelled", type: "OrderCancelled", details: [%{"status" => "cancelled"}]})
end

# Listed order: signal PaymentReceived, then the timer.
defp race(t) do
  case Arrivals.first(payment: Arrivals.ready_at("PaymentReceived"), timer: Arrivals.timer_ready_at(t)) do
    :payment ->
      Arrivals.claim("PaymentReceived")
      # Cancelling a fired timer raises, so the losing inline timer is cancelled only if unfired.
      if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)
      :payment

    :timer ->
      :timer

    nil ->
      await_any([{:signal_request, "PaymentReceived"}, t])
      race(t)
  end
end
```

**Cases are ranked by the workflow task each became ready in, then by listed order.** `Arrivals.first` takes `[{case, ready_at}]` in `.twf` order and returns the case ready in the earliest task, the first listed among those; `nil` means none is ready, so the race waits on every case with `await_any` and ranks again. Within one task the SDK applies every event before workflow code resumes (`executor/temporal_sdk_executor_workflow.erl:618-623`), so a tie is visible whole. Replay, though, applies history up to the next commanded event, not task by task (`executor/temporal_sdk_executor_workflow.erl:653-716`, `api/temporal_sdk_api_command.erl:48-70`). A round that issued no command can therefore see later events on replay than it saw live. Ranking by task, `Arrivals.task_of/1` (the first `WorkflowTaskStarted` after the event, read with `select_history/1`, `temporal_sdk/temporal_sdk_workflow.erl:2928-2949`), sees what the live run saw. A raw first-ready pick from `await_any`, which returns every listed awaitable and picks none (`temporal_sdk/temporal_sdk_workflow.erl:2614-2626`), is not replay-safe across tasks. [`corpus/concurrency/elixir/batch.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/elixir/batch.ex) is the worked example, and `await_one_test.exs` beside it holds the tie in both listed orders and both history orders. The `AwaitOne` fixture in [`corpus/messages/elixir/arrivals_fixtures.ex`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/elixir/arrivals_fixtures.ex) is the signal case above.

## Cases

| Case | Ready at, in `Arrivals.first` | Woken by, in `await_any` | Winner |
|------|-------------------------------|--------------------------|--------|
| signal | `Arrivals.ready_at("X")` | `{:signal_request, "X"}` | `Arrivals.claim("X")` gives the payload list |
| inline timer | `Arrivals.timer_ready_at(t)`, `t = start_timer(d)` started before the race | `t` | — |
| activity, child workflow, promise | `task_at(p)`, below | `p` | `wait(p)`, matched on `:completed` |
| timer promise | `Arrivals.timer_ready_at(p)` | `p` | — |
| condition | [condition.md](./condition.md) | — | — |
| nested `await all:` | the latest of its branches' tasks, `nil` while any is | each branch | each `wait` |
| update, nexus | unsupported ([update-handler.md](./update-handler.md), [nexus.md](./nexus.md)) | — | — |

```elixir
# The task a closed activity or child became ready in, or nil while it runs.
defp task_at(p) do
  case is_awaited(p) do
    {true, %{event_id: eid}} -> Arrivals.task_of(eid)
    {false, _} -> nil
  end
end
```

A closed activity or child carries its closing event's ID (`api/awaitable/temporal_sdk_api_awaitable_index.erl:973,1245`). A signal case peeks and takes only if it wins: `ready_at` reads the oldest pending arrival, and only the winner `claim`s it ([await-signal.md](./await-signal.md)).

## Notes

- **Losing cases** (spec 06): a losing inline timer is cancelled only if unfired, since cancelling a fired timer raises (`api/awaitable/temporal_sdk_api_awaitable_index_table.erl:308`); history records `TimerCanceled`. Losing inline activities and children keep running until the run ends: the race never cancels them, and the SDK has no command that cancels a child (`temporal_sdk/temporal_sdk_workflow.erl:32`). For a child at parent close, use `parent_close_policy` ([options.md](./options.md)). A bound promise is never cancelled for losing a round, a timer promise included.
- Every case lives in the main execution, the race included ([signal-handler.md](./signal-handler.md)).
- An empty case body → the winner's `claim` or `wait` alone.
- Event-driven/entity workflows repeat the race in a loop, ranking afresh each round; a bound deadline survives the rounds it loses ([composite-patterns.md](./composite-patterns.md)).
