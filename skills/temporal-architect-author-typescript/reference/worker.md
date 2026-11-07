# worker

```twf
@sdk(typescript, "src/worker.ts")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```ts
// src/worker.ts
import { NativeConnection, Worker, type WorkerOptions } from '@temporalio/worker';
import { createActivities, type Deps } from './activities';

/** The orderTypes worker's registrations, shared by the worker process and the tests. */
export function orderTypes(deps: Deps): Pick<WorkerOptions, 'workflowsPath' | 'activities'> {
  return {
    workflowsPath: require.resolve('./order-workflows'),
    activities: createActivities(deps),
  };
}

export async function run(connection: NativeConnection, deps: Deps): Promise<void> {
  const worker = await Worker.create({ connection, namespace: 'default', taskQueue: 'orders', ...orderTypes(deps) });
  await worker.run();
}
```

## Registration

- Each `.twf` worker's entry file exports a registrations helper named for the worker, returning its `workflowsPath`, `activities` and `nexusServices` as a `Pick<WorkerOptions, …>`. The `.twf` worker's `@sdk(typescript, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- **One workflows module per `.twf` worker.** `workflowsPath` registers every function its module exports, by export name (`mod[workflowType]`, `workflow/src/worker-interface.ts`), so it exports exactly the worker's workflows, and two workers never share one. Production bundles it ahead of time: `workflowBundle`, `temporal-developer` `references/typescript/gotchas.md` § Using workflowsPath in Production.
- `activities` — an object whose keys are the activity types (`worker/src/worker.ts`): the factory's result ([activity-def.md](./activity-def.md)), built with real dependencies.
- `Worker.create({connection, namespace, taskQueue, ...helper()})` (`worker/src/worker-options.ts`) — the task queue is the namespace worker's `task_queue` option. Several DSL `worker` blocks → several `Worker.create` calls, each from its own helper, run together.
- Connecting, running and shutting down: `temporal-developer` `references/typescript/typescript.md` § Worker Setup.

A missing export or key is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** The handler worker's helper returns `nexusServices: [serviceHandler]`, and its workflows module exports the backing workflows, per [nexus-service-def.md](./nexus-service-def.md). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `Worker.create` polls its `taskQueue` in its `namespace` only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `scheduleToStartTimeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```ts
// One queue function per family, shared by the instance process and every caller.
export const sandboxQueue = (sandboxId: string): string => `sandbox-${sandboxId}`;

// In the sidecar process, one per instance:
const worker = await Worker.create({
  connection,
  namespace: 'aivearium',
  taskQueue: sandboxQueue(sandboxId),
  identity: `sidecar-${sandboxId}`,
  maxConcurrentActivityTaskPolls: 2,
  ...sidecar(deps),
});

// In Agent:
const { RunTool } = proxyActivities<typeof activities>({
  taskQueue: sandboxQueue(lease.sandboxId),
  scheduleToStartTimeout: '30s',
  startToCloseTimeout: '5m',
});
try {
  return await RunTool(task.call);
} catch (err) {
  if (err instanceof ActivityFailure && err.cause instanceof TimeoutFailure && err.cause.timeoutType === TimeoutType.SCHEDULE_TO_START) {
    // The instance is gone: reroute, or rerun the sequence.
  }
  throw err;
}
```

- **The instance process starts its own worker,** one `Worker.create` per instance. The family's workflows stay on a shared-queue worker.
- **Set `maxConcurrentActivityTaskPolls` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **`identity` is per process by default** (`${process.pid}@${os.hostname()}`, `worker/src/worker-options.ts`), so it is unique per member only when each member is its own process. A process running several members sets `identity` with the instance key.
- **The call site's proxy sets `taskQueue`, `scheduleToStartTimeout` and `startToCloseTimeout`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutFailure` as the `cause` of an `ActivityFailure` (`common/src/failure.ts`; `TimeoutType` imports from `@temporalio/common`).

## Worker options → `WorkerOptions`

The namespace worker's `options:` block maps onto `WorkerOptions` (`worker/src/worker-options.ts`):

| TWF worker option | `WorkerOptions` field |
|-------------------|-----------------------|
| `task_queue` | `taskQueue` |
| `max_concurrent_activity_executions` | `maxConcurrentActivityTaskExecutions` |
| `max_concurrent_workflow_task_executions` | `maxConcurrentWorkflowTaskExecutions` |
| `max_concurrent_local_activity_executions` | `maxConcurrentLocalActivityExecutions` |
| `max_concurrent_nexus_task_executions` | `maxConcurrentNexusTaskExecutions` |
| `max_concurrent_workflow_task_pollers` | `maxConcurrentWorkflowTaskPolls` |
| `max_concurrent_activity_task_pollers` | `maxConcurrentActivityTaskPolls` |
| `max_concurrent_nexus_task_pollers` | `maxConcurrentNexusTaskPolls` |
| `worker_activity_rate_limit` | `maxActivitiesPerSecond` |
| `task_queue_activity_rate_limit` | `maxTaskQueueActivitiesPerSecond` |
| `max_cached_workflows` | `maxCachedWorkflows` |
| `sticky_schedule_to_start_timeout` | `stickyQueueScheduleToStartTimeout` |
| `max_heartbeat_throttle_interval` | `maxHeartbeatThrottleInterval` |
| `worker_identity` | `identity` |
| `worker_shutdown_timeout` | `shutdownGraceTime` |
| `local_activity_only_mode: true` | `enableNonLocalActivities: false` (inverted) |
| `versioning` | not 1:1 — see below |

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			worker_shutdown_timeout: 30s
```

```ts
const worker = await Worker.create({
  connection,
  namespace: 'orders',
  taskQueue: 'orders',
  maxConcurrentActivityTaskExecutions: 50,
  shutdownGraceTime: '30s',
  ...orderTypes(deps),
});
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning fields (default unversioned worker).
- `build_id` → **legacy** path: `buildId` (from env/config) and `useVersioning: true`, both `@deprecated` in favor of `workerDeploymentOptions`.
- `deployment` → **current** path:

```ts
workerDeploymentOptions: {
  version: { deploymentName, buildId }, // from env/config
  useWorkerVersioning: true,
  defaultVersioningBehavior: 'PINNED', // required with useWorkerVersioning; or 'AUTO_UPGRADE'
},
```

Choosing the behavior: `temporal-developer` `references/typescript/versioning.md` § Worker Versioning.
