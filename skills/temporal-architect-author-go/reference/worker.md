# worker

```twf
worker orderTypes:
    workflow ProcessOrder
    activity ValidateOrder
    activity ChargePayment

namespace default:
    worker orderTypes
        options:
            task_queue: "orders"
```

```go
import (
    "log"

    "go.temporal.io/sdk/client"
    "go.temporal.io/sdk/worker"
)

func main() {
    c, err := client.Dial(client.Options{})
    if err != nil {
        log.Fatalln("Unable to create client", err)
    }
    defer c.Close()

    w := worker.New(c, "orders", worker.Options{})

    w.RegisterWorkflow(ProcessOrder)
    w.RegisterActivity(&Activities{/* dependencies */})

    err = w.Run(worker.InterruptCh())
    if err != nil {
        log.Fatalln("Unable to start worker", err)
    }
}
```

## Registration

- `worker.New(client, taskQueue, options)` — the task queue is the namespace worker's `task_queue` option. Several DSL `worker` blocks → several `worker.New` calls in one `main()`.
- `RegisterWorkflow(fn)` — one call per workflow in the worker's type set.
- `RegisterActivity(&Activities{...})` — the standard form: every exported method becomes an activity, sharing the dependencies injected on the struct. Register individual functions instead when activities span structs with different dependency sets, or have none.
- `RegisterActivityWithOptions` with `Name` sets a prefix for struct methods, or the name of a single function.
- Registration panics on a duplicate type name (`DisableAlreadyRegisteredCheck: true`, tests only) and on an exported struct method that isn't `(context.Context, ...) (..., error)` (`SkipInvalidStructFunctions: true` skips them).
- Build dependencies at the composition root (`main`, or a per-package `fx.go` in larger apps) — workflows and activity bodies never construct their own.
- `w.Run(worker.InterruptCh())` drains in-flight tasks on SIGINT/SIGTERM; close the client and injected dependencies after `Run` returns.

The nil `*Activities` a workflow uses ([activity-call.md](./activity-call.md)) only names the activity. The worker registers a real, fully built instance of the same type, and that instance is what runs.

**Proto-driven.** Register through the generated `RegisterXxxActivities` / `RegisterXxxWorkflows` helpers ([proto-driven.md](./proto-driven.md)). A missing call is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** Register the service and its handler workflows on the handler worker, per [nexus-service-def.md](./nexus-service-def.md). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

## Coverage

- An **unregistered type fails the task, not the workflow**: the task goes back to the queue for another worker, and latency and waste accumulate silently.
- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `worker.New(client, queue, …)` polls `queue` only in its client's namespace). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there it matches `"sandbox-{lease.sandboxId}"` against the queue's shape and cannot know whether that instance's worker is polling when the task is scheduled. The runtime guard is the call's `ScheduleToStartTimeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`). In reverse, each `worker.New`'s registered set populates a `worker` block.

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

activity RunTool(call: ToolCall) -> (ToolOutput):
    return run(call)

worker control:
    workflow Agent

worker sidecar:
    activity RunTool

namespace aivearium:
    worker control
        options:
            task_queue: "control"
    worker sidecar
        options:
            task_queue: "sandbox-{sandboxId}"
            worker_identity: "sidecar-{sandboxId}"
            max_concurrent_activity_task_pollers: 2
```

```go
// One queue function per family, shared by the instance process and every caller.
func SandboxQueue(sandboxID string) string { return "sandbox-" + sandboxID }

// In the sidecar process, one per instance:
w := worker.New(c, SandboxQueue(sandboxID), worker.Options{
    Identity:                         "sidecar-" + sandboxID,
    MaxConcurrentActivityTaskPollers: 2,
})
w.RegisterActivity(&Activities{/* dependencies */})

// In Agent:
ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
    TaskQueue:              SandboxQueue(lease.SandboxID),
    ScheduleToStartTimeout: 30 * time.Second,
    StartToCloseTimeout:    5 * time.Minute,
})
var output ToolOutput
err := workflow.ExecuteActivity(ctx, a.RunTool, task.Call).Get(ctx, &output)
var timeoutErr *temporal.TimeoutError
if errors.As(err, &timeoutErr) && timeoutErr.TimeoutType() == enumspb.TIMEOUT_TYPE_SCHEDULE_TO_START {
    // The instance is gone: reroute, or rerun the sequence.
}
```

- **The instance process starts its own worker,** one `worker.New` per instance. The family's workflows stay on a shared-queue worker, as `control` does.
- **Set `MaxConcurrentActivityTaskPollers` small and explicit.** Every member's pollers count against the namespace's poller limit, and an autoscaling poller can reach 100 per instance.
- **`Identity` is per process by default** (the client's `pid@hostname@`), so it is unique per member only when each member is its own process. A host running several members sets `Identity` with the instance key.
- **The call site sets `TaskQueue`, `ScheduleToStartTimeout` and `StartToCloseTimeout`** (the SDK requires one of StartToClose/ScheduleToClose). A schedule-to-start timeout is not retried; it arrives as a `*temporal.TimeoutError` wrapped in an `ActivityError`, which `errors.As` unwraps.
- **Sessions** (`EnableSessionWorker`, `workflow.CreateSession`; DSL `enable_sessions`) are the Go-only, SDK-managed, host-keyed variant, for when the caller need not name the instance.

## Worker options → `worker.Options`

The namespace worker's `options:` block carries the SDK-union worker options; map each key onto `worker.Options`:

| TWF worker option | `worker.Options` field | Go type |
|-------------------|------------------------|---------|
| `task_queue` | 2nd arg to `worker.New` (not a field) | string |
| `max_concurrent_activity_executions` | `MaxConcurrentActivityExecutionSize` | int |
| `max_concurrent_workflow_task_executions` | `MaxConcurrentWorkflowTaskExecutionSize` | int |
| `max_concurrent_local_activity_executions` | `MaxConcurrentLocalActivityExecutionSize` | int |
| `max_concurrent_nexus_task_executions` | `MaxConcurrentNexusTaskExecutionSize` | int |
| `max_concurrent_workflow_task_pollers` | `MaxConcurrentWorkflowTaskPollers` | int |
| `max_concurrent_activity_task_pollers` | `MaxConcurrentActivityTaskPollers` | int |
| `max_concurrent_nexus_task_pollers` | `MaxConcurrentNexusTaskPollers` | int |
| `worker_activity_rate_limit` | `WorkerActivitiesPerSecond` | float64 |
| `task_queue_activity_rate_limit` | `TaskQueueActivitiesPerSecond` | float64 |
| `worker_local_activity_rate_limit` | `WorkerLocalActivitiesPerSecond` | float64 |
| `sticky_schedule_to_start_timeout` | `StickyScheduleToStartTimeout` | time.Duration |
| `heartbeat_throttle_interval` | `MaxHeartbeatThrottleInterval` | time.Duration |
| `worker_identity` | `Identity` | string |
| `worker_shutdown_timeout` | `WorkerStopTimeout` | time.Duration |
| `local_activity_only_mode` | `LocalActivityWorkerOnly` | bool |
| `enable_sessions` | `EnableSessionWorker` | bool |
| `max_concurrent_session_executions` | `MaxConcurrentSessionExecutionSize` | int |
| `max_cached_workflows` | **not** a `worker.Options` field — process-global via `worker.SetStickyWorkflowCacheSize(n)` | int |
| `versioning` | not 1:1 — see below | enum |

```twf
namespace orders:
    worker orderTypes
        options:
            task_queue: "orders"
            max_concurrent_activity_executions: 50
            enable_sessions: true
```

```go
w := worker.New(c, "orders", worker.Options{
    MaxConcurrentActivityExecutionSize: 50,
    EnableSessionWorker:                true,
})
```

A key with no Go `worker.Options` field (another SDK's one-off, accepted by the permissive union) is **dropped — do not invent an API.** The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name / version are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning fields (default unversioned worker).
- `build_id` → **legacy** path (the SDK marks these **Deprecated** in favor of `DeploymentOptions`):

```go
worker.Options{
    BuildID:                 buildID, // from env/config, not the .twf
    UseBuildIDForVersioning: true,
}
```

- `deployment` → **current** path:

```go
worker.Options{
    DeploymentOptions: worker.DeploymentOptions{
        UseVersioning: true,
        Version: worker.WorkerDeploymentVersion{
            DeploymentName: deploymentName, // from env/config
            BuildId:        buildID,        // from env/config
        },
    },
}
```

> **Pitfall — mutual exclusion:** worker versioning (`UseBuildIDForVersioning` or `DeploymentOptions.UseVersioning`) **cannot** be enabled together with `EnableSessionWorker`. A `.twf` carrying both `versioning: build_id|deployment` and `enable_sessions: true` cannot map to one `worker.Options` — surface it as a conflict; do not silently pick one.
