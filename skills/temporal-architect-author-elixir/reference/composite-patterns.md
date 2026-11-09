# composite patterns

Bugs cluster where patterns combine. Two worked compositions; an update handler takes part in neither, since updates are unsupported ([update-handler.md](./update-handler.md)).

## Pattern 1: Signal-set condition vs timer (ManageRetention)

A retention timer races a cancellation signal.

### DSL

```twf
workflow ManageRetention(docId: string, retentionDays: int):
	state:
		condition cancelled

	signal CancelRetention():
		set cancelled

	await one:
		cancelled:
			activity DeleteDocument(docId)
			close complete
		timer(retentionDays * 24h):
			activity DeleteDocument(docId)
			close complete
```

### Elixir

```elixir
defmodule Retention.ManageRetention do
  use TemporalSdk.Workflow
  alias Retention.Arrivals

  @activity_opts [start_to_close_timeout: {1, :minute}]

  @impl true
  def execute(_context, [doc_id, retention_days]) do
    Process.put(:cancelled, nil)

    Arrivals.on("CancelRetention", fn [] ->
      Process.put(:cancelled, Process.get(:cancelled) || Arrivals.arrival_task())
    end)

    t = start_timer({retention_days, :day})
    race(t)

    with %{state: :completed} <- start_activity("DeleteDocument", [doc_id], @activity_opts ++ [wait: true]) do
      complete_workflow_execution([])
    else
      %{state: state} -> fail_workflow_execution(%{message: "DeleteDocument #{state}"})
    end
  end

  # Listed order: the condition, then the timer.
  defp race(t) do
    Arrivals.sync("CancelRetention")

    case Arrivals.first(cancelled: Process.get(:cancelled), timer: Arrivals.timer_ready_at(t)) do
      :cancelled ->
        if Arrivals.timer_ready_at(t) == nil, do: cancel_timer(t)

      :timer ->
        :ok

      nil ->
        await_any([{:signal_request, "CancelRetention"}, t])
        race(t)
    end
  end
end
```

### Why this is tricky

1. **The condition is ranked, not tested**: a `true` flag read after a wake-up decides by what is visible now, which replay can see further ahead than the live run did; the task of the arrival that set it is what both see ([await-one.md](./await-one.md))
2. **The condition case never claims**: a condition is read, not taken, so the signal's arrivals stay for any waiter ([condition.md](./condition.md))
3. **The losing timer is cancelled only if unfired**: cancelling a fired timer raises ([await-one.md](./await-one.md#notes))
4. **Both branches run the same tail**: one `DeleteDocument` call after the race, rather than one per case

## Pattern 2: Signal case vs a bound deadline, in a loop (CollectVotes)

Votes are counted until a deadline bound once before the loop.

```twf
workflow CollectVotes(pollId: string) -> (Tally):
	signal Vote():
		votes = votes + 1

	votes = 0
	promise deadline <- timer(24h)
	for:
		await one:
			signal Vote:
			deadline:
				close complete(Tally{votes: votes})
```

```elixir
@impl true
def execute(_context, [_poll_id]) do
  Process.put(:votes, 0)
  Arrivals.on("Vote", fn [] -> Process.put(:votes, Process.get(:votes) + 1) end)
  deadline = start_timer({24, :hour})
  collect(deadline)
end

# Listed order: signal Vote, then the deadline. A new round ranks afresh.
defp collect(deadline) do
  case Arrivals.first(vote: Arrivals.ready_at("Vote"), deadline: Arrivals.timer_ready_at(deadline)) do
    :vote ->
      Arrivals.claim("Vote")
      collect(deadline)

    :deadline ->
      complete_workflow_execution([%{"votes" => Process.get(:votes)}])

    nil ->
      await_any([{:signal_request, "Vote"}, deadline])
      collect(deadline)
  end
end
```

1. **The deadline is a bound promise**: it survives every round it loses, so the loop passes the same handle and never cancels it (spec 06; [promise.md](./promise.md))
2. **A vote of the deadline's task wins**: `Vote` is listed first, so votes ready in the same task are each claimed before the deadline wins
