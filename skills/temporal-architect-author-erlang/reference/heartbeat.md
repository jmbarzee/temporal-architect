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

```erlang
-module(files_process_large_file).

-export([execute/2, handle_heartbeat/1, handle_cancel/1]).

-include_lib("temporal_sdk/include/activity.hrl").

execute(_Context, [FileId]) ->
    #{~"chunks" := Chunks} = files_store:download(FileId),
    Total = length(Chunks),
    lists:foldl(
        fun(Chunk, I) ->
            files_store:process(Chunk),
            heartbeat([#{~"current" => I, ~"total" => Total}]),
            I + 1
        end,
        0,
        Chunks
    ),
    [#{~"success" => true}].

handle_heartbeat(_Context) -> heartbeat.

handle_cancel(#{cancel_requested := true}) -> {cancel, [~"cancelled"]};
handle_cancel(_Context) -> ignore.
```

- `heartbeat(Details)` (`temporal_sdk/temporal_sdk_activity.erl:183-185`) — activities only, imported by `activity.hrl`. `Details` is a payload list, `[Value]`.
- **An activity that calls `heartbeat` or runs under a `heartbeat_timeout` exports both callbacks**, `handle_heartbeat/1` returning `heartbeat` or `{heartbeat, [New]}`, and `handle_cancel/1` returning `{cancel, Details}` or `ignore` (`temporal_sdk/temporal_sdk_activity.erl:75,89,100-104`): the executor calls them directly, so a missing one fails the attempt. Why, the SDK's own heartbeats, and the previous attempt's details: [author-elixir heartbeat.md](../../temporal-architect-author-elixir/reference/heartbeat.md).
- The calling side sets `{heartbeat_timeout, …}` in its options ([options.md](./options.md)).
- Heartbeat handling and resume: the `activity_heartbeat` sample, `temporal_sdk_samples`' `src/activity_heartbeat/`.
