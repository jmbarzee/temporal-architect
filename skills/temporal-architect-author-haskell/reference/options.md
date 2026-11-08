# options

Option keys map to camelCase fields of the SDK's options records, set by record update on the default value. A duration is a `Temporal.Duration.Duration` (`2m` → `minutes 2`; `seconds`, `minutes`, `hours`, `milliseconds`, `Duration.hs:228-246`). `retry_policy:` → `Just defaultRetryPolicy { … }` (`Workflow.hs:1913-1920`; `RetryPolicy`, `Common.hs:179-217`): `initial_interval` → `initialInterval`, `backoff_coefficient` → `backoffCoefficient`, `maximum_interval` → `maximumInterval` (a `Maybe`), `maximum_attempts` → `maximumAttempts` (`0` is unlimited), `non_retryable_error_types` → `nonRetryableErrorTypes` (a `Vector Text`). `priority:` → `Just Priority { … }` (`Common.hs:306-321`): `priority_key` → `priorityKey`, `fairness_key` → `fairnessKey`, `fairness_weight` → `fairnessWeight`; `mkPriority k` sets the key alone (`Common.hs:350-351`).

**Qualify every options field you update.** `Temporal.Workflow` exports several records sharing field names (`taskQueue`, `retryPolicy`, `priority`, `cancellationType`, the timeouts), so an unqualified update is ambiguous: GHC 9.10 resolves it with a deprecation warning, an error under the corpus's `-Werror`. Import each record's fields under its own alias, as the cookbook's `temporal101/RetryPolicy.hs` does:

```haskell
import Temporal.Workflow
import Temporal.Workflow qualified as Activity (StartActivityOptions (..))
import Temporal.Workflow qualified as Child (StartChildWorkflowOptions (..))
import Temporal.Workflow qualified as NexusOp (ScheduleNexusOperationOptions (..))
import Temporal.Workflow qualified as Timeouts (TimeoutOptions (..))
```

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

```haskell
result <-
  executeActivity
    unreliableService
    (defaultStartActivityOptions (StartToClose (minutes 2)))
      { Activity.retryPolicy =
          Just
            defaultRetryPolicy
              { maximumAttempts = 5
              , initialInterval = seconds 1
              , backoffCoefficient = 2
              , maximumInterval = Just (seconds 60)
              }
      }
    dat
```

`StartActivityOptions` (`Workflow/Types.hs:72-93`) comes from `defaultStartActivityOptions`, whose required argument is the `ActivityTimeoutPolicy`: `StartToClose d`, `ScheduleToClose d`, or both as a pair (`Workflow/Types.hs:65-68,97-126,148-161`). With no `options:` anywhere, the call still passes `StartToClose`.

| TWF | `StartActivityOptions` |
|-----|------------------------|
| `start_to_close_timeout` | `defaultStartActivityOptions (StartToClose d)` |
| `schedule_to_close_timeout` | `defaultStartActivityOptions (ScheduleToClose d)`; with the above, `(StartToClose s, ScheduleToClose sc)` |
| `task_queue` | `taskQueue = Just q` |
| `schedule_to_start_timeout` | `scheduleToStartTimeout = Just d` |
| `heartbeat_timeout` | `heartbeatTimeout = Just d` |
| `retry_policy` | `retryPolicy = Just defaultRetryPolicy { … }` |
| `priority` | `priority = Just Priority { … }` |
| `request_eager_execution: false` | `disableEagerExecution = True` (inverted, renamed; default `False`, marked experimental, `Workflow/Types.hs:89-90`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```haskell
childResult <-
  executeChildWorkflow
    childWorkflow
    defaultChildWorkflowOptions
      { Child.timeoutOptions = defaultTimeoutOptions {Timeouts.executionTimeout = Just (hours 1)}
      , Child.parentClosePolicy = ParentClosePolicyRequestCancel
      , Child.retryPolicy = Just defaultRetryPolicy {maximumAttempts = 3}
      }
    input.dat
```

`StartChildWorkflowOptions` (`Workflow/Types.hs:232-247`) from `defaultChildWorkflowOptions` (`:275-295`) nests the workflow timeouts in `timeoutOptions` and drops the `Workflow` prefix:

| TWF | `StartChildWorkflowOptions` |
|-----|-----------------------------|
| `task_queue` | `taskQueue = Just q`; unset, the parent's (`Workflow.hs:707`) |
| `workflow_execution_timeout` | `timeoutOptions = defaultTimeoutOptions { executionTimeout = Just d }` (renamed) |
| `workflow_run_timeout` | `… { runTimeout = Just d }` (renamed) |
| `workflow_task_timeout` | `… { taskTimeout = Just d }` (renamed) |
| `workflow_id_reuse_policy` | `workflowIdReusePolicy = WorkflowIdReusePolicyAllowDuplicate` (not a `Maybe`) |
| `retry_policy` | `retryPolicy = Just defaultRetryPolicy { … }` |
| `priority` | `priority = Just Priority { … }` |
| `parent_close_policy` | `parentClosePolicy`: `ParentClosePolicyTerminate`, `ParentClosePolicyRequestCancel` or `ParentClosePolicyAbandon` (`Workflow/Types.hs:213-222`); the default `ParentClosePolicyUnspecified` takes the server's, `TERMINATE` |

**The child's `cancellationType` defaults to `ChildWorkflowCancellationAbandon`** (`Workflow/Types.hs:191-200,278`), not try-cancel: a cancelled parent never requests its children's cancellation. Set `Child.cancellationType = ChildWorkflowCancellationTryCancel` where the design expects a cancelled parent to cancel the child; [detach](./detach.md) keeps the default.

A client start's `StartWorkflowOptions` comes from `startWorkflowOptions taskQueue` and takes the same keys, less `parentClosePolicy`, with the timeouts in `timeouts`, both ID policies as `Maybe`s, and the workflow ID as the start's own argument (`Client/Types.hs:19-107`).

## Nexus operation options

A `nexus` call's options are `ScheduleNexusOperationOptions` (`Workflow/Types.hs:450-465`), the third argument of `executeNexusOperation`/`startNexusOperation`: `schedule_to_close_timeout` → `scheduleToCloseTimeout = Just d`. **`schedule_to_start_timeout` and `start_to_close_timeout` are unsupported at the pin**: the record has no field for them, and the schedule command carries only the schedule-to-close timeout (`Workflow.hs:557`). Its `cancellationType` belongs to [detach](./detach.md).

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```haskell
out <-
  executeNexusOperation
    (makeNexusClient "BillingEndpoint" "BillingService")
    "ChargePayment"
    defaultScheduleNexusOperationOptions {NexusOp.scheduleToCloseTimeout = Just (hours 1)}
    (encodeJSON payment)
paymentResult <- either error pure (decodeJSON out)
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

One named options value beside the definition is that rule. A call with its own `options:` updates it with the keys it overrides, a nested block as a whole new value:

```haskell
chargeCardOptions :: StartActivityOptions
chargeCardOptions =
  (defaultStartActivityOptions (StartToClose (seconds 30)))
    {Activity.retryPolicy = Just defaultRetryPolicy {maximumAttempts = 5}}

receipt <- executeActivity chargeCard chargeCardOptions card amount
tip <-
  executeActivity
    chargeCard
    chargeCardOptions {Activity.retryPolicy = Just defaultRetryPolicy {maximumAttempts = 1}}
    card
    tipAmount
```

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `WorkflowIdReusePolicyAllowDuplicate` (`Temporal.Workflow`); `workflow_id_conflict_policy` → `WorkflowIdConflictPolicyUseExisting` (`Temporal.Client`), both from `Common.hs:394-432`. Where each lands depends on the start kind:

- **Client start** (sync nexus body, client code): both, as `Just`s on `StartWorkflowOptions` (`Client/Types.hs:28,33`), from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)). A rejected start throws an `RpcError` (`Client.hs:637`).
- **Child start**: `StartChildWorkflowOptions` has no conflict policy, so it takes the reuse policy only; a start onto a running ID throws `WorkflowAlreadyStarted` from the start's wait (`WorkflowInstance.hs:804-822`).

## Timeouts and retries

[idioms.md § errors](./idioms.md#errors).
