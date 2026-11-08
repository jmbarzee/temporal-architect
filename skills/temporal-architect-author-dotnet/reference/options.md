# options

Option keys map to PascalCase properties of the SDK's options classes. A duration is a `TimeSpan` (`2m` → `TimeSpan.FromMinutes(2)`). `retry_policy:` → `RetryPolicy` (`Common/RetryPolicy.cs:15-37`): `initial_interval` → `InitialInterval`, `backoff_coefficient` → `BackoffCoefficient`, `maximum_interval` → `MaximumInterval`, `maximum_attempts` → `MaximumAttempts`, `non_retryable_error_types` → `NonRetryableErrorTypes`. `priority:` → `Priority` (`Common/Priority.cs:59-85`): `priority_key` → `PriorityKey`, `fairness_key` → `FairnessKey`, `fairness_weight` → `FairnessWeight`.

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

```csharp
var result = await Workflow.ExecuteActivityAsync(
    () => Activities.UnreliableService(data),
    new()
    {
        StartToCloseTimeout = TimeSpan.FromMinutes(2),
        RetryPolicy = new()
        {
            MaximumAttempts = 5,
            InitialInterval = TimeSpan.FromSeconds(1),
            BackoffCoefficient = 2,
            MaximumInterval = TimeSpan.FromSeconds(60),
        },
    });
```

`ActivityOptions` (`Workflows/ActivityOptions.cs:24-113`) is the call's required second argument; set `StartToCloseTimeout` or `ScheduleToCloseTimeout` (`:10`). With no `options:` anywhere, the call still sets `StartToCloseTimeout`.

| TWF | `ActivityOptions` |
|-----|-------------------|
| `task_queue` | `TaskQueue` |
| `schedule_to_close_timeout` | `ScheduleToCloseTimeout` |
| `schedule_to_start_timeout` | `ScheduleToStartTimeout` |
| `start_to_close_timeout` | `StartToCloseTimeout` |
| `heartbeat_timeout` | `HeartbeatTimeout` |
| `retry_policy` | `RetryPolicy` |
| `priority` | `Priority` |
| `request_eager_execution: false` | `DisableEagerActivityExecution = true` (inverted, renamed; default `false`, `:108`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```csharp
var childResult = await Workflow.ExecuteChildWorkflowAsync(
    (ChildWorkflow wf) => wf.RunAsync(input.Data),
    new()
    {
        ExecutionTimeout = TimeSpan.FromHours(1),
        ParentClosePolicy = ParentClosePolicy.RequestCancel,
        RetryPolicy = new() { MaximumAttempts = 3 },
    });
```

`ChildWorkflowOptions` (`Workflows/ChildWorkflowOptions.cs:18-118`) drops the `Workflow` prefix from the ID and timeout fields:

| TWF | `ChildWorkflowOptions` |
|-----|------------------------|
| `task_queue` | `TaskQueue` |
| `workflow_execution_timeout` | `ExecutionTimeout` (renamed) |
| `workflow_run_timeout` | `RunTimeout` (renamed) |
| `workflow_task_timeout` | `TaskTimeout` (renamed) |
| `workflow_id_reuse_policy` | `IdReusePolicy` (renamed) |
| `retry_policy` | `RetryPolicy` |
| `priority` | `Priority` |
| `parent_close_policy` | `ParentClosePolicy`: `Terminate` (default), `RequestCancel` or `Abandon` (`Workflows/ParentClosePolicy.cs:16-26`) |

A client start's `WorkflowOptions` uses the same names, less `ParentClosePolicy`, plus `IdConflictPolicy`, and takes `Id` and `TaskQueue` in its constructor (`Client/WorkflowOptions.cs:28-86`).

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, in `NexusWorkflowOperationOptions` (`Workflows/NexusWorkflowOperationOptions.cs:17-36`), the second argument of `ExecuteNexusOperationAsync`/`StartNexusOperationAsync`: `schedule_to_close_timeout` → `ScheduleToCloseTimeout`, `schedule_to_start_timeout` → `ScheduleToStartTimeout`, `start_to_close_timeout` → `StartToCloseTimeout`, which bounds an async operation after its start. Its `CancellationType` belongs to [detach](./detach.md) alone.

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```csharp
var billing = Workflow.CreateNexusWorkflowClient<IBillingService>("BillingEndpoint");
var paymentResult = await billing.ExecuteNexusOperationAsync(
    svc => svc.ChargePayment(payment), new() { ScheduleToCloseTimeout = TimeSpan.FromHours(1) });
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

One static options object beside the definition is that rule. A call with its own `options:` copies it with `Clone()` (`Workflows/ActivityOptions.cs:126`, a shallow copy) and assigns the keys it overrides, a nested block as a whole new object:

```csharp
public static readonly ActivityOptions ChargeCardDefaults = new()
{
    StartToCloseTimeout = TimeSpan.FromSeconds(30),
    RetryPolicy = new() { MaximumAttempts = 5 },
};

var receipt = await Workflow.ExecuteActivityAsync(() => Activities.ChargeCard(card, amount), ChargeCardDefaults);

var tipOptions = (ActivityOptions)ChargeCardDefaults.Clone();
tipOptions.RetryPolicy = new() { MaximumAttempts = 1 };
var tip = await Workflow.ExecuteActivityAsync(() => Activities.ChargeCard(card, tipAmount), tipOptions);
```

Never assign through the copy's nested object (`tipOptions.RetryPolicy.MaximumAttempts = 1`): the shallow copy shares it with the defaults.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `IdReusePolicy = WorkflowIdReusePolicy.AllowDuplicate`; `workflow_id_conflict_policy` → `IdConflictPolicy = WorkflowIdConflictPolicy.UseExisting`. Both enums come from `Temporalio.Api.Enums.V1` (`Api/Enums/V1/Workflow.cs:112,146`), which also declares a `ParentClosePolicy`: a file using both namespaces qualifies it as `Temporalio.Workflows.ParentClosePolicy`. Where each lands depends on the start kind:

- **Client start** (sync nexus body, async operation, client code): both, on the client's `WorkflowOptions` (`Client/WorkflowOptions.cs:77,86`), from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `Fail` throws `WorkflowAlreadyStartedException` (`Client/TemporalClient.Workflow.cs:154`). Update-with-start requires a conflict policy (`:199`); supply one when the type declares none.
- **Child start**: `ChildWorkflowOptions` has no conflict policy, so it takes the reuse policy only; a start onto a running ID throws `WorkflowAlreadyStartedException` from the start (`Worker/WorkflowInstance.cs:2705-2712`).

## Timeouts and retries

`temporal-developer` `references/dotnet/error-handling.md` § Timeout Configuration, § Retry Configuration.
