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

```ts
import { activityInfo, heartbeat } from '@temporalio/activity';

async ProcessLargeFile(fileId: string): Promise<ProcessResult> {
  const lastIdx: number | undefined = activityInfo().heartbeatDetails;
  const file = await files.download(fileId);
  for (let i = (lastIdx ?? -1) + 1; i < file.chunks.length; i++) {
    await files.process(file.chunks[i]);
    heartbeat(i);
  }
  return { success: true };
},
```

- `heartbeat(details)` from `@temporalio/activity` (`activity/src/index.ts`) — activities only. It takes one `details` value (an object, or the progress index as above); the next attempt reads it back as `activityInfo().heartbeatDetails`.
- The calling side sets `heartbeatTimeout` in the proxy's options ([options.md](./options.md)).
- Resume on retry and heartbeat timing: `temporal-developer` `references/typescript/patterns.md` § Activity Heartbeat Details, `references/typescript/gotchas.md` § Heartbeating.
