# options

Option keys map to setters on the SDK's options builders (`newBuilder()…build()`). A duration is a `java.time.Duration` (`2m` → `Duration.ofMinutes(2)`). `retry_policy:` → `RetryOptions` (`common/RetryOptions.java:139-216`): `initial_interval` → `setInitialInterval`, `backoff_coefficient` → `setBackoffCoefficient`, `maximum_interval` → `setMaximumInterval`, `maximum_attempts` → `setMaximumAttempts`, `non_retryable_error_types` → `setDoNotRetry(String...)` (renamed). `priority:` → `Priority`, a class marked `@Experimental` (`common/Priority.java:16,57-92`): `priority_key` → `setPriorityKey`, `fairness_key` → `setFairnessKey`, `fairness_weight` → `setFairnessWeight`.

**Options live on the stub, not the call.** `Workflow.newActivityStub(Iface.class, options)` fixes them for every call through that stub (`workflow/Workflow.java:75`), and a child stub for its one start; a call with other options uses its own stub.

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

```java
private final ServiceActivities service =
    Workflow.newActivityStub(
        ServiceActivities.class,
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(2))
            .setRetryOptions(
                RetryOptions.newBuilder()
                    .setMaximumAttempts(5)
                    .setInitialInterval(Duration.ofSeconds(1))
                    .setBackoffCoefficient(2.0)
                    .setMaximumInterval(Duration.ofSeconds(60))
                    .build())
            .build());

String result = service.unreliableService(data);
```

`ActivityOptions` (`activity/ActivityOptions.java:82-253`) must set `setStartToCloseTimeout` or `setScheduleToCloseTimeout`, else the stub's call throws `IllegalArgumentException` (`internal/sync/ActivityInvocationHandler.java:55-59`). With no `options:` anywhere, the stub still sets `setStartToCloseTimeout`.

| TWF | `ActivityOptions.Builder` |
|-----|---------------------------|
| `task_queue` | `setTaskQueue` |
| `schedule_to_close_timeout` | `setScheduleToCloseTimeout` |
| `schedule_to_start_timeout` | `setScheduleToStartTimeout` |
| `start_to_close_timeout` | `setStartToCloseTimeout` |
| `heartbeat_timeout` | `setHeartbeatTimeout` |
| `retry_policy` | `setRetryOptions` (renamed) |
| `priority` | `setPriority` (`@Experimental`, `:252`) |
| `request_eager_execution: false` | `setDisableEagerExecution(true)` (inverted, renamed; default `false`, `:218`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```java
ChildWorkflow child =
    Workflow.newChildWorkflowStub(
        ChildWorkflow.class,
        ChildWorkflowOptions.newBuilder()
            .setWorkflowExecutionTimeout(Duration.ofHours(1))
            .setParentClosePolicy(ParentClosePolicy.PARENT_CLOSE_POLICY_REQUEST_CANCEL)
            .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(3).build())
            .build());
String childResult = child.run(input.data());
```

| TWF | `ChildWorkflowOptions.Builder` (`workflow/ChildWorkflowOptions.java:113-335`) |
|-----|------------------------|
| `task_queue` | `setTaskQueue` |
| `workflow_execution_timeout` | `setWorkflowExecutionTimeout` |
| `workflow_run_timeout` | `setWorkflowRunTimeout` |
| `workflow_task_timeout` | `setWorkflowTaskTimeout` |
| `workflow_id_reuse_policy` | `setWorkflowIdReusePolicy` |
| `retry_policy` | `setRetryOptions` (renamed) |
| `priority` | `setPriority` (`@Experimental`, `:334`) |
| `parent_close_policy` | `setParentClosePolicy`: `PARENT_CLOSE_POLICY_TERMINATE`, `PARENT_CLOSE_POLICY_REQUEST_CANCEL` or `PARENT_CLOSE_POLICY_ABANDON`, from `io.temporal.api.enums.v1.ParentClosePolicy`; unset leaves the server's default, terminate (`internal/sync/SyncWorkflowContext.java:974-976`) |

A client start's `WorkflowOptions` uses the same setter names, less `setParentClosePolicy`, plus `setWorkflowId`, `setWorkflowIdConflictPolicy` and `setTaskQueue` (`client/WorkflowOptions.java:157-272`); its `setPriority` is `@Experimental` too (`:471`).

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, in `NexusOperationOptions` (`workflow/NexusOperationOptions.java:46-87`), set on the service stub with `NexusServiceOptions.Builder.setOperationOptions` (`workflow/NexusServiceOptions.java:42`): `schedule_to_close_timeout` → `setScheduleToCloseTimeout`; `schedule_to_start_timeout` → `setScheduleToStartTimeout` and `start_to_close_timeout` → `setStartToCloseTimeout`, both `@Experimental` and requiring Temporal Server 1.31 (`:63-66,84-86`). `setStartToCloseTimeout` bounds an async operation after its start; a sync operation ignores it. Its `setCancellationType` belongs to [detach](./detach.md) alone.

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```java
private final BillingService billing =
    Workflow.newNexusServiceStub(
        BillingService.class,
        NexusServiceOptions.newBuilder()
            .setEndpoint("BillingEndpoint")
            .setOperationOptions(
                NexusOperationOptions.newBuilder().setScheduleToCloseTimeout(Duration.ofHours(1)).build())
            .build());

PaymentResult paymentResult = billing.chargePayment(payment);
```

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One `static final` options constant beside the definition is that rule. A call with its own `options:` copies it with `newBuilder(defaults)` (`activity/ActivityOptions.java:19`, `workflow/ChildWorkflowOptions.java:25`) into its own stub and sets the keys it overrides, a nested block as a whole new object:

```java
// PaymentActivities.java
@ActivityInterface
public interface PaymentActivities {
  ActivityOptions CHARGE_CARD_DEFAULTS =
      ActivityOptions.newBuilder()
          .setStartToCloseTimeout(Duration.ofSeconds(30))
          .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(5).build())
          .build();

  Receipt chargeCard(Card card, BigDecimal amount);
}

// In the workflow impl:
private final PaymentActivities payments =
    Workflow.newActivityStub(PaymentActivities.class, PaymentActivities.CHARGE_CARD_DEFAULTS);
private final PaymentActivities tipPayments =
    Workflow.newActivityStub(
        PaymentActivities.class,
        ActivityOptions.newBuilder(PaymentActivities.CHARGE_CARD_DEFAULTS)
            .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(1).build())
            .build());
```

Never build the override's nested block from the default's (`RetryOptions.newBuilder(defaults.getRetryOptions())`): that merges field by field.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `setWorkflowIdReusePolicy(WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE)`; `workflow_id_conflict_policy` → `setWorkflowIdConflictPolicy(WorkflowIdConflictPolicy.WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING)`. Both enums are `io.temporal.api.enums.v1`'s. Where each lands depends on the start kind:

- **Client start** (sync nexus body, async operation, client code): both, on the client's `WorkflowOptions` (`client/WorkflowOptions.java:181,200`), from the type's start-options method ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `FAIL` throws `WorkflowExecutionAlreadyStarted` from the start (`client/WorkflowStubImpl.java:526`). Update-with-start requires a conflict policy (`:131-133`); supply one when the type declares none.
- **Child start**: `ChildWorkflowOptions` has no conflict policy, so it takes the reuse policy only; a start onto a running ID fails with a `ChildWorkflowFailure` caused by `WorkflowExecutionAlreadyStarted` (`internal/statemachines/ChildWorkflowStateMachine.java:219-240`).

## Worker options

A namespace worker's `options:` map in [worker.md](./worker.md#worker-options). Two keys sit off `WorkerOptions`: `max_cached_workflows` is the factory's `WorkerFactoryOptions.setWorkflowCacheSize`, shared by all its workers, and `worker_shutdown_timeout` is a call, `factory.shutdown()` then `factory.awaitTermination(timeout, unit)`.

## Timeouts and retries

`temporal-developer` `references/java/error-handling.md` § Retry Policy Configuration, § Timeout Configuration.
