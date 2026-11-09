# worker

```twf
@sdk(haskell, "haskell/Order.hs")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```haskell
-- Order.hs
-- | The orderTypes worker's registrations; the caller adds its deployment
-- (namespace, task queue). Shared by the worker process and the tests.
orderTypes :: OrderEnv -> ConfigM OrderEnv () -> WorkerConfig OrderEnv
orderTypes env = configure env (processOrder, validateOrder, chargePayment)

-- Main.hs
main :: IO ()
main = do
  runtime <- initializeRuntime NoTelemetry
  core <- runNoLoggingT (connectClient runtime defaultClientConfig)
  env <- newOrderEnv
  worker <- startWorker core (orderTypes env (setNamespace "default" >> setTaskQueue "orders"))
  waitWorker worker
```

## Registration

- Each `.twf` worker has one function named for the worker (`orderTypes`), returning its `WorkerConfig` from `configure env definitions settings` (`Worker.hs:196-211`), with its Nexus services added in the settings ([SKILL.md](../SKILL.md#output-conventions)). The `.twf` worker's `@sdk(haskell, "<path>")` names that function's module file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `definitions` is one `ProvidedWorkflow` or `ProvidedActivity`, or a tuple of up to six, or `Definitions` combined with `<>` beyond that (`Worker.hs:226-278`). Activities with dependencies read the `env` passed to `configure` ([activity-def.md](./activity-def.md)); with none, `env` is `()`. Taking `env` as a parameter lets a test pass its own.
- A `WorkerConfig` polls one task queue in one namespace (`Worker.hs:300-323`), so several `.twf` worker blocks → several configs, each from its own function, each started with `startWorker` (`Worker.hs:780`) on one client; `waitWorker` blocks until one stops (`Worker.hs:953-960`).
- Connecting, running and shutting down: [idioms.md § worker setup](./idioms.md#worker-setup).

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** The handler worker's function calls `addNexusServiceHandler` in its settings and registers the backing workflows, per [nexus-service-def.md](./nexus-service-def.md); the worker polls Nexus tasks only when it holds a service (`Worker.hs:906-911`). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a worker polls its `setTaskQueue` in its `setNamespace` only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `scheduleToStartTimeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```haskell
-- One queue function per family, shared by the instance process and every caller.
sandboxQueue :: Text -> TaskQueue
sandboxQueue sandboxId = TaskQueue ("sandbox-" <> sandboxId)

-- In the sidecar process, one per instance:
worker <-
  startWorker core $ sidecar env do
    setNamespace "aivearium"
    setTaskQueue (sandboxQueue sandboxId)
    setIdentity ("sidecar-" <> sandboxId)
    setMaxConcurrentActivityTaskPolls 2

-- In Agent:
output <-
  executeActivity
    runTool
    (defaultStartActivityOptions (StartToClose (minutes 5)))
      { Activity.taskQueue = Just (sandboxQueue lease.sandboxId)
      , Activity.scheduleToStartTimeout = Just (seconds 30)
      }
    task.call
```

- **The instance process starts its own worker,** one `startWorker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `setMaxConcurrentActivityTaskPolls` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **`setIdentity` with the instance key** when one process runs several members; otherwise the identity is the client's.
- **The call site's options set `taskQueue`, `scheduleToStartTimeout` and the `StartToClose` timeout.** A schedule-to-start timeout is not retried; it arrives as an `ActivityFailure` from the call (`Workflow.hs:455-470`): catch it to reroute, or rerun the sequence.

## Worker options → `ConfigM` setters

The namespace worker's `options:` block maps onto `Temporal.Worker`'s setters in the settings passed to the worker's function (`Worker.hs:300-545`). Unit-carrying setters take **milliseconds** as a `Word64` (`…Millis`), not a `Duration`:

| TWF worker option | `ConfigM` setter |
|-------------------|------------------|
| `task_queue` | `setTaskQueue` (`:319`) |
| `max_concurrent_activity_executions` | `setMaxOutstandingActivities` (renamed, `:366`) |
| `max_concurrent_workflow_task_executions` | `setMaxOutstandingWorkflowTasks` (renamed, `:359`) |
| `max_concurrent_local_activity_executions` | `setMaxOutstandingLocalActivities` (renamed, `:373`) |
| `max_concurrent_nexus_task_executions` | `setMaxOutstandingNexusTasks` (renamed, `:380`) |
| `max_concurrent_workflow_task_pollers` | `setMaxConcurrentWorkflowTaskPolls` (renamed, `:394`) |
| `max_concurrent_activity_task_pollers` | `setMaxConcurrentActivityTaskPolls` (renamed, `:415`) |
| `max_concurrent_nexus_task_pollers` | **unsupported at the pin**: no setter, and `modifyCore` is not exported (`Worker.hs:26-119`) |
| `worker_activity_rate_limit` | `setMaxActivitiesPerSecond` (renamed, `:464`) |
| `task_queue_activity_rate_limit` | `setMaxTaskQueueActivitiesPerSecond` (renamed, `:476`) |
| `max_cached_workflows` | `setMaxCachedWorkflows` (`:352`) |
| `sticky_schedule_to_start_timeout` | `setStickyQueueScheduleToStartTimeoutMillis` (renamed, ms, `:430`) |
| `max_heartbeat_throttle_interval` | `setMaxHeartbeatThrottleIntervalMillis` (ms, `:438`) |
| `worker_identity` | `setIdentity` (renamed, `:345`) |
| `worker_shutdown_timeout` | `setGracefulShutdownPeriodMillis` (renamed, ms, `:489`) |
| `local_activity_only_mode: true` | `setNoRemoteActivities True` (renamed, not inverted, `:422`) |
| `versioning` | not 1:1 — see below |

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			worker_shutdown_timeout: 30s
```

```haskell
worker <-
  startWorker core $ orderTypes env do
    setNamespace "orders"
    setTaskQueue "orders"
    setMaxOutstandingActivities 50
    setGracefulShutdownPeriodMillis 30000
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. A concrete Build ID is a **deploy-time input from config/env** — never fabricate it into generated code.

- `none` → no versioning setter (default unversioned worker).
- `build_id` → `setBuildId` (from env/config), the core's legacy build identifier (`Worker.hs:326-342`, `core/src/Temporal/Core/Worker.hs:497-503`).
- `deployment` → **unsupported at the pin**: the core worker config has no deployment or versioning-behavior field (`core/src/Temporal/Core/Worker.hs:492-615`), and `Temporal.Worker` no setter for one. Tell the user; the design stays as written.
