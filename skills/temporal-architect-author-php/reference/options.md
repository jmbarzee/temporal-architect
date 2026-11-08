# options

Option keys map to the `with*` methods of the SDK's options classes. Every options object is immutable: each `with*` returns a modified clone (`Activity/ActivityOptions.php:242-251`). A duration is an `int` of seconds or a `\DateInterval` (`2m` → `120`; `Internal/Support/DateInterval.php:61-90`). `retry_policy:` → `withRetryOptions(RetryOptions::new()…)` (`Common/RetryOptions.php:135-205`): `initial_interval` → `withInitialInterval`, `backoff_coefficient` → `withBackoffCoefficient`, `maximum_interval` → `withMaximumInterval`, `maximum_attempts` → `withMaximumAttempts`, `non_retryable_error_types` → `withNonRetryableExceptions` (renamed). That takes `Throwable` class names and sends them as the error types (`:193-205,221`), and an exception the activity throws carries its fully qualified class name as its type (`Exception/Failure/FailureConverter.php:166-169`), so list the classes that stand for the `.twf` types. `priority:` → `withPriority(Priority::new()…)` (`Common/Priority.php:89-135`): `priority_key` → `withPriorityKey`, `fairness_key` → `withFairnessKey`, `fairness_weight` → `withFairnessWeight`.

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

```php
$activities = Workflow::newActivityStub(
    ServiceActivities::class,
    ActivityOptions::new()
        ->withStartToCloseTimeout(120)
        ->withRetryOptions(
            RetryOptions::new()
                ->withMaximumAttempts(5)
                ->withInitialInterval(1)
                ->withBackoffCoefficient(2.0)
                ->withMaximumInterval(60),
        ),
);
$result = yield $activities->unreliableService($data);
```

`ActivityOptions` (`Activity/ActivityOptions.php:168-341`) belongs to the stub, so every call through one stub shares it. Set `withStartToCloseTimeout` or `withScheduleToCloseTimeout`: the server rejects an activity with neither. With no `options:` anywhere, the stub still sets a start-to-close timeout.

| TWF | `ActivityOptions` |
|-----|-------------------|
| `task_queue` | `withTaskQueue` |
| `schedule_to_close_timeout` | `withScheduleToCloseTimeout` |
| `schedule_to_start_timeout` | `withScheduleToStartTimeout` |
| `start_to_close_timeout` | `withStartToCloseTimeout` |
| `heartbeat_timeout` | `withHeartbeatTimeout` |
| `retry_policy` | `withRetryOptions` (renamed) |
| `priority` | `withPriority` |
| `request_eager_execution: false` | no per-call option: the worker's `WorkerOptions::withDisableEagerActivities()` (inverted, and per worker; `Worker/WorkerOptions.php:777`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```php
$child = Workflow::newChildWorkflowStub(
    ChildWorkflow::class,
    ChildWorkflowOptions::new()
        ->withWorkflowExecutionTimeout(3600)
        ->withParentClosePolicy(ParentClosePolicy::RequestCancel)
        ->withRetryOptions(RetryOptions::new()->withMaximumAttempts(3)),
);
$childResult = yield $child->run($input->data);
```

`ChildWorkflowOptions` (`Workflow/ChildWorkflowOptions.php:225-499`) keeps the `Workflow` prefix:

| TWF | `ChildWorkflowOptions` |
|-----|------------------------|
| `task_queue` | `withTaskQueue` |
| `workflow_execution_timeout` | `withWorkflowExecutionTimeout` |
| `workflow_run_timeout` | `withWorkflowRunTimeout` |
| `workflow_task_timeout` | `withWorkflowTaskTimeout` |
| `workflow_id_reuse_policy` | `withWorkflowIdReusePolicy` |
| `retry_policy` | `withRetryOptions` (renamed) |
| `priority` | `withPriority` |
| `parent_close_policy` | `withParentClosePolicy`: `ParentClosePolicy::Terminate` (default, `:139`), `RequestCancel` or `Abandon` (`Workflow/ParentClosePolicy.php:16-31`) |

A client start's `WorkflowOptions` uses the same names, less the parent-close policy, plus `withWorkflowIdConflictPolicy`, and sets `withWorkflowId` and `withTaskQueue` (`Client/WorkflowOptions.php:235-404`).

## Nexus operation options

Unsupported: PHP has no Nexus caller ([nexus.md](./nexus.md)).

## Definition-level `default_options:`

A `default_options:` block on an `activity` or `workflow` definition supplies defaults for every call of it; a call site's `options:` overrides per key, and a nested block (`retry_policy`, `priority`) replaces the default whole (`twf spec statement-syntax`, Definition Default Options). `parent_close_policy` is call-site only.

```twf
activity ChargeCard(card, amount) -> receipt
	default_options:
		start_to_close_timeout: 30s
		retry_policy:
			maximum_attempts: 5
```

One static method beside the definition returns that rule. A call with its own `options:` chains its keys onto it, a nested block as a whole new object; the clone leaves the defaults untouched:

```php
public static function chargeCardDefaults(): ActivityOptions
{
    return ActivityOptions::new()
        ->withStartToCloseTimeout(30)
        ->withRetryOptions(RetryOptions::new()->withMaximumAttempts(5));
}

$receipt = yield Workflow::newActivityStub(PaymentActivities::class, self::chargeCardDefaults())
    ->chargeCard($card, $amount);

$tipOptions = self::chargeCardDefaults()->withRetryOptions(RetryOptions::new()->withMaximumAttempts(1));
$tip = yield Workflow::newActivityStub(PaymentActivities::class, $tipOptions)->chargeCard($card, $tipAmount);
```

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `withWorkflowIdReusePolicy(IdReusePolicy::AllowDuplicate)`; `workflow_id_conflict_policy` → `withWorkflowIdConflictPolicy(WorkflowIdConflictPolicy::UseExisting)`, both enums in `Temporal\Common` (`Common/IdReusePolicy.php:20`, `Common/WorkflowIdConflictPolicy.php:21`). Where each lands depends on the start kind:

- **Client start** (client code): both, on the client's `WorkflowOptions`, from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `Fail` throws `WorkflowExecutionAlreadyStartedException` (`Internal/Client/WorkflowStarter.php:290-306`).
- **Child start**: `ChildWorkflowOptions` has no conflict policy, so it takes the reuse policy only.

## Worker options

A namespace worker's `options:` map onto `WorkerOptions`, field by field in [worker.md](./worker.md#worker-options--workeroptions): `max_concurrent_activity_executions` is `withMaxConcurrentActivityExecutionSize` and `worker_shutdown_timeout` is `withWorkerStopTimeout` (both renamed), and `max_cached_workflows` has no field: it is `.rr.yaml`'s `temporal.cache_size`, one value for the whole RoadRunner process.

## Timeouts and retries

`temporal-developer` [`error-handling.md` § Timeout Configuration](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/error-handling.md#timeout-configuration), [§ Retry Policy Configuration](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/error-handling.md#retry-policy-configuration).
