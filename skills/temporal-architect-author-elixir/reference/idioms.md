# idioms

Temporal's `temporal-developer` skill does not cover Erlang or Elixir. How to write Temporal Elixir well is the SDK's hexdocs and `andrzej-mag/temporal_sdk_samples` at `2bb0621`; read them there, never a copy here. The guides and samples show Elixir and Erlang side by side.

- **The hexdocs links target the Hex release 0.2.20**, since hexdocs publishes Hex versions only. Its `docs/`, `guides/` and `src/` match the pin's, except `src/temporal_sdk.app.src`'s `vsn` and `description`. So read 0.2.20's pages, but never install it: it is BUSL-1.1 ([SKILL.md](../SKILL.md#orient)).
- **The samples build against Hex 0.2.20** (samples `rebar.config:7`) and name types by module atom, which [Wire names](../SKILL.md#wire-names) overrides for the `.twf` mapping.

Each topic adds only what those pages leave out.

## Worker setup

- Hexdocs: [Quick Start](https://hexdocs.pm/temporal_sdk/0.2.20/quick_start.html), whose `mix.exs` line installs the Hex release (take the git pin from [SKILL.md](../SKILL.md#orient) instead); [`temporal_sdk_cluster`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_cluster.html) (the cluster's client and its `workflows:` and `activities:` workers); [`temporal_sdk_worker` § Task Worker Configuration](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_worker.html#module-task-worker-configuration); [`temporal_sdk_client`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_client.html) (endpoints); [SDK Architecture](https://hexdocs.pm/temporal_sdk/0.2.20/architecture.html) § [Workflow Sticky Execution](https://hexdocs.pm/temporal_sdk/0.2.20/architecture.html#workflow-sticky-execution), § [Workflow Eviction](https://hexdocs.pm/temporal_sdk/0.2.20/architecture.html#workflow-eviction) and § [Rate Limiting](https://hexdocs.pm/temporal_sdk/0.2.20/architecture.html#rate-limiting).
- Samples: [`hello_world.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/hello_world.md), [`workflow_eviction.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/workflow_eviction.md), [`rate_limiter.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/rate_limiter.md).

## Testing

- **A hole.** The SDK has no test environment and no time skipping, so tests run against a dev server ([SKILL.md](../SKILL.md#orient)). Replay is the one documented check: hexdocs [`replay_file/3`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk.html#replay_file/3) and [`replay_json/3`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk.html#replay_json/3); samples [`replay_test.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/replay_test.md). The corpus's [`replay_test.exs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/elixir/replay_test.exs) replays the histories recorded beside it.

## Determinism

- Samples: [`determinism_check.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/determinism_check.md) and [`mutable_marker.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/mutable_marker.md) (experimental).
- Hexdocs: [`temporal_sdk_api_workflow_check`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_api_workflow_check.html), the check a workflow worker's `task_settings: [deterministic_check_mod: …]` names (`worker/temporal_sdk_worker_opts.erl:184-186`); the markers [`record_uuid4/0`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#record_uuid4/0), [`record_system_time/0`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#record_system_time/0) and [`record_rand_uniform/0`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#record_rand_uniform/0), each recording its value in history (`temporal_sdk/temporal_sdk_workflow.erl:2374-2424`).

## Errors

- Hexdocs: [`fail_workflow_execution/1`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#fail_workflow_execution/1) and the workflow's [`handle_failure/4`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#c:handle_failure/4); the activity's [`fail/1`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_activity.html#fail/1), [`handle_failure/4`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_activity.html#c:handle_failure/4), [`handle_heartbeat/1`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_activity.html#c:handle_heartbeat/1) and [`handle_cancel/1`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_activity.html#c:handle_cancel/1).
- Samples: [`saga.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/saga.md) (compensation on an activity's closing state), [`child_workflow.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/child_workflow.md), [`activity_heartbeat.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/activity_heartbeat.md) (heartbeats and selective cancellation), [`workflow_cancel.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/workflow_cancel.md).

## Data

- Samples: [`payload_converter.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/payload_converter.md), a custom codec chain on a cluster's `client: [grpc_opts: [converter: …]]`.
- The default chain is undocumented; what it round-trips for each `.twf` type is [types.md](./types.md).

## Versioning

- **A hole.** There is no patching call: `temporal_sdk_workflow` exports none (`temporal_sdk/temporal_sdk_workflow.erl:7-124`). Worker versioning is not implemented (`TODO.md:13`), and [`temporal_sdk_versioning`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_versioning.html) is an empty work in progress (`temporal_sdk/temporal_sdk_versioning.erl:1-4`).
- So a change to a running workflow's commands ships as a new workflow type, or after the old runs close; replaying their recorded histories ([§ Testing](#testing)) finds such a change.

## Signals and queries

- Samples: [`signal_simple.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/signal_simple.md), [`signal_parallel_handler.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/signal_parallel_handler.md), [`query_parallel_handler.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/query_parallel_handler.md), [`awaitable_event.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/awaitable_event.md), [`parallel_execution.md`](https://github.com/andrzej-mag/temporal_sdk_samples/blob/2bb0621/docs/parallel_execution.md).
- Hexdocs: [`admit_signal/2`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#admit_signal/2), [`respond_query/2`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#respond_query/2), [`start_execution/1`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#start_execution/1), [`set_info/2`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#set_info/2), and the workflow's [`handle_query/2`](https://hexdocs.pm/temporal_sdk/0.2.20/temporal_sdk_workflow.html#c:handle_query/2).
- The signal samples wait on raw awaitables, some in parallel executions. The `.twf` mapping keeps every waiter in the main execution, through `Arrivals`, so each arrival is taken once and in order ([signal-handler.md](./signal-handler.md)). Queries follow [query-handler.md](./query-handler.md).
