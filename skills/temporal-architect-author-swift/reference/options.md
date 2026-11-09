# options

Option keys map to properties of the SDK's options structs. A duration is a `Swift.Duration`, which has no minute or hour factory: `2m` → `.seconds(120)`, `500ms` → `.milliseconds(500)`. Initializer labels go in declaration order, and a property no initializer takes is set on a `var` copy.

`retry_policy:` → `RetryPolicy` (`Temporal/Client/WorkflowService/Model/Workflows/RetryPolicy.swift:71-77`), labels in this order: `initial_interval` → `initialInterval`, `backoff_coefficient` → `backoffCoefficient`, `maximum_interval` → `maximumInterval`, `maximum_attempts` → `maximumAttempts`, `non_retryable_error_types` → `nonRetryableErrorTypes` (renamed). Unset, `backoffCoefficient` and `maximumAttempts` are `0`: the server's default coefficient, and unlimited attempts (`:43,67`); `maximumAttempts` is sent as an `Int32` (`Temporal/Extensions/TemporalRetryPolicy+RetryPolicy.swift:21`).

`priority:` → `Priority(priorityKey:fairnessKey:fairnessWeight:)` (`Temporal/Client/WorkflowService/Model/Workflows/Priority.swift:79`): `priority_key` → `priorityKey` (`Int`), `fairness_key` → `fairnessKey`, `fairness_weight` → `fairnessWeight` (`Float`).

## Activity options

```twf
activity UnreliableService(data) -> result
	options:
		start_to_close_timeout: 2m
		schedule_to_start_timeout: 30s
		retry_policy:
			maximum_attempts: 5
			initial_interval: 1s
			backoff_coefficient: 2.0
			maximum_interval: 60s
```

```swift
var options = ActivityOptions(
    startToCloseTimeout: .seconds(120),
    retryPolicy: RetryPolicy(
        initialInterval: .seconds(1),
        backoffCoefficient: 2.0,
        maximumInterval: .seconds(60),
        maximumAttempts: 5
    )
)
options.scheduleToStartTimeout = .seconds(30)

let result = try await context.executeActivity(
    ServiceActivities.Activities.UnreliableService.self, options: options, input: data)
```

`ActivityOptions` (`Temporal/Worker/Workflow/ActivityOptions.swift:61-165`) has two initializers, one led by `startToCloseTimeout` and one by `scheduleToCloseTimeout` (`:184,225`), so every call sets one of them; with no `options:` anywhere, set `startToCloseTimeout`. Each field reaches the `ScheduleActivity` command (`Temporal/Extensions/ScheduleActivity+Proto.swift:33-60`).

| TWF | `ActivityOptions` |
|-----|---------------------------|
| `task_queue` | `taskQueue`; unset, the workflow's queue |
| `schedule_to_close_timeout` | `scheduleToCloseTimeout` |
| `schedule_to_start_timeout` | `scheduleToStartTimeout`: **in no initializer**, set on the `var` (`:115`) |
| `start_to_close_timeout` | `startToCloseTimeout` |
| `heartbeat_timeout` | `heartbeatTimeout` |
| `retry_policy` | `retryPolicy` |
| `priority` | `priority` |
| `request_eager_execution: false` | `disableEagerActivityExecution: true` (inverted, renamed; default `false`, `:77`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```swift
let childResult = try await context.executeChildWorkflow(
    ChildWorkflow.self,
    options: ChildWorkflowOptions(
        retryPolicy: RetryPolicy(maximumAttempts: 3),
        executionTimeout: .seconds(3600),
        parentClosePolicy: .requestCancel
    ),
    input: input.data
)
```

| TWF | `ChildWorkflowOptions` (`Temporal/Worker/Workflow/ChildWorkflowOptions.swift:188-205`) |
|-----|------------------------|
| `task_queue` | `taskQueue`; unset, the parent's queue |
| `workflow_execution_timeout` | `executionTimeout` (renamed) |
| `workflow_run_timeout` | `runTimeout` (renamed) |
| `workflow_task_timeout` | `taskTimeout` (renamed) |
| `workflow_id_reuse_policy` | `idReusePolicy` (renamed): `.allowDuplicate` (the default, `:198`), `.allowDuplicateFailedOnly`, `.rejectDuplicate` |
| `retry_policy` | `retryPolicy` |
| `priority` | `priority` |
| `parent_close_policy` | `parentClosePolicy`: `.terminate` (the default, `:197`), `.requestCancel` or `.abandon`, from `Api.Enums.V1.ParentClosePolicy` |

`ChildWorkflowOptions` also carries `id`, the full workflow ID from the type's `id_scheme:` ([workflow-call.md](./workflow-call.md)), and `cancellationType`, which belongs to [detach](./detach.md) alone. Each field reaches the start command (`Temporal/Extensions/ChildWorkflowOptions+Proto.swift:33-78`).

A client start is client code outside the design: a `.twf` client start needs Nexus ([nexus.md](./nexus.md)). Its `WorkflowOptions` (`Temporal/Client/WorkflowService/Model/Workflows/WorkflowOptions.swift:166-183`) takes `id` and `taskQueue` (both required), `retryPolicy`, `runTimeout`, `taskTimeout`, `priority`, `idReusePolicy` and `idConflictPolicy`, and spells the execution timeout **`executionTimeOut`**, capital `O` (`:170`). It has no `parentClosePolicy`.

## Nexus operation options

Unsupported: swift-temporal-sdk 1.5.0 has no Nexus call ([nexus.md](./nexus.md)).

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One `static let` beside the definition is that rule: on the activity's container, or on the workflow struct for a workflow's. Options are value types, so a call with its own `options:` copies the default into a `var` and sets the keys it overrides, a nested block as a whole new value:

```swift
// On PaymentActivities:
static let chargeCardDefaults = ActivityOptions(
    startToCloseTimeout: .seconds(30),
    retryPolicy: RetryPolicy(maximumAttempts: 5)
)

// In the workflow:
let receipt = try await context.executeActivity(
    PaymentActivities.Activities.ChargeCard.self,
    options: PaymentActivities.chargeCardDefaults,
    input: ChargeCardInput(card: card, amount: amount)
)

var tipOptions = PaymentActivities.chargeCardDefaults
tipOptions.retryPolicy = RetryPolicy(maximumAttempts: 1)
```

Never override one field of the default's nested block (`tipOptions.retryPolicy?.maximumAttempts = 1`): that merges field by field.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `idReusePolicy: .allowDuplicate`; `workflow_id_conflict_policy` → `idConflictPolicy: .useExisting` (`.fail`, `.useExisting`, `.terminateExisting`). Both enums are `Api.Enums.V1`'s. Where each lands depends on the start kind:

- **Client start** (client code outside the design): both, on the client's `WorkflowOptions` (`WorkflowOptions.swift:181-182`; unset, `.allowDuplicate` and `.fail`), from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)).
- **Child start**: `ChildWorkflowOptions` has no conflict policy, so it takes the reuse policy only; a start onto a running ID throws `WorkflowAlreadyStartedError` (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:368-370`).

## Worker options

A namespace worker's `options:` map in [worker.md](./worker.md#worker-options).

## Timeouts and retries

[`Examples/ErrorHandling`](https://github.com/apple/swift-temporal-sdk/tree/1.5.0/Examples/ErrorHandling) § Retry with Exponential Backoff.
