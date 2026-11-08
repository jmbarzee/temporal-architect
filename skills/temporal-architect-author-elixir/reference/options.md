# options

Option keys map to the keyword list a call takes as its last argument. A duration is an integer of **milliseconds** or a `{n, unit}` tuple (`2m` → `{2, :minute}`; units `:millisecond` to `:day`, `temporal_sdk/temporal_sdk.erl:130-135`). `retry_policy:` → a map with the `.twf` keys unchanged: `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types` (`temporal_sdk/temporal_sdk.erl:138-144`); its two intervals take **integer milliseconds only**, never a tuple (`api/temporal_sdk_api_common.erl:22-37`). `priority:` → the raw proto map, `%{priority_key: 1, fairness_key: "tenant-a", fairness_weight: 1.0}` (`temporal_sdk/temporal_sdk_workflow.erl:179`).

**Options live on the call.** Each `start_activity` or `start_child_workflow` takes its own keyword list; calls sharing options share one module attribute.

## Activity options

```twf
activity UnreliableService(data) -> result
	options:
		start_to_close_timeout: 2m
		retry_policy:
			maximum_attempts: 5
			initial_interval: 1s
			backoff_coefficient: 2.0
			maximum_interval: 60s
```

```elixir
start_activity("UnreliableService", [data],
  start_to_close_timeout: {2, :minute},
  retry_policy: %{
    maximum_attempts: 5,
    initial_interval: 1_000,
    backoff_coefficient: 2.0,
    maximum_interval: 60_000
  },
  wait: true
)
```

`start_activity/3`'s options (`temporal_sdk/temporal_sdk_workflow.erl:165-207,1665-1690`):

| TWF | `start_activity/3` option |
|-----|---------------------------|
| `task_queue` | `task_queue:`; unset, the worker's own queue (`:1727`) |
| `schedule_to_close_timeout` | `schedule_to_close_timeout:` |
| `schedule_to_start_timeout` | `schedule_to_start_timeout:` |
| `start_to_close_timeout` | `start_to_close_timeout:`; with neither it nor `schedule_to_close_timeout` set, the SDK sets 1000 × `heartbeat_timeout` if that is set, else **10 minutes** (`:1729-1748`) |
| `heartbeat_timeout` | `heartbeat_timeout:` |
| `retry_policy` | `retry_policy:` |
| `priority` | `priority:` |
| `request_eager_execution` | `eager_execution:`, in the same sense: `true` sets `request_eager_execution` (`:1750-1755`); unset, `false` |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```elixir
start_child_workflow(context.worker_opts.task_queue, "ChildWorkflow",
  input: [input["data"]],
  workflow_id: context.task.workflow_execution.workflow_id <> "/ChildWorkflow",
  workflow_execution_timeout: {1, :hour},
  parent_close_policy: :PARENT_CLOSE_POLICY_REQUEST_CANCEL,
  retry_policy: %{maximum_attempts: 3},
  wait: true
)
```

`start_child_workflow/3` (`temporal_sdk/temporal_sdk_workflow.erl:261-286,2060-2140`) takes the **task queue as its first, positional argument**, with no default: the caller's is `context.worker_opts.task_queue`. Always pass **`workflow_id:`**: the default is built from the parent's type, execution and a counter, never its workflow ID (`:2063-2070`), so two concurrent parents of one type start children under the same ID ([workflow-call.md](./workflow-call.md)).

| TWF | `start_child_workflow/3` option |
|-----|------------------------|
| `task_queue` | the first argument |
| `workflow_execution_timeout` | `workflow_execution_timeout:` |
| `workflow_run_timeout` | `workflow_run_timeout:` |
| `workflow_task_timeout` | `workflow_task_timeout:` |
| `workflow_id_reuse_policy` | `workflow_id_reuse_policy:`, an atom: `:WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE` |
| `retry_policy` | `retry_policy:` |
| `priority` | `priority:` |
| `parent_close_policy` | `parent_close_policy:`: `:PARENT_CLOSE_POLICY_TERMINATE`, `:PARENT_CLOSE_POLICY_REQUEST_CANCEL` or `:PARENT_CLOSE_POLICY_ABANDON`; unset leaves the server's default, terminate |

`namespace:` defaults to `"default"`, not the caller's (`:2072`): pass the worker's namespace when it is another.

A client start, `TemporalSdk.start_workflow(cluster, task_queue, "Name", opts)`, takes the same keys less `parent_close_policy`, plus `workflow_id:` and `workflow_id_conflict_policy:` (`temporal_sdk/temporal_sdk.erl:219-259`).

## Nexus operation options

Unsupported: Nexus is not implemented ([nexus.md](./nexus.md)). `start_nexus/5` takes `schedule_to_close_timeout` alone, with no `schedule_to_start_timeout` or `start_to_close_timeout` (`temporal_sdk/temporal_sdk_workflow.erl:290-303`).

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One function on the definition's module returns that keyword list, and every call starts from it. A call with its own `options:` merges them in with `Keyword.merge/2`, which replaces each key whole, a nested map included:

```elixir
# payments/charge_card.ex
defmodule Payments.ChargeCard do
  use TemporalSdk.Activity

  def defaults, do: [start_to_close_timeout: {30, :second}, retry_policy: %{maximum_attempts: 5}]
  # ...
end

# In the workflow:
start_activity("ChargeCard", [card, amount], Payments.ChargeCard.defaults() ++ [wait: true])

start_activity("ChargeCard", [card, tip],
  Keyword.merge(Payments.ChargeCard.defaults(), retry_policy: %{maximum_attempts: 1}, wait: true)
)
```

Never `Map.merge` the override into the default's `retry_policy`: that merges field by field.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `workflow_id_reuse_policy: :WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE`; `workflow_id_conflict_policy` → `workflow_id_conflict_policy: :WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING`, the proto enum names as atoms. Where each lands depends on the start kind:

- **Client start**: both, in `TemporalSdk.start_workflow/4`'s options (`temporal_sdk/temporal_sdk.erl:230-232`), from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)).
- **Child start**: `start_child_workflow/3` has no conflict policy, so it takes the reuse policy only (`temporal_sdk/temporal_sdk_workflow.erl:261-286`).

## Worker options

A namespace worker's `options:` map onto `TemporalSdk.Worker.start/3`'s options (`worker/temporal_sdk_worker.erl:32-196`), given to the workflow worker, the activity worker, or both, as each row says. The rows marked **none** have no equivalent at the pin: leave them out of the code and tell the user.

| TWF worker option | Elixir |
|-------------------|--------|
| `task_queue` | `task_queue:` on both workers (required, `worker/temporal_sdk_worker_opts.erl:155`) |
| `worker_activity_rate_limit` | the activity worker's `limits: %{worker: %{activity_regular: {concurrency, frequency}}}`, whose frequency counts tasks per `limiter_time_windows` window, 60 s by default (`limiter/temporal_sdk_limiter.erl:76-79,125`); for a per-second rate, also `limiter_time_windows: %{activity_regular: 1_000}`. The tuple needs both numbers as positive integers (`utils/temporal_sdk_utils_opts.erl:160`), so set the concurrency deliberately |
| `task_queue_activity_rate_limit` | **none**: polls never set the task queue's rate (`api/temporal_sdk_api_poll.erl:31`) |
| `max_concurrent_activity_executions` | the concurrency in the activity worker's `limits: %{worker: %{activity_regular: {concurrency, frequency}}}` |
| `max_concurrent_workflow_task_executions` | the concurrency in the workflow worker's `limits: %{worker: %{workflow: {concurrency, frequency}}}`; it counts live workflow executors, each held from its run's first task until eviction, not tasks in flight (`executor/temporal_sdk_executor_workflow.erl:229,2771`) |
| `max_concurrent_local_activity_executions` | **none**: the SDK has no local activities (`temporal_sdk/temporal_sdk_workflow.erl:7-40`) |
| `max_concurrent_nexus_task_executions` | unsupported with Nexus ([nexus.md](./nexus.md)) |
| `max_concurrent_workflow_task_pollers` | the workflow worker's `task_poller_pool_size:` (default 5, `worker/temporal_sdk_worker_opts.erl:303`) |
| `max_concurrent_activity_task_pollers` | the activity worker's `task_poller_pool_size:` (default 10, `:299`) |
| `max_concurrent_nexus_task_pollers` | unsupported with Nexus ([nexus.md](./nexus.md)) |
| `max_cached_workflows` | **none**: no cache size; each cached run is evicted by its workflow's `handle_eviction/2`, or the SDK's default for it (`temporal_sdk/temporal_sdk_workflow.erl:1586-1590`, `docs/temporal_sdk/workflow/c-handle_eviction-2.md`) |
| `sticky_schedule_to_start_timeout` | the workflow worker's `task_settings: [sticky_execution: [type: :pool, schedule_to_start_timeout: t]]` (`worker/temporal_sdk_worker_opts.erl:269-277,288-297`); `type: :disabled` turns sticky execution off |
| `max_heartbeat_throttle_interval` | **none**: heartbeats are not throttled (`TODO.md:25`) |
| `worker_identity` | **none**: the SDK derives each poller's identity from the worker ID and type (`poller/temporal_sdk_poller.erl:114`) |
| `worker_shutdown_timeout` | **none**: shutdown is a call, `TemporalSdk.Worker.terminate(cluster, type, worker_id)`, with no timeout (`worker/temporal_sdk_worker.erl:464-470`) |
| `local_activity_only_mode` | **none**: the SDK has no local activities |
| `versioning` | **none**: worker versioning is not implemented (`TODO.md:13`) |

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
```

```elixir
# workers.ex, with start/4 from worker.md (namespace "orders"):
def start_order_types(task_queue \\ "orders") do
  {:ok, _} = start(:workflow, task_queue, order_types_workflows())

  {:ok, _} =
    start(:activity, task_queue, order_types_activities(),
      limits: %{worker: %{activity_regular: {50, 1_000_000}}}
    )
end
```

## Timeouts and retries

The SDK's hexdocs at the pin: [idioms.md § errors](./idioms.md#errors).
