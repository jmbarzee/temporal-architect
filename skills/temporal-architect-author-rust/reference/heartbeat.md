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

```rust
#[activity(name = "ProcessLargeFile")]
pub async fn process_large_file(
    self: Arc<Self>,
    ctx: ActivityContext,
    file_id: String,
) -> Result<ProcessResult, ActivityError> {
    let last: Option<usize> = ctx.heartbeat_details().deserialize()?;
    let file = self.files.download(&file_id).await?;
    for (i, chunk) in file.chunks.iter().enumerate().skip(last.map_or(0, |i| i + 1)) {
        self.files.process(chunk).await?;
        ctx.record_heartbeat(i).await?;
    }
    Ok(ProcessResult { success: true })
}
```

- `ctx.record_heartbeat(details)` (`sdk/src/activities.rs:298-309`) — activities only. Pass one value (a struct, or the progress index as above); the next attempt reads it back with `ctx.heartbeat_details().deserialize::<T>()`, `None` on a first attempt (`:292-296,367-376`). A local activity's heartbeat is skipped (`:303`).
- The calling side sets `heartbeat_timeout` in its `ActivityOptions` ([options.md](./options.md)).
- Cancellation arrives through heartbeats, and the activity reads it from `ctx.is_cancelled()` or `ctx.cancelled()` (`:281-290`); the SDK's own example shows resume and cancellation together (`sdk/examples/activity_heartbeating/workflows.rs:15-31`).
