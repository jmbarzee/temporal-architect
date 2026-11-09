# worker

```twf
@sdk(swift, "Sources/Orders/Worker.swift")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```swift
// Sources/Orders/Worker.swift
import Temporal

/// The `.twf` worker orderTypes: its types and configuration, shared by the worker process and the tests.
enum OrderTypes {
    static let taskQueue = "orders"
    static let workflows: [any WorkflowDefinition.Type] = [ProcessOrder.self]

    static func activities(_ container: OrderActivities) -> [any ActivityDefinition] {
        container.allActivities
    }

    static func configuration(namespace: String = "default", serverHostname: String) -> TemporalWorker.Configuration {
        TemporalWorker.Configuration(
            namespace: namespace, taskQueue: taskQueue, instrumentation: .init(serverHostname: serverHostname))
    }
}

// The worker process:
let worker = try TemporalWorker(
    configuration: OrderTypes.configuration(serverHostname: "localhost"),
    target: .ipv4(address: "127.0.0.1", port: 7233),
    transportSecurity: .plaintext,
    activities: OrderTypes.activities(OrderActivities(/* dependencies */)),
    workflows: OrderTypes.workflows
)
try await worker.run()
```

## Registration

- Each `.twf` worker is an `enum` named for the worker in `Worker.swift`, holding its `workflows`, its `activities(…)` built from a container instance, and its `configuration(…)`. The `.twf` worker's `@sdk(swift, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `TemporalWorker(configuration:target:transportSecurity:activityContainers:activities:workflows:)` (`Temporal/Worker/TemporalWorker+HTTP2Posix.swift:37-44`) registers the `workflows:` types and every activity in `activities:` or of each container in `activityContainers:`. Taking `activities(…)` as a function lets a test pass a container with fakes.
- **One task queue per `TemporalWorker`**: the configuration's `taskQueue`, in its `namespace` (`Temporal/Worker/TemporalWorker+Configuration.swift:267,273`). Several DSL `worker` blocks → several `TemporalWorker`s, each from its own `enum`, run side by side in one task group.
- `run()` polls until its task is cancelled, which starts the worker's shutdown (`Temporal/Worker/TemporalWorker.swift:147,416-418`). Connecting, running beside a client, and shutting down: DocC [`GettingStarted.md` § Start a worker and client](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/GettingStarted.md#start-a-worker-and-client), [`Connecting-to-Temporal.md`](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Connecting-to-Temporal.md).

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus is unsupported.** A worker that registers a `nexus service` cannot be a Swift worker: the SDK's worker never polls Nexus tasks ([nexus-service-def.md](./nexus-service-def.md)).

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `scheduleToStartTimeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```swift
// On Sidecar: one queue function per family, shared by the instance process and every caller.
static func taskQueue(sandboxId: String) -> String {
    "sandbox-\(sandboxId)"
}

// In the sidecar process, one per instance:
var configuration = TemporalWorker.Configuration(
    namespace: "aivearium", taskQueue: Sidecar.taskQueue(sandboxId: sandboxId),
    instrumentation: .init(serverHostname: host))
configuration.identityOverride = "sidecar-\(sandboxId)"
configuration.activityTaskPollerBehavior = .simpleMaximum(maximum: 2)

// In Agent:
var options = ActivityOptions(
    startToCloseTimeout: .seconds(300), taskQueue: Sidecar.taskQueue(sandboxId: input.lease.sandboxId))
options.scheduleToStartTimeout = .seconds(30)
do {
    return try await context.executeActivity(
        SandboxActivities.Activities.RunTool.self, options: options, input: input.task.call)
} catch let error as ActivityError {
    if let timeout = error.cause as? TimeoutError, timeout.type == .scheduleToStart {
        // The instance is gone: reroute, or rerun the sequence.
    }
    throw error
}
```

- **The instance process starts its own worker,** one `TemporalWorker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `activityTaskPollerBehavior` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **Identity defaults to one per configuration**, `swift-temporal-<version>-` plus five random characters (`Temporal/Worker/TemporalWorker+Configuration.swift:405-407`), so members differ but nothing names the instance. Set `identityOverride` with the instance key.
- **The call's options set `taskQueue`, `scheduleToStartTimeout` and `startToCloseTimeout`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutError` cause of an `ActivityError` (`Temporal/Errors/Failures/TimeoutError.swift:27`).

## Worker options

The namespace worker's `options:` block maps onto `TemporalWorker.Configuration`'s properties (`Temporal/Worker/TemporalWorker+Configuration.swift:267-375`), set on a `var` after its initializer. The bridge hands them to sdk-core with every duration in whole milliseconds (`Temporal/Bridge/BridgeWorker.swift:132-145`).

| TWF worker option | Swift |
|-------------------|------|
| `task_queue` | `taskQueue`, an initializer argument |
| `worker_activity_rate_limit` | `maxActivitiesPerSecond` (renamed, `:336`) |
| `task_queue_activity_rate_limit` | `maxTaskQueueActivitiesPerSecond` (renamed, `:341`) |
| `max_concurrent_activity_executions` | `tuner.activitySlotSupplier = .fixedSize(.init(maximumSlots: n))`: a slot supplier, not an int (`Temporal/Worker/Tuning/WorkerTuner.swift:60`, `SlotSupplier.swift:38`) |
| `max_concurrent_workflow_task_executions` | `tuner.workflowSlotSupplier`, likewise (`WorkerTuner.swift:57`) |
| `max_concurrent_local_activity_executions` | `tuner.localActivitySlotSupplier`, likewise (`WorkerTuner.swift:63`) |
| `max_concurrent_nexus_task_executions` | **unsupported**: no Nexus |
| `max_concurrent_workflow_task_pollers` | `workflowTaskPollerBehavior = .simpleMaximum(maximum: n)` (`:318`) |
| `max_concurrent_activity_task_pollers` | `activityTaskPollerBehavior = .simpleMaximum(maximum: n)` (`:334`), **never `maxConcurrentActivityTaskPolls`** (`:346`), which the bridge never reads (`Temporal/Bridge/BridgeWorker.swift:132-145`) |
| `max_concurrent_nexus_task_pollers` | **unsupported**: `nexusTaskPollerBehavior` (`:373`) is inert while the worker never polls Nexus |
| `max_cached_workflows` | `maxCachedWorkflows`, per worker (`:320`) |
| `sticky_schedule_to_start_timeout` | `stickyQueueScheduleToStartTimeout` (renamed, `:324`) |
| `max_heartbeat_throttle_interval` | `maxHeartbeatThrottleInterval` (`:360`) |
| `worker_identity` | `identityOverride` (renamed, `:287`), never `clientIdentity` (`:282`), which names the client connection |
| `worker_shutdown_timeout` | `gracefulShutdownPeriod` (renamed, `:371`; default `.seconds(0)`) |
| `local_activity_only_mode` | **unsupported**: the worker polls the task types its registrations imply, with no option to restrict them (`Temporal/Bridge/WorkerClient/BridgeWorker+OptionsInit.swift:56-61`) |
| `versioning` | `versioningStrategy`, not 1:1 — see below |

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			max_cached_workflows: 1000
			worker_shutdown_timeout: 30s
```

```swift
var configuration = OrderTypes.configuration(namespace: "orders", serverHostname: host)
configuration.tuner.activitySlotSupplier = .fixedSize(.init(maximumSlots: 50))
configuration.maxCachedWorkflows = 1000
configuration.gracefulShutdownPeriod = .seconds(30)
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code. `versioningStrategy` (`Temporal/Worker/TemporalWorker+Configuration.swift:180-197`) is an initializer argument:

- `none` → the default, `.none(.init())`.
- `build_id` → **legacy** path: `.legacyBuildIdBased(.init(buildId: buildId))`.
- `deployment` → **current** path: `.deploymentBased(.init(deploymentVersion: .init(deploymentName: deploymentName, buildId: buildId), useWorkerVersioning: true, defaultVersioningBehavior: .pinned))`, or `.autoUpgrade`.

Choosing the behavior: [versioning.md](./versioning.md).
