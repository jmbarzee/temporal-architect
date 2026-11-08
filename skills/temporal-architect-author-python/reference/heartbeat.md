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

```python
@activity.defn(name="ProcessLargeFile")
async def process_large_file(self, file_id: str) -> ProcessResult:
    details = activity.info().heartbeat_details
    start = details[0] + 1 if details else 0
    file = await self.files.download(file_id)
    for i in range(start, len(file.chunks)):
        await self.files.process(file.chunks[i])
        activity.heartbeat(i)
    return ProcessResult(success=True)
```

- `activity.heartbeat(*details)` from `temporalio.activity` (`temporalio/activity.py:327`) — activities only. Its details (the progress index above) come back to the next attempt as `activity.info().heartbeat_details`, a sequence (`:111`).
- The calling side sets `heartbeat_timeout` in the call's options ([options.md](./options.md)).
- Resume on retry, cancellation and heartbeat timing: `temporal-developer` `references/python/patterns.md` § Activity Heartbeat Details, `references/python/gotchas.md` § Heartbeating.
