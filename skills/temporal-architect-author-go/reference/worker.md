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
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH`. A clean check is the design-time analog of full registration. In reverse, each `worker.New`'s registered set populates a `worker` block.

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
