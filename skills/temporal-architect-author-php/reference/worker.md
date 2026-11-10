# worker

```twf
@sdk(php, "Workers.php")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```php
// Workers.php
namespace App\Orders;

use Temporal\Worker\WorkerFactoryInterface;

/** Each .twf worker's registrations, shared by the worker process. */
final class Workers
{
    public const ORDERS_TASK_QUEUE = 'orders';

    public static function registerOrderTypes(WorkerFactoryInterface $factory, Validator $validator): void
    {
        $factory->newWorker(self::ORDERS_TASK_QUEUE)
            ->registerWorkflowTypes(ProcessOrder::class)
            ->registerActivity(OrderActivities::class, fn () => new OrderActivities($validator));
    }
}
```

```php
// worker.php, the file .rr.yaml's server.command runs
use Temporal\Worker\FeatureFlags;
use Temporal\WorkerFactory;

require __DIR__ . '/vendor/autoload.php';

FeatureFlags::$cancelAbandonedChildWorkflows = false; // only with a detach workflow (detach.md)

$factory = WorkerFactory::create();
App\Orders\Workers::registerOrderTypes($factory, new HttpValidator());
$factory->run();
```

```yaml
# .rr.yaml
version: "3"
server:
  command: "php worker.php"
temporal:
  address: "localhost:7233"
  namespace: "default"
```

## Registration

- Each `.twf` worker has a static `registerXxxTypes(WorkerFactoryInterface $factory, …)` on the `Workers` class, named for the worker (`registerOrderTypes`), which calls `$factory->newWorker($taskQueue, $options)` (`Worker/WorkerFactoryInterface.php:41-47`) and registers its workflows and activities. The `.twf` worker's `@sdk(php, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `registerWorkflowTypes(A::class, …)` registers workflow classes; `registerActivity(Class::class, $factory)` one activity class, built by the factory with real dependencies ([activity-def.md](./activity-def.md)); `registerActivityImplementations($instance)` an already-built one (`Worker/WorkerInterface.php:36-74`). Registration is per type, so several `.twf` workers' types may share one project and one process.
- `worker.php` builds the dependencies, calls each `registerXxxTypes`, then `$factory->run()` (`WorkerFactory.php:257`). RoadRunner starts it: `rr serve` runs `server.command`, and never `php worker.php` by hand (`temporal-developer` [`gotchas.md` § Running the Worker Without RoadRunner](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#running-the-worker-without-roadrunner)).
- The task queue is the namespace worker's `task_queue` option. The address and namespace are `.rr.yaml`'s `temporal.address` and `temporal.namespace` (default `"default"`; roadrunner-temporal `config.go`), one for the whole RoadRunner process, so `.twf` workers in different namespaces run under different `rr serve`s. Several DSL `worker` blocks in one namespace → several `newWorker` calls, run together.
- Setup and file layout: `temporal-developer` [`php.md` § Worker Setup](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/php.md#worker-setup).

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** A worker that registers a `nexus service` is unsupported in PHP ([nexus-service-def.md](./nexus-service-def.md)).

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a PHP worker polls its task queue in its process's namespace only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's schedule-to-start timeout (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```php
// One queue function per family, shared by the instance process and every caller.
public static function sandboxQueue(string $sandboxId): string
{
    return "sandbox-{$sandboxId}";
}

// In the sidecar's worker.php, one rr serve per instance:
$sandboxId = (string) getenv('SANDBOX_ID');
$factory->newWorker(
    Workers::sandboxQueue($sandboxId),
    WorkerOptions::new()
        ->withIdentity("sidecar-{$sandboxId}")
        ->withMaxConcurrentActivityTaskPollers(2),
)->registerActivity(SandboxActivities::class);

// In Agent:
try {
    return yield Workflow::newActivityStub(
        SandboxActivities::class,
        ActivityOptions::new()
            ->withTaskQueue(Workers::sandboxQueue($lease->sandboxId))
            ->withScheduleToStartTimeout(30)
            ->withStartToCloseTimeout(300),
    )->runTool($task->call);
} catch (ActivityFailure $e) {
    $timeout = $e->getPrevious();
    if ($timeout instanceof TimeoutFailure && $timeout->getTimeoutType() === TimeoutType::TIMEOUT_TYPE_SCHEDULE_TO_START) {
        // The instance is gone: reroute, or rerun the sequence.
    }
    throw $e;
}
```

- **The instance process starts its own worker,** one `rr serve` per instance, its key from the environment. The family's workflows stay on a shared-queue worker.
- **Set `withMaxConcurrentActivityTaskPollers` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **`withIdentity` defaults to the client's identity** (`Worker/WorkerOptions.php:226-231`); set it with the instance key.
- **The call site's options set the task queue, schedule-to-start and start-to-close timeouts.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutFailure` as the previous exception of an `ActivityFailure`, its type `Temporal\Api\Enums\V1\TimeoutType`'s (`Exception/Failure/FailureConverter.php:180-182`, `Exception/Failure/TimeoutFailure.php:39`).

## Worker options → `WorkerOptions`

The namespace worker's `options:` block maps onto `WorkerOptions::new()` (`Worker/WorkerOptions.php:344-901`), the second argument of `newWorker`, except where RoadRunner owns the setting:

| TWF worker option | `WorkerOptions` / `.rr.yaml` |
|-------------------|------------------------------|
| `task_queue` | `newWorker`'s first argument |
| `max_concurrent_activity_executions` | `withMaxConcurrentActivityExecutionSize` (renamed) |
| `max_concurrent_workflow_task_executions` | `withMaxConcurrentWorkflowTaskExecutionSize` (renamed) |
| `max_concurrent_local_activity_executions` | `withMaxConcurrentLocalActivityExecutionSize` (renamed) |
| `max_concurrent_nexus_task_executions` | **unsupported**: `withMaxConcurrentNexusTaskExecutionSize` is inert, since a worker registers only workflows and activities (`Worker/WorkerInterface.php:36-74`) |
| `max_concurrent_workflow_task_pollers` | `withMaxConcurrentWorkflowTaskPollers` |
| `max_concurrent_activity_task_pollers` | `withMaxConcurrentActivityTaskPollers` |
| `max_concurrent_nexus_task_pollers` | **unsupported**: `withMaxConcurrentNexusTaskPollers` is inert likewise |
| `worker_activity_rate_limit` | `withWorkerActivitiesPerSecond` (renamed) |
| `task_queue_activity_rate_limit` | `withTaskQueueActivitiesPerSecond` (renamed) |
| `max_cached_workflows` | no field: `.rr.yaml` `temporal.cache_size` (default 10000; roadrunner-temporal `config.go`), one value for the whole RoadRunner process, not per `.twf` worker |
| `sticky_schedule_to_start_timeout` | `withStickyScheduleToStartTimeout` |
| `max_heartbeat_throttle_interval` | `withMaxHeartbeatThrottleInterval` |
| `worker_identity` | `withIdentity` (renamed) |
| `worker_shutdown_timeout` | `withWorkerStopTimeout` (renamed) |
| `local_activity_only_mode: true` | `withLocalActivityWorkerOnly()` (renamed, not inverted) |
| `versioning` | not 1:1 — see below |

Activity concurrency is also bounded by `.rr.yaml`'s `temporal.activities.num_workers`, the PHP processes that run activities for every task queue: `temporal-developer` [`advanced-features.md` § Worker Tuning](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/advanced-features.md#worker-tuning).

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			worker_shutdown_timeout: 30s
```

```php
$factory->newWorker(
    self::ORDERS_TASK_QUEUE,
    WorkerOptions::new()
        ->withMaxConcurrentActivityExecutionSize(50)
        ->withWorkerStopTimeout(30),
)
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning fields (default unversioned worker).
- `build_id` → **legacy** path: `withBuildID($buildId)` (from env/config) and `withUseBuildIDForVersioning()`, both `@deprecated` (`Worker/WorkerOptions.php:868,884`).
- `deployment` → **current** path (`Worker/WorkerDeploymentOptions.php:40-72`):

```php
->withDeploymentOptions(
    WorkerDeploymentOptions::new()
        ->withUseVersioning(true)
        ->withVersion(WorkerDeploymentVersion::new($deploymentName, $buildId)) // from env/config
        ->withDefaultVersioningBehavior(VersioningBehavior::Pinned), // or AutoUpgrade
)
```

`VersioningBehavior` and `WorkerDeploymentVersion` are in `Temporal\Common\Versioning` (`Common/Versioning/VersioningBehavior.php:20`, `Common/Versioning/WorkerDeploymentVersion.php:48`).

Choosing the behavior: `temporal-developer` [`versioning.md` § Worker Versioning](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/versioning.md#worker-versioning).
