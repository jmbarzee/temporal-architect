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

```csharp
[Activity]
public async Task<ProcessResult> ProcessLargeFileAsync(string fileId)
{
    var ctx = ActivityExecutionContext.Current;
    var lastIdx = ctx.Info.HeartbeatDetails.Count > 0 ? await ctx.Info.HeartbeatDetailAtAsync<int>(0) : -1;
    var file = await files.DownloadAsync(fileId);
    for (var i = lastIdx + 1; i < file.Chunks.Count; i++)
    {
        await files.ProcessAsync(file.Chunks[i]);
        ctx.Heartbeat(i);
    }
    return new(true);
}
```

- `ActivityExecutionContext.Current.Heartbeat(params object?[] details)` (`Activities/ActivityExecutionContext.cs:190`) — activities only. Pass one value (an object, or the progress index as above); the next attempt reads it back with `Info.HeartbeatDetailAtAsync<T>(0)` (`Activities/ActivityInfo.cs:126`).
- The calling side sets `HeartbeatTimeout` in its `ActivityOptions` ([options.md](./options.md)).
- Resume on retry and heartbeat timing: `temporal-developer` `references/dotnet/patterns.md` § Activity Heartbeat Details, `references/dotnet/gotchas.md` § Heartbeating.
