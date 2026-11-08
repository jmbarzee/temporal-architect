# nexus service definition

`nexus service Name:` and its `sync` and `async` operations are unsupported at the pin: Nexus is not implemented (`TODO.md:15`, `docs/temporal_sdk/nexus/-module.md:3`). The service lives on a worker in another SDK.

A handler half exists, untested end to end: a `:nexus` worker (`worker/temporal_sdk_worker.erl:23`) maps the service name to a module through `temporal_name_to_erlang` (`poller/temporal_sdk_poller_adapter_nexus_task_queue.erl:28-35`), whose `execute(context, payload)` takes one payload and answers one (`temporal_sdk/temporal_sdk_nexus.erl:82-83`). It cannot carry a `.twf` service:

- **`async Op workflow W`**: a handler answers only `sync_success`, with no operation token to start a workflow-backed operation, and its failed and cancelled answers send nothing (`api/temporal_sdk_api_nexus.erl:12-30`).
- **`sync Op`**: its caller cannot reach it from this SDK ([nexus.md](./nexus.md)), and its body's client forms include signal send, which is unsupported ([signal-send.md](./signal-send.md)).
