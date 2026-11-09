# heartbeat

```twf
activity ProcessLargeFile(fileId: string) -> (ProcessResult):
	file = download(fileId)
	for (chunk in file.chunks):
		process(chunk)
		heartbeat(progress: {current: chunk, total: len(file.chunks)})
	return ProcessResult{success: true}

workflow ProcessFiles(fileId: string) -> (ProcessResult):
	activity ProcessLargeFile(fileId) -> result
		options:
			start_to_close_timeout: 2h
			heartbeat_timeout: 30s
	close complete(result)
```

```elixir
defmodule Files.ProcessLargeFile do
  use TemporalSdk.Activity

  @impl true
  def execute(_context, [file_id]) do
    file = Files.Store.download(file_id)

    file.chunks
    |> Enum.with_index()
    |> Enum.each(fn {chunk, i} ->
      Files.Store.process(chunk)
      heartbeat([%{"current" => i, "total" => length(file.chunks)}])
    end)

    [%{"success" => true}]
  end

  @impl true
  def handle_heartbeat(_context), do: :heartbeat

  @impl true
  def handle_cancel(%{cancel_requested: true}), do: {:cancel, ["cancelled"]}
  def handle_cancel(_context), do: :ignore
end
```

- `heartbeat(details)` (`temporal_sdk/temporal_sdk_activity.erl:183-185`) — activities only. `details` is a payload list, `[value]`: it becomes the activity's last heartbeat and fires one at once (`executor/temporal_sdk_executor_activity.erl:385-386`).
- **The SDK also heartbeats on its own**, every `heartbeat_timeout` × 0.8 (`heartbeat_timeout_ratio`, `worker/temporal_sdk_worker_opts.erl:173`, `executor/temporal_sdk_executor_activity.erl:863-867`). Each heartbeat, called or timed, runs `handle_heartbeat/1`, whose `:heartbeat` sends the last details and `{:heartbeat, [new]}` replaces them (`:398-402,486-496`); each server reply runs `handle_cancel/1`, whose `{:cancel, details}` ends the attempt cancelled once cancellation is requested (`:456-468,434-447`). Both callbacks are optional in the behaviour, but the executor calls them directly, so **an activity that calls `heartbeat` or runs under a `heartbeat_timeout` defines both**: a missing one fails the attempt (`:772-787,413-416,450-453`).
- The calling side sets `heartbeat_timeout:` in its options ([options.md](./options.md)).
- The previous attempt's details arrive raw, as the task's `heartbeat_details` payloads in `context.task`; the SDK does not decode them (`temporal_sdk/temporal_sdk_activity.erl:37-49`). Heartbeat handling and resume: [idioms.md](./idioms.md) and the `activity_heartbeat` sample.
