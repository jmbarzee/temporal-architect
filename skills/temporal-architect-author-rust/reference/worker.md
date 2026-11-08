# worker

```twf
@sdk(rust, "src/lib.rs")
worker orderTypes:
	workflow ProcessOrder
	activity ValidateOrder
	activity ChargePayment

namespace default:
	worker orderTypes
		options:
			task_queue: "orders"
```

```rust
// src/lib.rs
pub const ORDERS_TASK_QUEUE: &str = "orders";

/// The `orderTypes` worker's registrations, shared by the worker binary and the tests.
pub fn order_types(activities: OrderActivities) -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(ORDERS_TASK_QUEUE)
        .register_workflow::<ProcessOrder>()?
        .register_activities(activities)
        .build())
}

// src/main.rs
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = Runtime::from_current_tokio(Default::default())?;
    let client = connect("default").await?; // a `Client` bound to the namespace
    let options = order_types(OrderActivities::new(/* dependencies */))?;
    Worker::new(&runtime, client, options)?.run().await?;
    Ok(())
}
```

## Registration

- Each `.twf` worker has one `<worker>_types()` function in `src/lib.rs`, named for the worker (`orderTypes` → `order_types`), returning its `WorkerOptions` ([SKILL.md](../SKILL.md#output-conventions)). The `.twf` worker's `@sdk(rust, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory: add the annotation, or keep its path current when the file moves.
- `.register_workflow::<W>()?` registers a workflow and returns `Result` (`sdk/src/lib.rs:487-495`); `.register_activities(instance)` registers every `#[activity]` of an instance, built with real dependencies (`:471-475`, [activity-def.md](./activity-def.md)). Taking the instance as a parameter, as `order_types(activities)`, lets a test pass its own. Registration is per type, so several `.twf` workers' types may share one crate.
- `Worker::new(&runtime, client, options)?.run().await` (`:903-909,1040-1042`) — the task queue is `WorkerOptions::new`'s argument (`:187-194`), the namespace the client's. Several `.twf` workers → several `Worker`s, each from its own function; `run` returns a future that is not `Send` (`:1048`), so join them in one task (`tokio::try_join!`) rather than spawning each.
- Connecting, running and shutting down: `temporal-developer` `references/rust/rust.md` § Worker Setup, with the current calls from [SKILL.md § Delegation](../SKILL.md#delegation).

A missing registration is an unregistered type: the worker starts, and the task fails at runtime.

**Nexus.** A Rust worker registers no Nexus service and polls no Nexus task (`:723-728`): the handler worker is another SDK's ([nexus-service-def.md](./nexus-service-def.md)). The endpoint that routes to it belongs to `temporal-architect-author-infra`.

## Coverage

- Every worker on a task queue must register the **identical** workflow and activity type set, or tasks intermittently land where they can't run. The same holds for Nexus services among the workers that register any. DSL `worker` blocks with different type sets therefore need different task queues.
- `twf check` previews this at design time: `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` (no worker covers a type) and `IMPLICIT_ROUTING_MISMATCH` (no worker on the caller's queue in the caller's namespace hosts the target — a `Worker` polls its task queue in its client's namespace only). A clean check is the design-time analog of full registration, except for a [family](#per-instance-worker-families): there the runtime guard is the call's `schedule_to_start_timeout` (`INSTANCE_QUEUE_NO_START_TIMEOUT`).

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

```rust
/// One queue function per family, shared by the instance process and every caller.
pub fn sandbox_queue(sandbox_id: &str) -> String {
    format!("sandbox-{sandbox_id}")
}

/// The sidecar process builds one per instance.
pub fn sidecar(sandbox_id: &str, activities: SandboxActivities) -> WorkerOptions {
    WorkerOptions::new(sandbox_queue(sandbox_id))
        .register_activities(activities)
        .client_identity_override(format!("sidecar-{sandbox_id}"))
        .activity_task_poller_behavior(PollerBehavior::SimpleMaximum(2))
        .build()
}

// In Agent's run:
let options = ActivityOptions::with_start_to_close_timeout(Duration::from_secs(300))
    .task_queue(sandbox_queue(&lease.sandbox_id))
    .schedule_to_start_timeout(Duration::from_secs(30))
    .build();
match ctx.execute_activity(SandboxActivities::run_tool, task.call.clone(), options).await {
    Err(e) if e.as_timeout().is_some_and(|t| t.timeout_type() == TimeoutType::ScheduleToStart) => {
        // The instance is gone: reroute, or rerun the sequence.
        todo!()
    }
    result => Ok(result?),
}
```

- **The instance process runs its own worker,** one `Worker` per instance. The family's workflows stay on a shared-queue worker.
- **Set `activity_task_poller_behavior` small and explicit.** Every member's pollers count against the namespace's poller limit.
- **Identity defaults to the client's, else `pid@hostname`** (`sdk/src/lib.rs:227-230,700-708`), so it is unique per member only when each member is its own process. A process running several members sets `client_identity_override` with the instance key.
- **The call's options set `task_queue`, `schedule_to_start_timeout` and a close timeout.** A schedule-to-start timeout is not retried; it arrives as an `ActivityExecutionError` whose `as_timeout()` has `TimeoutType::ScheduleToStart` (`common-wasm/src/error.rs:86-98,1046-1053`).

## Worker options

The namespace worker's `options:` block maps onto `WorkerOptions` builder setters (`sdk/src/lib.rs:187-307`), before `.build()` in `<worker>_types()`:

| TWF worker option | Rust |
|-------------------|------|
| `task_queue` | `WorkerOptions::new(task_queue)`'s argument |
| `worker_activity_rate_limit` | `max_worker_activities_per_second` (renamed) |
| `task_queue_activity_rate_limit` | `max_task_queue_activities_per_second` (renamed) |
| `max_concurrent_activity_executions` | the `tuner`'s `activity_task_slot_supplier` (below) |
| `max_concurrent_workflow_task_executions` | the `tuner`'s `workflow_task_slot_supplier` |
| `max_concurrent_local_activity_executions` | the `tuner`'s `local_activity_task_slot_supplier` |
| `max_concurrent_nexus_task_executions` | the `tuner`'s `nexus_task_slot_supplier`; moot, since a Rust worker polls no Nexus task |
| `max_concurrent_workflow_task_pollers` | `workflow_task_poller_behavior(PollerBehavior::SimpleMaximum(n))`; at least 2 while `max_cached_workflows` is above 0 (`:242-248`) |
| `max_concurrent_activity_task_pollers` | `activity_task_poller_behavior(PollerBehavior::SimpleMaximum(n))` |
| `max_concurrent_nexus_task_pollers` | `nexus_task_poller_behavior(…)`; moot likewise |
| `max_cached_workflows` | `max_cached_workflows` (default 1000; `0` turns off sticky queues, `:231-237`) |
| `sticky_schedule_to_start_timeout` | `sticky_queue_schedule_to_start_timeout` (renamed) |
| `max_heartbeat_throttle_interval` | `max_heartbeat_throttle_interval` |
| `worker_identity` | `client_identity_override` (renamed) |
| `worker_shutdown_timeout` | `graceful_shutdown_period` (renamed): once shutdown has run this long, the worker cancels its outstanding activities (`:305-307`) |
| `local_activity_only_mode` | **unsupported in Rust**: the task types follow the registrations — workflow tasks when a workflow is registered, activity tasks when an activity is (`:723-728`) |
| `versioning` | not 1:1 — see below |

The four `max_concurrent_*_executions` keys share one `tuner`, a `TunerHolder` whose builder needs all four slot suppliers (`sdk/src/runtime/worker_tuner.rs:67-84`); a key the `.twf` leaves unset keeps the default, `FixedSizeSlotSupplier::new(100)` (`:13,37-46`).

```twf
namespace orders:
	worker orderTypes
		options:
			task_queue: "orders"
			max_concurrent_activity_executions: 50
			max_cached_workflows: 1000
			worker_shutdown_timeout: 30s
```

```rust
pub fn order_types(activities: OrderActivities) -> Result<WorkerOptions, WorkflowRegistrationError> {
    Ok(WorkerOptions::new(ORDERS_TASK_QUEUE)
        .register_workflow::<ProcessOrder>()?
        .register_activities(activities)
        .tuner(
            TunerHolder::builder()
                .workflow_task_slot_supplier(FixedSizeSlotSupplier::new(100))
                .activity_task_slot_supplier(FixedSizeSlotSupplier::new(50))
                .local_activity_task_slot_supplier(FixedSizeSlotSupplier::new(100))
                .nexus_task_slot_supplier(FixedSizeSlotSupplier::new(100))
                .build(),
        )
        .max_cached_workflows(1000)
        .graceful_shutdown_period(Duration::from_secs(30))
        .build())
}
```

The richer versioning model (ramping, per-namespace-vs-per-worker placement) stays deferred — see [#20](https://github.com/jmbarzee/temporal-architect/issues/20).

### `versioning` (not 1:1)

The DSL `versioning` enum carries *strategy*, not identifiers. Concrete Build ID / deployment name are **deploy-time inputs from config/env** — never fabricate them into generated code.

- `none` → no versioning fields: the default `deployment_options` names the worker with a build ID hashed from its executable, without opting into versioning (`sdk/src/lib.rs:223-226,554-557`, `common/src/worker.rs:135-146`).
- `build_id` → **unsupported in Rust**: the legacy Build-ID strategy is unreachable, since `WorkerOptions` always hands the worker deployment-based versioning (`sdk/src/lib.rs:738-740`). `deployment` is the current path.
- `deployment` → `deployment_options` (`common/src/worker.rs:118-133`):

```rust
.deployment_options(
    WorkerDeploymentOptions::new(
        WorkerDeploymentVersion::builder()
            .deployment_name(deployment_name) // from env/config
            .build_id(build_id)
            .build(),
    )
    .use_worker_versioning(true)
    .default_versioning_behavior(VersioningBehavior::Pinned) // or AutoUpgrade
    .build(),
)
```

`WorkerDeploymentOptions`, `WorkerDeploymentVersion` and `VersioningBehavior` are `temporalio_common::worker`'s (`common/src/worker.rs:10-23`). Choosing the behavior: [idioms.md § Versioning](./idioms.md#versioning).
