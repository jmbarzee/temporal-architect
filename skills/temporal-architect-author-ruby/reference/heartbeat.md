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

```ruby
class ProcessLargeFile < Temporalio::Activity::Definition
  def initialize(files)
    @files = files
  end

  def execute(file_id)
    ctx = Temporalio::Activity::Context.current
    last_idx = ctx.info.heartbeat_details.first || -1
    file = @files.download(file_id)
    file.chunks.each_with_index do |chunk, i|
      next if i <= last_idx

      @files.process(chunk)
      ctx.heartbeat(i)
    end
    ProcessResult.new(success: true)
  end
end
```

- `Temporalio::Activity::Context.current.heartbeat(*details)` (`activity/context.rb:11,65`) — activities only. Pass one value (a `Data`, or the progress index as above); the next attempt reads it back from `ctx.info.heartbeat_details`, an `Array` of the decoded values (`activity/info.rb:97`), a user type as a `Hash` to rebuild ([types.md](./types.md#user-types)).
- The calling side sets `heartbeat_timeout:` ([options.md](./options.md)).
- Resume on retry and heartbeat timing: `temporal-developer` `references/ruby/patterns.md` § Activity Heartbeat Details, `references/ruby/gotchas.md` § Heartbeating.
