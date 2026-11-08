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

```clojure
(defactivity ProcessLargeFile
  [{:keys [files]} {:keys [file-id]}]
  (let [last-idx (or (a/get-heartbeat-details) -1)
        chunks   (:chunks (files/download files file-id))]
    (doseq [i (range (inc last-idx) (count chunks))]
      (files/process files (nth chunks i))
      (a/heartbeat i))
    {:success true}))

(defworkflow ProcessFiles
  [{:keys [file-id]}]
  @(a/invoke ProcessLargeFile {:file-id file-id}
             {:start-to-close-timeout (Duration/ofHours 2)
              :heartbeat-timeout      (Duration/ofSeconds 30)}))
```

- `a/heartbeat` sends one value, and the next attempt reads it back with `a/get-heartbeat-details`, `nil` when there is none (`src/temporal/activity.clj:16-44`) — activities only. Pass one value: a map, or the progress index as above.
- The calling side sets `:heartbeat-timeout` in its options map ([options.md](./options.md#activity-options)).
- Resume on retry, heartbeat timing and cancellation: [`doc/activities.md` § Detecting Cancellation via Heartbeat](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/activities.md#detecting-cancellation-via-heartbeat); the throttling is sdk-java's ([author-java](../../temporal-architect-author-java/reference/heartbeat.md)).
