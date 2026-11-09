# signal send

`signal handle.Name(args)` and `signal Type.Name(args)` with `id:`, `run_id:` or `id: parent` are unsupported at the pin: a workflow cannot signal another workflow. `signal_external_workflow` is a TODO, commented out of the workflow API (`temporal_sdk/temporal_sdk_workflow.erl:33`, `TODO.md:3`), and no child handle carries a signal.

The client call `TemporalSdk.signal_workflow(cluster, workflow_id, "Name", input: [a, b])` (`temporal_sdk/temporal_sdk.erl:1363-1380`) sends from outside workflows only: a test, a service, an activity body. It is a direct gRPC request, not a workflow command, so in workflow code it would stand outside the run's history. Its args are positional, one payload per DSL arg (`:424-438`).
