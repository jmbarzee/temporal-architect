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

```php
#[ActivityMethod(name: 'ProcessLargeFile')]
public function processLargeFile(string $fileId): ProcessResult
{
    $lastIdx = Activity::hasHeartbeatDetails() ? Activity::getHeartbeatDetails('int') : -1;
    $file = $this->files->download($fileId);
    for ($i = $lastIdx + 1; $i < \count($file->chunks); $i++) {
        $this->files->process($file->chunks[$i]);
        Activity::heartbeat($i);
    }
    return new ProcessResult(true);
}
```

- `Activity::heartbeat($details)` (`Activity.php:160`) — activities only. Pass one value (an object, or the progress index as above); the next attempt reads it back with `Activity::getHeartbeatDetails($type)` after `Activity::hasHeartbeatDetails()` (`Activity.php:86-101`).
- The calling side sets `withHeartbeatTimeout` in its `ActivityOptions` ([options.md](./options.md)).
- Resume on retry, cancellation through heartbeats, and heartbeat timing: `temporal-developer` [`patterns.md` § Activity Heartbeat Details](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#activity-heartbeat-details), [`gotchas.md` § Heartbeating](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#heartbeating).
