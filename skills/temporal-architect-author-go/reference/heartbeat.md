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

```go
func (a *Activities) ProcessLargeFile(ctx context.Context, fileId string) (ProcessResult, error) {
    startIdx := 0
    if activity.HasHeartbeatDetails(ctx) {
        var lastIdx int
        if err := activity.GetHeartbeatDetails(ctx, &lastIdx); err == nil {
            startIdx = lastIdx + 1
        }
    }

    file, err := a.download(ctx, fileId)
    if err != nil {
        return ProcessResult{}, err
    }
    for i := startIdx; i < len(file.Chunks); i++ {
        if err := a.process(ctx, file.Chunks[i]); err != nil {
            return ProcessResult{}, err
        }
        activity.RecordHeartbeat(ctx, i)
    }
    return ProcessResult{Success: true}, nil
}
```

- `heartbeat(details)` → `activity.RecordHeartbeat(ctx, details...)` — activities only. Details are arbitrary (struct, map, or the progress index as above).
- The calling side sets `HeartbeatTimeout` in `ActivityOptions` ([options.md](./options.md)).
- Resume on retry (the prologue above) and heartbeat timing: `temporal-developer` `references/go/patterns.md` § Activity Heartbeat Details, `references/go/gotchas.md` § Heartbeating.
