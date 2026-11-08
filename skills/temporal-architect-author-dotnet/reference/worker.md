# worker

```twf
@sdk(dotnet, "Worker.cs")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```csharp
// Worker.cs
using Temporalio.Client;
using Temporalio.Worker;

public static class Workers
{
    /// <summary>The orderTypes worker's registrations, shared by the worker process and the tests.</summary>
    public static TemporalWorkerOptions AddOrderTypes(this TemporalWorkerOptions options, OrderActivities activities) =>
        options
            .AddWorkflow<ProcessOrder>()
            .AddAllActivities(activities);

    public static async Task RunAsync(OrderActivities activities, CancellationToken stoppingToken)
    {
        var client = await TemporalClient.ConnectAsync(new("localhost:7233") { Namespace = "default" });
        using var worker = new TemporalWorker(client, new TemporalWorkerOptions("orders").AddOrderTypes(activities));
        await worker.ExecuteAsync(stoppingToken);
    }
}
```

## Registration

- Each `.twf` worker has a registrations extension method on `TemporalWorkerOptions` named for the worker (`AddOrderTypes`), adding its workflows, activities and Nexus services and returning the options (`Worker/TemporalWorkerOptions.cs:414-503`). The `.twf` worker's `@sdk(dotnet, "<path>")` names that method's file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `AddWorkflow<T>()` registers one workflow type; `AddActivity(Activities.Compose)` one static activity; `AddAllActivities(instance)` every `[Activity]` method of an instance's class, built with real dependencies ([activity-def.md](./activity-def.md)). Registration is per type, so several `.twf` workers' types may share one project.
- `new TemporalWorker(client, new TemporalWorkerOptions(taskQueue).AddXxxTypes(...))` (`Worker/TemporalWorker.cs:38`, `Worker/TemporalWorkerOptions.cs:42`) — the task queue is the namespace worker's `task_queue` option; the namespace is the client's (`TemporalClientConnectOptions.Namespace`). Several DSL `worker` blocks → several `TemporalWorker`s, each from its own method, run together.
- Connecting, running and shutting down: `temporal-developer` `references/dotnet/dotnet.md` § Worker Setup.

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** The handler worker's method calls `AddNexusService(new ServiceHandler())` and adds the backing workflows, per [nexus-service-def.md](./nexus-service-def.md). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

**Hosting.** A generic-host app runs the same set as a hosted service: `services.AddHostedTemporalWorker("localhost:7233", "default", "orders").ConfigureOptions(options => options.AddOrderTypes(activities))` (`Temporalio.Extensions.Hosting`, `TemporalHostingServiceCollectionExtensions.cs:107`; its options class derives from `TemporalWorkerOptions`, `TemporalWorkerServiceOptions.cs:10`). To build activities from DI instead, register them with the builder's `AddScopedActivities<T>()` / `AddSingletonActivities<T>()` beside the method (`TemporalWorkerServiceOptionsBuilderExtensions.cs:25,86`); the `@sdk` path still names the registrations method's file.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `TemporalWorker` polls its `TaskQueue` in its client's namespace only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `ScheduleToStartTimeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```csharp
// One queue function per family, shared by the instance process and every caller.
public static string SandboxQueue(string sandboxId) => $"sandbox-{sandboxId}";

// In the sidecar process, one per instance:
using var worker = new TemporalWorker(
    client,
    new TemporalWorkerOptions(SandboxQueue(sandboxId))
    {
        Identity = $"sidecar-{sandboxId}",
        MaxConcurrentActivityTaskPolls = 2,
    }.AddSidecar(activities));

// In Agent:
try
{
    return await Workflow.ExecuteActivityAsync(
        (SandboxActivities a) => a.RunToolAsync(task.Call),
        new()
        {
            TaskQueue = SandboxQueue(lease.SandboxId),
            ScheduleToStartTimeout = TimeSpan.FromSeconds(30),
            StartToCloseTimeout = TimeSpan.FromMinutes(5),
        });
}
catch (ActivityFailureException e) when (
    e.InnerException is TimeoutFailureException { TimeoutType: TimeoutType.ScheduleToStart })
{
    // The instance is gone: reroute, or rerun the sequence.
    throw;
}
```

- **The instance process starts its own worker,** one `TemporalWorker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `MaxConcurrentActivityTaskPolls` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **`Identity` defaults to the client's, `pid@hostname`** (`Worker/TemporalWorkerOptions.cs:145-148`, `Client/TemporalConnectionOptions.cs:130-136`), so it is unique per member only when each member is its own process. A process running several members sets `Identity` with the instance key.
- **The call site's options set `TaskQueue`, `ScheduleToStartTimeout` and `StartToCloseTimeout`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutFailureException` as the `InnerException` of an `ActivityFailureException` (`Exceptions/TimeoutFailureException.cs:38`; `TimeoutType` is `Temporalio.Api.Enums.V1`'s).

## Worker options → `TemporalWorkerOptions`

The namespace worker's `options:` block maps onto `TemporalWorkerOptions` (`Worker/TemporalWorkerOptions.cs:85-252`):

| TWF worker option | `TemporalWorkerOptions` field |
|-------------------|-------------------------------|
| `task_queue` | `TaskQueue` (the constructor argument) |
| `max_concurrent_activity_executions` | `MaxConcurrentActivities` (renamed) |
| `max_concurrent_workflow_task_executions` | `MaxConcurrentWorkflowTasks` (renamed) |
| `max_concurrent_local_activity_executions` | `MaxConcurrentLocalActivities` (renamed) |
| `max_concurrent_nexus_task_executions` | `MaxConcurrentNexusTasks` (renamed) |
| `max_concurrent_workflow_task_pollers` | `MaxConcurrentWorkflowTaskPolls` |
| `max_concurrent_activity_task_pollers` | `MaxConcurrentActivityTaskPolls` |
| `max_concurrent_nexus_task_pollers` | `MaxConcurrentNexusTaskPolls` |
| `worker_activity_rate_limit` | `MaxActivitiesPerSecond` |
| `task_queue_activity_rate_limit` | `MaxTaskQueueActivitiesPerSecond` |
| `max_cached_workflows` | `MaxCachedWorkflows` |
| `sticky_schedule_to_start_timeout` | `StickyQueueScheduleToStartTimeout` |
| `max_heartbeat_throttle_interval` | `MaxHeartbeatThrottleInterval` |
| `worker_identity` | `Identity` |
| `worker_shutdown_timeout` | `GracefulShutdownTimeout` (renamed) |
| `local_activity_only_mode: true` | `LocalActivityWorkerOnly = true` (not inverted) |
| `versioning` | not 1:1 — see below |

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			worker_shutdown_timeout: 30s
```

```csharp
using var worker = new TemporalWorker(
    client,
    new TemporalWorkerOptions("orders")
    {
        MaxConcurrentActivities = 50,
        GracefulShutdownTimeout = TimeSpan.FromSeconds(30),
    }.AddOrderTypes(activities));
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning fields (default unversioned worker).
- `build_id` → **legacy** path: `BuildId` (from env/config) and `UseWorkerVersioning = true`, both `[Obsolete]` in favor of `DeploymentOptions` (`Worker/TemporalWorkerOptions.cs:127-137`).
- `deployment` → **current** path (`Worker/WorkerDeploymentOptions.cs:34-44`):

```csharp
DeploymentOptions = new(new WorkerDeploymentVersion(deploymentName, buildId), useWorkerVersioning: true) // from env/config
{
    DefaultVersioningBehavior = VersioningBehavior.Pinned, // or AutoUpgrade
},
```

`VersioningBehavior` is `Temporalio.Common`'s (`Common/VersioningBehavior.cs:6`); `Temporalio.Api.Enums.V1` declares one too, so a file using both namespaces qualifies it.

Choosing the behavior: `temporal-developer` `references/dotnet/versioning.md` § Worker Versioning.
