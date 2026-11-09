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

```swift
@Activity
func processLargeFile(input: String) async throws -> ProcessResult {
    let context = ActivityExecutionContext.current
    let last = try await context?.info.heartbeatDetails(as: Int.self) ?? -1
    let file = try await files.download(input)
    for i in file.chunks.indices where i > last {
        try await files.process(file.chunks[i])
        context?.heartbeat(details: i)
    }
    return ProcessResult(success: true)
}
```

- `ActivityExecutionContext.current` (`Temporal/Worker/Activities/ActivityExecutionContext.swift:230`) is a task local, `nil` outside an activity; its `heartbeat(details:)` (`:293`) records progress and never throws. Pass one value (a struct, or the progress index as above).
- The next attempt reads it back with `info.heartbeatDetails(as:)`, `nil` when there is none (`:210-219`).
- The calling side sets `heartbeatTimeout` in its `ActivityOptions` ([options.md](./options.md)).
- Heartbeats deliver cancellation as Swift task cancellation: DocC [`Implementing-Activities.md` § Handle activity heartbeating and cancellation](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Implementing-Activities.md#handle-activity-heartbeating-and-cancellation).
