# worker

```twf
@sdk(python, "worker.py")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```python
# worker.py
def order_types(client: Client, acts: OrderActivities) -> Worker:
    """The orderTypes worker: its task queue and registrations, shared by the worker process and the tests."""
    return Worker(
        client,
        task_queue="orders",
        workflows=[ProcessOrder],
        activities=[acts.validate_order, acts.charge_payment],
    )


async def main() -> None:
    client = await Client.connect(**ClientConfig.load_client_connect_config())
    await order_types(client, OrderActivities(Validator(), Payments())).run()


if __name__ == "__main__":
    asyncio.run(main())
```

## Registration

- Each `.twf` worker's module defines a worker-factory function named for the worker, returning the `Worker` with its task queue and registrations. The `.twf` worker's `@sdk(python, "<path>")` names that module, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the module moves.
- `Worker(client, task_queue=…, workflows=[…], activities=[…], nexus_service_handlers=[…])` (`temporalio/worker/_worker.py:101-108`) registers exactly the lists it is given: each `@workflow.defn` class, each `@activity.defn` callable (bound methods of the activities class, [activity-def.md](./activity-def.md)), each service handler instance. Several DSL `worker` blocks → several factories, run together.
- The task queue is the namespace worker's `task_queue` option. The namespace is the client's: `Client.connect(…, namespace=…)`, so a worker polls its `task_queue` in its client's namespace only.
- A plain `def` activity needs `activity_executor=ThreadPoolExecutor()`, or `Worker` raises at construction (`temporalio/worker/_activity.py:111-113`), as the corpus's `greeter_types` does: `temporal-developer` `references/python/sync-vs-async.md`, `gotchas.md` § Missing Executor for Sync Activities.
- Connecting, running and shutting down: `temporal-developer` `references/python/python.md` § Worker Setup.

A type left out of a list is unregistered: the worker starts, and the task fails at runtime.

**Nexus.** The handler worker's factory passes `nexus_service_handlers=[ServiceHandler()]` and registers the backing workflows, per [nexus-service-def.md](./nexus-service-def.md). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `schedule_to_start_timeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```python
# One queue function per family, shared by the instance process and every caller.
def sandbox_queue(sandbox_id: str) -> str:
    return f"sandbox-{sandbox_id}"


# In the sidecar process, one per instance (client connected to namespace "aivearium"):
def sidecar(client: Client, sandbox_id: str, acts: SidecarActivities) -> Worker:
    return Worker(
        client,
        task_queue=sandbox_queue(sandbox_id),
        identity=f"sidecar-{sandbox_id}",
        activity_task_poller_behavior=PollerBehaviorSimpleMaximum(maximum=2),
        activities=[acts.run_tool],
    )


# In Agent:
try:
    return await workflow.execute_activity_method(
        SidecarActivities.run_tool,
        task.call,
        task_queue=sandbox_queue(lease.sandbox_id),
        schedule_to_start_timeout=timedelta(seconds=30),
        start_to_close_timeout=timedelta(minutes=5),
    )
except ActivityError as err:
    if isinstance(err.cause, TimeoutError) and err.cause.type == TimeoutType.SCHEDULE_TO_START:
        ...  # The instance is gone: reroute, or rerun the sequence.
    raise
```

- **The instance process starts its own worker,** one `Worker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `activity_task_poller_behavior` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **`identity` is per process by default** (`{pid}@{hostname}`, `temporalio/service.py:247`), so it is unique per member only when each member is its own process. A process running several members sets `identity` with the instance key.
- **The call sets `task_queue`, `schedule_to_start_timeout` and `start_to_close_timeout`.** A schedule-to-start timeout is not retried; it arrives as a `TimeoutError` (`temporalio.exceptions`, not the builtin) as the `cause` of an `ActivityError` (`temporalio/exceptions.py:244,306`).

## Worker options → `Worker(...)`

The namespace worker's `options:` block maps onto `Worker`'s keyword arguments (`temporalio/worker/_worker.py:101-158`):

| TWF worker option | `Worker` argument |
|-------------------|-------------------|
| `task_queue` | `task_queue` |
| `max_concurrent_activity_executions` | `max_concurrent_activities` |
| `max_concurrent_workflow_task_executions` | `max_concurrent_workflow_tasks` |
| `max_concurrent_local_activity_executions` | `max_concurrent_local_activities` |
| `max_concurrent_nexus_task_executions` | `max_concurrent_nexus_tasks` |
| `max_concurrent_workflow_task_pollers` | `workflow_task_poller_behavior=PollerBehaviorSimpleMaximum(maximum=N)` |
| `max_concurrent_activity_task_pollers` | `activity_task_poller_behavior=PollerBehaviorSimpleMaximum(maximum=N)` |
| `max_concurrent_nexus_task_pollers` | `nexus_task_poller_behavior=PollerBehaviorSimpleMaximum(maximum=N)` |
| `worker_activity_rate_limit` | `max_activities_per_second` |
| `task_queue_activity_rate_limit` | `max_task_queue_activities_per_second` |
| `max_cached_workflows` | `max_cached_workflows` |
| `sticky_schedule_to_start_timeout` | `sticky_queue_schedule_to_start_timeout` |
| `max_heartbeat_throttle_interval` | `max_heartbeat_throttle_interval` |
| `worker_identity` | `identity` |
| `worker_shutdown_timeout` | `graceful_shutdown_timeout` |
| `local_activity_only_mode: true` | `no_remote_activities=True` (same polarity) |
| `versioning` | not 1:1 — see below |

The integer `max_concurrent_workflow_task_polls` and `max_concurrent_activity_task_polls` are deprecated for the poller behaviors, and Nexus has none (`temporalio/worker/_worker.py:238,252`). `PollerBehaviorSimpleMaximum` imports from `temporalio.worker`.

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			worker_shutdown_timeout: 30s
```

```python
Worker(
    client,  # connected to namespace "orders"
    task_queue="orders",
    max_concurrent_activities=50,
    graceful_shutdown_timeout=timedelta(seconds=30),
    workflows=[ProcessOrder],
    activities=[acts.validate_order, acts.charge_payment],
)
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning arguments (default unversioned worker).
- `build_id` → **legacy** path: `build_id` (from env/config) and `use_worker_versioning=True`, both deprecated for `deployment_config` (`temporalio/worker/_worker.py:211,318`).
- `deployment` → **current** path, marked experimental in the SDK (`temporalio/worker/_worker.py:328`):

```python
deployment_config=WorkerDeploymentConfig(
    version=WorkerDeploymentVersion(deployment_name=deployment_name, build_id=build_id),  # from env/config
    use_worker_versioning=True,
    default_versioning_behavior=VersioningBehavior.PINNED,  # or AUTO_UPGRADE; UNSPECIFIED makes every workflow declare its own
),
```

Choosing the behavior: `temporal-developer` `references/python/versioning.md` § Worker Versioning.
