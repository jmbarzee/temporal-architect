# worker

```twf
@sdk(elixir, "elixir/workers.ex")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```elixir
# elixir/workers.ex
defmodule Orders.Workers do
  @moduledoc "Each .twf worker's types and start, shared by the worker process and the tests."

  @cluster :cluster_1

  def order_types_workflows, do: %{"ProcessOrder" => Orders.ProcessOrder}

  def order_types_activities,
    do: %{"ValidateOrder" => Orders.ValidateOrder, "ChargePayment" => Orders.ChargePayment}

  def start_order_types(task_queue \\ "orders") do
    {:ok, _} = start(:workflow, task_queue, order_types_workflows())
    {:ok, _} = start(:activity, task_queue, order_types_activities())
  end

  defp start(type, task_queue, names) do
    TemporalSdk.Worker.start(@cluster, type,
      namespace: "default",
      task_queue: task_queue,
      temporal_name_to_erlang: fn _cluster, name ->
        case Map.fetch(names, to_string(name)) do
          {:ok, module} -> {:ok, module}
          :error -> {:error, {"not a .twf name of this worker", %{name: name}}}
        end
      end,
      allowed_temporal_names: Map.keys(names)
    )
  end
end
```

## Registration

- **There is no per-type registration.** A worker serves any loaded module with an `execute/2` callback, resolving a type name with `binary_to_existing_atom` (`api/temporal_sdk_api.erl:591-615`, `poller/temporal_sdk_poller_adapter_utils.erl:24-80`), so each `.twf` worker is two name→module maps, its workflows and its activities, in `workers.ex`. Its `start_<worker>(task_queue)` starts a workflow and an activity worker on that queue with `TemporalSdk.Worker.start(cluster, :workflow | :activity, opts)` (`worker/temporal_sdk_worker.erl:444-454`), passing the map as `temporal_name_to_erlang` and its keys as `allowed_temporal_names` (`:39-41,186-196`). Without both, a `.twf` name finds no module and the task fails ([SKILL.md](../SKILL.md#wire-names)).
- The `.twf` worker's `@sdk(elixir, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- The name is typed `unicode:chardata()`, a binary or a charlist (`worker/temporal_sdk_worker.erl:192-195`), so the lookup takes `to_string(name)`.
- **The cluster** is the SDK's connection to one Temporal service, named in the application config (`config :temporal_sdk, clusters: [cluster_1: [client: …]]`) and started with the `:temporal_sdk` application; it cannot be started later at runtime (`docs/cluster/-module.md:1-49`). The namespace is each worker's `namespace:` (default `"default"`, `worker/temporal_sdk_worker_opts.erl:154`). Several DSL `worker` blocks are several `start_<worker>` functions on one cluster.
- **Or list them in config**: the cluster's `workflows:` and `activities:` take the same option lists and start the workers with the application (`docs/cluster/-module.md:25-29`). Keep the maps in `workers.ex` either way, and build the config from them in `config/runtime.exs`.
- Connecting, running and shutting down: [idioms.md § worker setup](./idioms.md#worker-setup).

**Nexus.** Unsupported ([nexus-service-def.md](./nexus-service-def.md)): `start_<worker>` starts no `:nexus` worker.

## Coverage

- Every worker on a task queue must serve the **identical** workflow and activity type set, or tasks intermittently land where they can't run. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target). A clean check is the design-time analog of full maps in `workers.ex`, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `schedule_to_start_timeout:` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

## Per-instance worker families

A `{param}` in a worker's `task_queue` is a family: one worker per instance, each polling its own queue ([task-queues.md](../../temporal-architect-design/topics/task-queues.md#per-instance-worker-families)).

```twf
workflow Agent(task: Task, lease: Lease) -> (ToolOutput):
	activity RunTool(task.call) -> output
		options:
			task_queue: "sandbox-{lease.sandboxId}"
			schedule_to_start_timeout: 30s
			start_to_close_timeout: 5m
	close complete(output)

namespace aivearium:
	worker sidecar
		options:
			task_queue: "sandbox-{sandboxId}"
			max_concurrent_activity_task_pollers: 2
```

```elixir
# workers.ex: one queue function per family, shared by the instance process and every caller.
def sandbox_queue(sandbox_id), do: "sandbox-" <> sandbox_id

# Called in the sidecar process, once per instance. start/4 is start/3 above with namespace
# "aivearium" and its option list bracketed, `[...] ++ opts`.
def start_sidecar(sandbox_id) do
  start(:activity, sandbox_queue(sandbox_id), sidecar_activities(),
    worker_id: "sidecar-" <> sandbox_id,
    task_poller_pool_size: 2
  )
end

# In Agent:
case start_activity("RunTool", [task["call"]],
       task_queue: Aivearium.Workers.sandbox_queue(lease["sandboxId"]),
       schedule_to_start_timeout: {30, :second},
       start_to_close_timeout: {5, :minute},
       wait: true
     ) do
  %{state: :completed, result: [output]} -> complete_workflow_execution([output])
  # :timedout here may be the instance gone: reroute, or rerun the sequence.
  %{state: state} -> fail_workflow_execution(%{message: "RunTool #{state}"})
end
```

- **The instance process starts its own worker,** one activity worker per instance, with a distinct `worker_id`. The family's workflows stay on a shared-queue worker.
- **Set `task_poller_pool_size` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **The call sets `task_queue:`, `schedule_to_start_timeout:` and `start_to_close_timeout:`.** A schedule-to-start timeout is not retried; it closes the activity `:timedout` ([activity-call.md](./activity-call.md)).

## Worker options

The namespace worker's `options:` map in [options.md](./options.md#worker-options), several to **none**.
