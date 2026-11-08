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

```java
@Override
public ProcessResult processLargeFile(String fileId) {
  ActivityExecutionContext ctx = Activity.getExecutionContext();
  int lastIdx = ctx.getHeartbeatDetails(Integer.class).orElse(-1);
  DownloadedFile file = files.download(fileId);
  for (int i = lastIdx + 1; i < file.chunks().size(); i++) {
    files.process(file.chunks().get(i));
    ctx.heartbeat(i);
  }
  return new ProcessResult(true);
}
```

- `Activity.getExecutionContext().heartbeat(details)` (`activity/Activity.java:20`, `activity/ActivityExecutionContext.java:36`) — activities only. Pass one value (a record, or the progress index as above); the next attempt reads it back with `getHeartbeatDetails(Class)`, an `Optional` (`:51`).
- The calling side sets `setHeartbeatTimeout` in its `ActivityOptions` ([options.md](./options.md)).
- Resume on retry and heartbeat timing: `temporal-developer` `references/java/patterns.md` § Activity Heartbeat Details, `references/java/gotchas.md` § Heartbeating.
