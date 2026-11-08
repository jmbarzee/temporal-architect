# worker

```twf
@sdk(ruby, "worker.rb")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```ruby
# worker.rb
require 'temporalio/client'
require 'temporalio/env_config'
require 'temporalio/worker'
require_relative 'activities'
require_relative 'workflows'

module Orders
  ORDERS_TASK_QUEUE = 'orders'

  # The orderTypes worker: its task queue and registrations, shared by the
  # worker process and the tests.
  def self.order_types(client, activities:)
    Temporalio::Worker.new(client:, task_queue: ORDERS_TASK_QUEUE, workflows: [ProcessOrder], activities:)
  end
end

if __FILE__ == $PROGRAM_NAME
  args, kwargs = Temporalio::EnvConfig::ClientConfig.load_client_connect_options
  client = Temporalio::Client.connect(*args, **kwargs)
  activities = [Orders::ValidateOrder.new(validator), Orders::ChargePayment.new(payments)] # real dependencies
  Orders.order_types(client, activities:).run(shutdown_signals: ['SIGINT'])
end
```

## Registration

- Each `.twf` worker has a factory method in `worker.rb` named for the worker (`order_types`), returning `Temporalio::Worker.new(client:, task_queue:, workflows: […], activities: […])` (`worker.rb:463-467`). The `.twf` worker's `@sdk(ruby, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `workflows:` lists workflow classes; `activities:` lists activity instances built with real dependencies, or classes for activities with none ([activity-def.md](./activity-def.md)). Registration is per class, so several `.twf` workers' types may share one module. The `activities:` keyword lets a test pass its own; the corpus's `batch_types(client, activities: [Count, Store])` defaults it.
- The task queue is the namespace worker's `task_queue` option; the namespace is the client's (`Client.connect(target_host, namespace, …)`, `client.rb:110-112`, or the environment config as above). Several DSL `worker` blocks → several `Worker`s, each from its own factory method; `Temporalio::Worker.run_all(w1, w2)` (`worker.rb:138`) runs them together.
- Connecting, running and shutting down: `temporal-developer` `references/ruby/ruby.md` § Worker Setup; Rails: `advanced-features.md` § Rails Integration.

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** Unsupported: a Ruby worker cannot register a `nexus service` ([nexus-service-def.md](./nexus-service-def.md)). A `.twf` worker that registers one is authored in another SDK; its endpoint belongs to `temporal-architect-author-infra`.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `Worker` polls its task queue in its client's namespace only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `schedule_to_start_timeout:` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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
			worker_identity: "sidecar-{sandboxId}"
			max_concurrent_activity_task_pollers: 2
```

```ruby
# In module Sandbox: one queue method per family, shared by the instance process and every caller.
def self.sandbox_queue(sandbox_id) = "sandbox-#{sandbox_id}"

# In the sidecar process, one per instance:
def self.sidecar(client, sandbox_id, activities:)
  Temporalio::Worker.new(
    client:, task_queue: sandbox_queue(sandbox_id), activities:,
    identity: "sidecar-#{sandbox_id}",
    max_concurrent_activity_task_polls: 2
  )
end

# In Agent#execute:
begin
  output = Temporalio::Workflow.execute_activity(
    RunTool, task.call,
    task_queue: Sandbox.sandbox_queue(lease.sandboxId),
    schedule_to_start_timeout: 30,
    start_to_close_timeout: 300
  )
rescue Temporalio::Error::ActivityError => e
  if e.cause.is_a?(Temporalio::Error::TimeoutError) &&
     e.cause.type == Temporalio::Error::TimeoutError::TimeoutType::SCHEDULE_TO_START
    # The instance is gone: reroute, or rerun the sequence.
  end
  raise
end
```

- **The instance process starts its own worker,** one `Worker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `max_concurrent_activity_task_polls:` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **Identity defaults to the client's, `pid@hostname`** (`worker.rb:394`, `client/connection.rb:250`), so it is unique per member only when each member is its own process. A process running several members sets `identity:` with the instance key.
- **The call sets `task_queue:`, `schedule_to_start_timeout:` and `start_to_close_timeout:`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutError` cause of an `ActivityError`, whose `type` compares to `TimeoutType::SCHEDULE_TO_START` (`error/failure.rb:148-165`, `converters/failure_converter.rb:156-159`).

## Worker options

The namespace worker's `options:` block maps onto `Worker.new` keywords (`worker.rb:463-497`), in seconds for every duration:

| TWF worker option | Ruby |
|-------------------|------|
| `task_queue` | `task_queue:` |
| `worker_activity_rate_limit` | `max_activities_per_second:` (renamed) |
| `task_queue_activity_rate_limit` | `max_task_queue_activities_per_second:` (renamed); the SDK asks for `disable_eager_activity_execution: true` beside it (`worker.rb:425-429`) |
| `max_concurrent_activity_executions` | **moved into the tuner**: `tuner: Temporalio::Worker::Tuner.create_fixed(activity_slots:)` (`worker/tuner.rb:266-276`) |
| `max_concurrent_workflow_task_executions` | the tuner's `workflow_slots:` |
| `max_concurrent_local_activity_executions` | the tuner's `local_activity_slots:` |
| `max_concurrent_nexus_task_executions` | **unsupported**: no Nexus worker (`worker.rb:591`) |
| `max_concurrent_workflow_task_pollers` | `max_concurrent_workflow_task_polls:` (renamed) |
| `max_concurrent_activity_task_pollers` | `max_concurrent_activity_task_polls:` (renamed) |
| `max_concurrent_nexus_task_pollers` | **unsupported**: no Nexus worker |
| `max_cached_workflows` | `max_cached_workflows:` |
| `sticky_schedule_to_start_timeout` | `sticky_queue_schedule_to_start_timeout:` (renamed) |
| `max_heartbeat_throttle_interval` | `max_heartbeat_throttle_interval:` |
| `worker_identity` | `identity:` (renamed) |
| `worker_shutdown_timeout` | `graceful_shutdown_period:` (renamed): how long activities get after shutdown before they are cancelled (`worker.rb:423-424`) |
| `local_activity_only_mode: true` | `no_remote_activities: true` (renamed, not inverted) |
| `versioning` | not 1:1 — see below |

The three slot counts share one `Tuner.create_fixed` call, each defaulting to 100; set only those the `.twf` gives.

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			max_cached_workflows: 1000
			worker_shutdown_timeout: 30s
```

```ruby
Temporalio::Worker.new(
  client:, task_queue: ORDERS_TASK_QUEUE, workflows: [ProcessOrder], activities:,
  tuner: Temporalio::Worker::Tuner.create_fixed(activity_slots: 50),
  max_cached_workflows: 1000,
  graceful_shutdown_period: 30
)
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning keywords (default unversioned worker).
- `build_id` → **no Ruby form**: `Worker.new` has no legacy Build ID versioning keyword (`worker.rb:463-497`). Offer the user `deployment`.
- `deployment` → `deployment_options:` (`worker/deployment_options.rb:23-27`):

```ruby
deployment_options: Temporalio::Worker::DeploymentOptions.new(
  version: Temporalio::WorkerDeploymentVersion.new(deployment_name:, build_id:), # from env/config
  use_worker_versioning: true,
  default_versioning_behavior: Temporalio::VersioningBehavior::PINNED # or AUTO_UPGRADE
)
```

`WorkerDeploymentVersion` is `worker_deployment_version.rb:6-9`'s; `VersioningBehavior` is `common_enums.rb:112-120`'s.

Choosing the behavior: `temporal-developer` `references/ruby/versioning.md` § Worker Versioning.
