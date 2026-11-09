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

```haskell
processLargeFile :: ProvidedActivity FileEnv (Text -> Activity FileEnv ProcessResult)
processLargeFile = provideActivity JSON "ProcessLargeFile" \fileId ->
  withHeartbeat JSON \beat lastBeat -> do
    env <- ask
    lastIdx <- fromMaybe (-1) <$> lastBeat
    file <- liftIO (env.files.download fileId)
    for_ (drop (lastIdx + 1) (zip [0 :: Int ..] file.chunks)) \(i, chunk) -> do
      liftIO (env.files.process chunk)
      beat i
    pure ProcessResult {success = True}
```

- `withHeartbeat codec \beat lastBeat -> …` (`Activity.hs:192-208`) — activities only. `beat x` encodes one value with the codec and records it; `lastBeat` reads back the last attempt's value, `Nothing` on the first (`Activity/Worker.hs:100-111`). Pass one value: an object, or the progress index as above.
- The calling side sets `heartbeatTimeout` in its `StartActivityOptions` ([options.md](./options.md#activity-options)).
- Heartbeats are throttled by the worker, and a cancellation reaches the activity only when it heartbeats (`Activity.hs:133-139`); the worker's throttle interval is [worker.md](./worker.md#worker-options--configm-setters)'s `setMaxHeartbeatThrottleIntervalMillis`.
