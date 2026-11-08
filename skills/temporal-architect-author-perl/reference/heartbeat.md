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

```perl
async method process_large_file :Defn('ProcessLargeFile') ($file_id) {
    my $ctx  = Temporalio::Activity::context();
    my ($p)  = @{ $ctx->info->{heartbeat_details} // [] };
    my $last = defined $p ? $ctx->payload_converter->from_payload($p) : -1;
    my $file = await $files->download($file_id);
    for my $i ($last + 1 .. $#{ $file->{chunks} }) {
        await $files->process($file->{chunks}[$i]);
        Temporalio::Activity::heartbeat($i);
    }
    return { success => !!1 };
}
```

- `Temporalio::Activity::heartbeat(@details)` (`Activity.pm:36`) — activities only. Pass one value (a hashref, or the progress index as above).
- The next attempt finds it in `Temporalio::Activity::context()->info->{heartbeat_details}` as raw payloads, not decoded (`Worker/ActivityDispatcher.pm:433`): decode one with the context's `payload_converter->from_payload` (`Activity/Context.pm:197`).
- The calling side sets `heartbeat_timeout` in its options ([options.md](./options.md)).
- Resume on retry and cancellation: sdk-perl `README.md` § Heartbeating and cancellation (`:934-967`).
