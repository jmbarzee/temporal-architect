# heartbeat

## DSL

```twf
activity ProcessLargeFile(fileId: string) -> (ProcessResult):
    file = download(fileId)
    for (chunk in file.chunks):
        process(chunk)
        heartbeat(progress: {current: chunk, total: len(file.chunks)})
    return ProcessResult{success: true}
```

Calling the activity with heartbeat and timeout options:

```twf
workflow ProcessFiles(fileId: string) -> (ProcessResult):
    activity ProcessLargeFile(fileId) -> result
        options:
            start_to_close_timeout: 2h
            heartbeat_timeout: 30s
    close complete(result)
```

## Go

```go
func ProcessLargeFile(ctx context.Context, fileId string) (ProcessResult, error) {
    file, err := download(ctx, fileId)
    if err != nil {
        return ProcessResult{}, err
    }
    for _, chunk := range file.Chunks {
        if err := process(ctx, chunk); err != nil {
            return ProcessResult{}, err
        }
        activity.RecordHeartbeat(ctx, map[string]interface{}{
            "current": chunk,
            "total":   len(file.Chunks),
        })
    }
    return ProcessResult{Success: true}, nil
}
```

## Notes

- `heartbeat(args)` → `activity.RecordHeartbeat(ctx, details...)` — activity-only, never in workflows
- Heartbeat details are arbitrary; use a struct or map
- Set `HeartbeatTimeout` in `ActivityOptions` on the calling side — see [options.md](./options.md)
- The SDK throttles heartbeats automatically (sent at `heartbeatTimeout * 0.8`, capped at 60s). No manual batching needed — call `RecordHeartbeat` as often as desired
- The plain function shown above becomes a struct method in practice — see [activity-def.md](./activity-def.md) notes

## Resume pattern

Activities that heartbeat should resume from the last recorded progress on retry. Check for previous heartbeat details at activity start:

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

- `HasHeartbeatDetails` returns `false` on the first attempt (no prior failure)
- Details come from the last heartbeat delivered to the server (post-throttling) — may be slightly behind the last `RecordHeartbeat` call
- Heartbeat recording without a resume pattern is incomplete — the activity restarts from the beginning on every retry, wasting the progress tracking
