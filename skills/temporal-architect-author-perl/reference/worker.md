# worker

```twf
@sdk(perl, "OrderTypes.pm")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```perl
# OrderTypes.pm: the orderTypes worker, shared by the worker process and the tests.
package OrderTypes;
use v5.38;
use Temporalio::Worker;
use ProcessOrder;
use OrderActivities;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client     => $client,
        task_queue => 'orders',
        workflows  => ['ProcessOrder'],
        activities => ['OrderActivities'],
        %opts,
    );
}

1;
```

```perl
# order-worker.pl: the process
use v5.38;
use IO::Async::Loop;
use Temporalio::Runtime;
use Temporalio::Client;
use OrderTypes;

my $loop   = IO::Async::Loop->new;
my $client = $loop->await(Temporalio::Client->connect('localhost:7233',
    namespace => 'default', runtime => Temporalio::Runtime->new(loop => $loop)))->get;
my $worker = OrderTypes::worker($client);
$loop->watch_signal(INT => sub { $worker->shutdown });
$loop->await($worker->run)->get;
```

## Registration

- Each `.twf` worker has a `<Worker>Types.pm` module (`OrderTypes.pm`) whose `sub worker` returns the `Temporalio::Worker` with its workflows, activities and Nexus services; the trailing `%opts` let a caller add or override worker options. The `.twf` worker's `@sdk(perl, "<path>")` names that module, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `workflows`, `activities` and `nexus_services` take class names (`Worker.pm:38-40`); the module must be `use`d first. An activities class with dependencies is registered as a built instance instead ([activity-def.md](./activity-def.md)), which the process builds and `worker` takes after `$client`: `sub worker ($client, $activities, %opts)` with `activities => [$activities]`. Registration is per class, so several `.twf` workers' classes may share one project.
- `task_queue` is the namespace worker's `task_queue` option; the namespace is the client's (`Temporalio::Client->connect(..., namespace =>)`). Several DSL `worker` blocks → several `Temporalio::Worker`s, each from its own `worker` sub, run together on one loop.
- Connecting, running and shutting down: sdk-perl `README.md` § Running a Worker (`:120-152`) and § Workers (`:440-478`).

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** The handler worker's `worker` sub lists `nexus_services => ['ServiceClass']` and the backing workflows, per [nexus-service-def.md](./nexus-service-def.md). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `Temporalio::Worker` polls its `task_queue` in its client's namespace only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `schedule_to_start_timeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```perl
# SidecarTypes.pm: one queue sub per family, shared by the instance process and every caller.
sub queue ($sandbox_id) { return "sandbox-$sandbox_id" }

sub worker ($client, $sandbox_id, $activities, %opts) {
    return Temporalio::Worker->new(
        client                        => $client,
        task_queue                    => queue($sandbox_id),
        identity_override             => "sidecar-$sandbox_id",
        activity_task_poller_behavior => Temporalio::Worker::PollerBehavior::SimpleMaximum->new(maximum => 2),
        activities                    => [$activities],
        %opts,
    );
}

# In Agent:
my $output = eval {
    await Temporalio::Workflow::execute_activity('RunTool',
        args                      => [$task->{call}],
        task_queue                => SidecarTypes::queue($lease->{sandboxId}),
        schedule_to_start_timeout => 30,
        start_to_close_timeout    => 300);
};
if (my $e = $@) {
    # The instance is gone: reroute, or rerun the sequence.
    die $e unless $e isa Temporalio::Exception::Activity
        && $e->cause isa Temporalio::Exception::Timeout
        && $e->cause->timeout_type eq 'schedule_to_start';
    ...
}
```

- **The instance process starts its own worker,** one `Temporalio::Worker` per instance. The family's workflows stay on a shared-queue worker.
- **Set the activity poller maximum small and explicit.** Every member's pollers count against the namespace's poller limit.
- **`identity_override` defaults to the client's identity** (`Worker.pm:290-293`), so it is unique per member only when each member is its own process. A process running several members sets `identity_override` with the instance key.
- **The call site's options set `task_queue`, `schedule_to_start_timeout` and `start_to_close_timeout`.** A schedule-to-start timeout is not retried; it arrives as a `Temporalio::Exception::Activity` whose `cause` is a `Temporalio::Exception::Timeout` with `timeout_type` `schedule_to_start` (`Exception/Timeout.pm:10-14`).

## Worker options → `Temporalio::Worker->new`

The namespace worker's `options:` block maps onto `Temporalio::Worker->new` keys (`Worker.pm:36-131`; POD § new, `:1249-1449`). Durations are seconds.

| TWF worker option | `Temporalio::Worker->new` key |
|-------------------|-------------------------------|
| `task_queue` | `task_queue` |
| `max_concurrent_activity_executions` | `max_concurrent_activities` (renamed) |
| `max_concurrent_workflow_task_executions` | `max_concurrent_workflow_tasks` (renamed) |
| `max_concurrent_local_activity_executions` | `max_concurrent_local_activities` (renamed) |
| `max_concurrent_nexus_task_executions` | `max_concurrent_nexus_tasks` (renamed) |
| `max_concurrent_workflow_task_pollers` | `workflow_task_poller_behavior => Temporalio::Worker::PollerBehavior::SimpleMaximum->new(maximum => n)` (renamed; the deprecated `max_concurrent_workflow_task_polls => n` overrides it, `Worker.pm:68-81`) |
| `max_concurrent_activity_task_pollers` | `activity_task_poller_behavior => …SimpleMaximum->new(maximum => n)` (renamed; deprecated `max_concurrent_activity_task_polls`) |
| `max_concurrent_nexus_task_pollers` | `nexus_task_poller_behavior => …SimpleMaximum->new(maximum => n)` (renamed; no count key) |
| `worker_activity_rate_limit` | `max_activities_per_second` (renamed) |
| `task_queue_activity_rate_limit` | `max_task_queue_activities_per_second` (renamed) |
| `max_cached_workflows` | `max_cached_workflows` |
| `sticky_schedule_to_start_timeout` | `sticky_queue_schedule_to_start_timeout` (renamed) |
| `max_heartbeat_throttle_interval` | `max_heartbeat_throttle_interval` |
| `worker_identity` | `identity_override` (renamed) |
| `worker_shutdown_timeout` | `graceful_shutdown_period` (renamed; default `0`) |
| `local_activity_only_mode: true` | `no_remote_activities => 1` (renamed, not inverted, `Worker.pm:99-108`) |
| `versioning` | not 1:1 — see below |

The activity call's `request_eager_execution: false` also lands here, as `disable_eager_activity_execution => 1` ([options.md](./options.md#activity-options)).

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			worker_shutdown_timeout: 30s
```

```perl
my $worker = OrderTypes::worker($client,
    max_concurrent_activities => 50,
    graceful_shutdown_period  => 30,
);
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning keys (default unversioned worker).
- `build_id` → **legacy** path: `build_id` (from env/config) and `use_worker_versioning => 1`, deprecated in favor of `deployment_options` (`Worker.pm:50-57`).
- `deployment` → **current** path, mutually exclusive with `build_id` (`Worker.pm:170-185`, `Worker/DeploymentOptions.pm:11-14`, `Worker/DeploymentVersion.pm:11-13`):

```perl
deployment_options => Temporalio::Worker::DeploymentOptions->new(
    version => Temporalio::Worker::DeploymentVersion->new(
        deployment_name => $ENV{DEPLOYMENT_NAME}, build_id => $ENV{BUILD_ID}),
    use_worker_versioning       => 1,
    default_versioning_behavior => 'pinned',    # or 'auto_upgrade'
),
```

A workflow sets its own behavior with a `:VersioningBehavior('pinned')` (or `'auto_upgrade'`) attribute, conventionally beside `:Run` — `async method run :Run :VersioningBehavior('pinned') ($input)` (`Workflow/Definition.pm:113-136`). Worker versioning is not in sdk-perl's README; the `Worker.pm` POD (`deployment_options`, `:1300`) is its documentation.
