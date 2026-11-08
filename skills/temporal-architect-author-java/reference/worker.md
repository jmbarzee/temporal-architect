# worker

```twf
@sdk(java, "Workers.java")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```java
// Workers.java
/** Each .twf worker's registrations, shared by the worker process and the tests. */
public final class Workers {
  public static final String ORDERS_TASK_QUEUE = "orders";

  private Workers() {}

  public static void registerOrderTypes(Worker worker, OrderActivities activities) {
    worker.registerWorkflowImplementationTypes(ProcessOrderImpl.class);
    worker.registerActivitiesImplementations(activities);
  }

  public static void main(String[] args) {
    WorkflowClient client =
        WorkflowClient.newInstance(
            WorkflowServiceStubs.newLocalServiceStubs(),
            WorkflowClientOptions.newBuilder().setNamespace("default").build());
    WorkerFactory factory = WorkerFactory.newInstance(client);
    registerOrderTypes(factory.newWorker(ORDERS_TASK_QUEUE), new OrderActivitiesImpl(/* dependencies */));
    factory.start();
  }
}
```

## Registration

- Each `.twf` worker has a static registrations method in `Workers.java` named for the worker (`registerOrderTypes`), registering its workflows, activities and Nexus services on a `Worker` (`worker/Worker.java:280,478,497`). The `.twf` worker's `@sdk(java, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `registerWorkflowImplementationTypes(Impl.class, …)` registers workflow impl classes; `registerActivitiesImplementations(instance, …)` every activity of an instance's interfaces, built with real dependencies ([activity-def.md](./activity-def.md)). Registration is per class, so several `.twf` workers' types may share one Java package. An overload taking the activities, as the corpus's `registerGreeterTypes(Worker, GreeterActivities)`, lets a test pass its own.
- `WorkerFactory.newInstance(client)` then `factory.newWorker(taskQueue, options?)` (`worker/WorkerFactory.java:77,169`) — the task queue is the namespace worker's `task_queue` option; the namespace is the client's (`WorkflowClientOptions.Builder.setNamespace`, `client/WorkflowClientOptions.java:79`). Several DSL `worker` blocks → several `Worker`s from one factory, each from its own method; `factory.start()` (`:254`) starts them all.
- Connecting, running and shutting down: `temporal-developer` `references/java/java.md` § Worker Setup.

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** The handler worker's method calls `registerNexusServiceImplementation(new ServiceImpl())` and registers the backing workflows, per [nexus-service-def.md](./nexus-service-def.md). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

**Spring Boot.** `temporal-spring-boot-starter` builds the client, factory and workers from configuration: `temporal-developer` `references/java/integrations/spring-boot.md`. The `@sdk` path still names the file that lists the worker's types.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `Worker` polls its task queue in its factory's client's namespace only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `setScheduleToStartTimeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```java
// One queue method per family, shared by the instance process and every caller.
public static String sandboxQueue(String sandboxId) {
  return "sandbox-" + sandboxId;
}

// In the sidecar process, one per instance:
registerSidecar(
    factory.newWorker(
        sandboxQueue(sandboxId),
        WorkerOptions.newBuilder()
            .setIdentity("sidecar-" + sandboxId)
            .setMaxConcurrentActivityTaskPollers(2)
            .build()),
    activities);

// In AgentImpl:
SandboxActivities sandbox =
    Workflow.newActivityStub(
        SandboxActivities.class,
        ActivityOptions.newBuilder()
            .setTaskQueue(sandboxQueue(lease.sandboxId()))
            .setScheduleToStartTimeout(Duration.ofSeconds(30))
            .setStartToCloseTimeout(Duration.ofMinutes(5))
            .build());
try {
  return sandbox.runTool(task.call());
} catch (ActivityFailure e) {
  if (e.getCause() instanceof TimeoutFailure t
      && t.getTimeoutType() == TimeoutType.TIMEOUT_TYPE_SCHEDULE_TO_START) {
    // The instance is gone: reroute, or rerun the sequence.
  }
  throw e;
}
```

- **The instance process starts its own worker,** one `Worker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `setMaxConcurrentActivityTaskPollers` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **Identity defaults to the client's, `pid@hostname`** (`client/WorkflowClientOptions.java:232`), so it is unique per member only when each member is its own process. A process running several members sets `setIdentity` with the instance key.
- **The stub's options set `setTaskQueue`, `setScheduleToStartTimeout` and `setStartToCloseTimeout`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutFailure` cause of an `ActivityFailure` (`failure/TimeoutFailure.java:29`; `TimeoutType` is `io.temporal.api.enums.v1`'s).

## Worker options

The namespace worker's `options:` block maps onto `WorkerOptions.Builder` (`worker/WorkerOptions.java:145-537`), except two keys that sit elsewhere:

| TWF worker option | Java |
|-------------------|------|
| `task_queue` | `factory.newWorker(taskQueue, options)`'s first argument |
| `worker_activity_rate_limit` | `setMaxWorkerActivitiesPerSecond` (renamed) |
| `task_queue_activity_rate_limit` | `setMaxTaskQueueActivitiesPerSecond` (renamed) |
| `max_concurrent_activity_executions` | `setMaxConcurrentActivityExecutionSize` (renamed) |
| `max_concurrent_workflow_task_executions` | `setMaxConcurrentWorkflowTaskExecutionSize` (renamed) |
| `max_concurrent_local_activity_executions` | `setMaxConcurrentLocalActivityExecutionSize` (renamed) |
| `max_concurrent_nexus_task_executions` | `setMaxConcurrentNexusExecutionSize` (renamed; `@Experimental`, `:212`) |
| `max_concurrent_workflow_task_pollers` | `setMaxConcurrentWorkflowTaskPollers` |
| `max_concurrent_activity_task_pollers` | `setMaxConcurrentActivityTaskPollers` |
| `max_concurrent_nexus_task_pollers` | `setMaxConcurrentNexusTaskPollers` (`@Experimental`, `:268`) |
| `max_cached_workflows` | **not a worker option**: `WorkerFactoryOptions.Builder.setWorkflowCacheSize`, one cache shared by every worker of the factory (`worker/WorkerFactoryOptions.java:65-73`), passed to `WorkerFactory.newInstance(client, factoryOptions)` |
| `sticky_schedule_to_start_timeout` | `setStickyQueueScheduleToStartTimeout` (renamed) |
| `max_heartbeat_throttle_interval` | `setMaxHeartbeatThrottleInterval` |
| `worker_identity` | `setIdentity` (renamed) |
| `worker_shutdown_timeout` | **not an option**: a call, `factory.shutdown()` then `factory.awaitTermination(timeout, unit)` (`worker/WorkerFactory.java:406,513`) |
| `local_activity_only_mode: true` | `setLocalActivityWorkerOnly(true)` (renamed, not inverted, `:326`) |
| `versioning` | not 1:1 — see below |

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			max_cached_workflows: 1000
			worker_shutdown_timeout: 30s
```

```java
WorkerFactory factory =
    WorkerFactory.newInstance(client, WorkerFactoryOptions.newBuilder().setWorkflowCacheSize(1000).build());
registerOrderTypes(
    factory.newWorker(
        ORDERS_TASK_QUEUE, WorkerOptions.newBuilder().setMaxConcurrentActivityExecutionSize(50).build()),
    activities);
factory.start();

// On shutdown:
factory.shutdown();
factory.awaitTermination(30, TimeUnit.SECONDS);
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning fields (default unversioned worker).
- `build_id` → **legacy** path: `setBuildId` (from env/config) and `setUseBuildIdForVersioning(true)`, both `@Experimental @Deprecated` (`worker/WorkerOptions.java:430-448`).
- `deployment` → **current** path, `setDeploymentOptions` (`worker/WorkerOptions.java:537`, `worker/WorkerDeploymentOptions.java:36-55`):

```java
.setDeploymentOptions(
    WorkerDeploymentOptions.newBuilder()
        .setUseVersioning(true)
        .setVersion(new WorkerDeploymentVersion(deploymentName, buildId)) // from env/config
        .setDefaultVersioningBehavior(VersioningBehavior.PINNED) // or AUTO_UPGRADE
        .build())
```

`VersioningBehavior` is `io.temporal.common`'s (`common/VersioningBehavior.java:6`).

Choosing the behavior: `temporal-developer` `references/java/versioning.md` § Worker Versioning.
