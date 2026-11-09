# options

Option keys map to fields of the SDK's options structs, built with their `bon` builders or set on a built value's `pub` fields. A duration is a `std::time::Duration` (`2m` → `Duration::from_secs(120)`). `retry_policy:` → `temporalio_common::RetryPolicy::builder()` (`common-wasm/src/retry_policy.rs:31-59`), whose setters keep the `.twf` names: `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types`. `priority:` → `temporalio_common::Priority::builder()` (`common-wasm/src/priority.rs:22-79`): `priority_key`, `fairness_key`, `fairness_weight`.

**Options travel with the call.** Each `execute_activity`, `start_child_workflow` and `start_nexus_operation` takes its own options value; calls sharing options share one function that returns them.

## Activity options

```twf
activity UnreliableService(data) -> result
	options:
		start_to_close_timeout: 2m
		retry_policy:
			maximum_attempts: 5
			initial_interval: 1s
			backoff_coefficient: 2.0
			maximum_interval: 60s
```

```rust
let result = ctx
    .execute_activity(
        ServiceActivities::unreliable_service,
        data,
        ActivityOptions::with_start_to_close_timeout(Duration::from_secs(120))
            .retry_policy(
                RetryPolicy::builder()
                    .maximum_attempts(5)
                    .initial_interval(Duration::from_secs(1))
                    .backoff_coefficient(2.0)
                    .maximum_interval(Duration::from_secs(60))
                    .build(),
            )
            .build(),
    )
    .await?;
```

`ActivityOptions` (`workflow/src/workflow_context/options.rs:244-322`) holds the two close timeouts as one `ActivityCloseTimeouts` choice, set when the builder starts (`common-wasm/src/lib.rs:57-79`): `with_start_to_close_timeout(d)`, `with_schedule_to_close_timeout(d)`, or `with_close_timeouts(ActivityCloseTimeouts::ScheduleAndStartToClose { schedule_to_close, start_to_close })` for both. So every call has one; with no `options:` anywhere, it still starts from `with_start_to_close_timeout`. `ActivityOptions::start_to_close_timeout(d)` is the shorthand for that alone, built (`:309-314`).

| TWF | `ActivityOptions` builder |
|-----|---------------------------|
| `task_queue` | `task_queue`; unset is the workflow's queue (`workflow/src/workflow_context.rs:1192-1194`) |
| `schedule_to_close_timeout` / `start_to_close_timeout` | the `close_timeouts` choice the builder starts from, above |
| `schedule_to_start_timeout` | `schedule_to_start_timeout` |
| `heartbeat_timeout` | `heartbeat_timeout` |
| `retry_policy` | `retry_policy` |
| `priority` | `priority` |
| `request_eager_execution: false` | `do_not_eagerly_execute(true)` (inverted, renamed; default `false`, `options.rs:286-288`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```rust
let child_result = ctx
    .start_child_workflow(
        ChildWorkflow::run,
        input.data.clone(),
        ChildWorkflowOptions::builder()
            .task_queue(ctx.task_queue().to_string())
            .execution_timeout(Duration::from_secs(3600))
            .parent_close_policy(ParentClosePolicy::RequestCancel)
            .retry_policy(RetryPolicy::builder().maximum_attempts(3).build())
            .build(),
    )
    .await?
    .result()
    .await?;
```

| TWF | `ChildWorkflowOptions` builder (`workflow/src/workflow_context/options.rs:484-537`) |
|-----|------------------------|
| `task_queue` | `task_queue`, **always set**: unset is sent as `""` (`:564`); the caller's is `ctx.task_queue()` ([workflow-call.md](./workflow-call.md)) |
| `workflow_execution_timeout` | `execution_timeout` (renamed) |
| `workflow_run_timeout` | `run_timeout` (renamed) |
| `workflow_task_timeout` | `task_timeout` (renamed) |
| `workflow_id_reuse_policy` | `id_reuse_policy` (renamed); unset sends `AllowDuplicate` (`:570-575`) |
| `retry_policy` | `retry_policy`; unset, the server does not retry the child (`:517-519`) |
| `priority` | `priority` |
| `parent_close_policy` | `parent_close_policy`: `ParentClosePolicy::Terminate`, `RequestCancel` or `Abandon`; unset is `Unspecified`, the server's default, terminate (`:131-144`) |

`cancel_type` (renamed from Temporal's cancellation type) is a `ChildWorkflowCancellationType`, default `WaitCancellationCompleted` (`:84-99,494-496`); only [detach](./detach.md) sets it. A client start's `WorkflowStartOptions` takes the same keys, less `parent_close_policy`, plus `id_conflict_policy`; its task queue and workflow ID are required arguments of `WorkflowStartOptions::new` (`client/src/options_structs.rs:487-544`).

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, fields of `NexusOperationOptions` with the `.twf` names, behind the `experimental` feature (`workflow/src/workflow_context/options/nexus.rs:59-104`): `schedule_to_close_timeout`, `schedule_to_start_timeout`, `start_to_close_timeout`. `start_to_close_timeout` bounds an async operation after its start; a sync operation ignores it (`:97-103`). Its `cancellation_type` belongs to [detach](./detach.md) alone.

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```rust
let options = NexusOperationOptions::builder()
    .endpoint("BillingEndpoint")
    .service("BillingService")
    .operation("ChargePayment")
    .input(RawValue::from_value(&payment, &pc).payloads.remove(0))
    .schedule_to_close_timeout(Duration::from_secs(3600))
    .build();
```

The call itself is [nexus.md](./nexus.md).

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One function returning the defaults, beside the definition, is that rule. A call with its own `options:` takes the defaults and assigns the keys it overrides, a nested block as a whole new value:

```rust
impl PaymentActivities {
    pub fn charge_card_defaults() -> ActivityOptions {
        ActivityOptions::with_start_to_close_timeout(Duration::from_secs(30))
            .retry_policy(RetryPolicy::builder().maximum_attempts(5).build())
            .build()
    }
}

// In the workflow:
let receipt = ctx
    .execute_activity(PaymentActivities::charge_card, (card.clone(), amount), PaymentActivities::charge_card_defaults())
    .await?;

let mut tip_options = PaymentActivities::charge_card_defaults();
tip_options.retry_policy = Some(RetryPolicy::builder().maximum_attempts(1).build());
let tip_receipt = ctx
    .execute_activity(PaymentActivities::charge_card, (card, tip), tip_options)
    .await?;
```

Never patch the default's nested block in place (its `set_maximum_attempts` and the other setters, `retry_policy.rs:70-121`): that merges field by field.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `id_reuse_policy(WorkflowIdReusePolicy::AllowDuplicate)`; `workflow_id_conflict_policy` → `id_conflict_policy(WorkflowIdConflictPolicy::UseExisting)`. Where each lands depends on the start kind:

- **Client start** (client code; a Nexus handler's starts are another SDK's): both, on `WorkflowStartOptions`, with `temporalio_client`'s enums (`client/src/options_structs.rs:437-507`), from the type's `start_options` ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `Fail` returns `WorkflowStartError::AlreadyStarted` (`client/src/errors.rs:104-113`). Update-with-start requires a conflict policy, a required argument of `WorkflowUpdateWithStartOptions::new` (`options_structs.rs:622-641`); supply one when the type declares none.
- **Child start**: `ChildWorkflowOptions` has no conflict policy, so it takes the reuse policy only, as `temporalio_sdk::WorkflowIdReusePolicy`; a start onto a running ID fails with `ChildWorkflowStartError::StartFailed` (`common-wasm/src/error.rs:1066-1083`).

## Worker options

A namespace worker's `options:` map in [worker.md](./worker.md#worker-options).

## Timeouts and retries

[idioms.md § Errors](./idioms.md#errors).
