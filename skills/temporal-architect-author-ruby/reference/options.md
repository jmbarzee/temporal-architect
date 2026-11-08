# options

Option keys map to keyword arguments of the call itself. A duration is a number of seconds, `Float` or `Integer` (`2m` → `120`): every timeout, interval and timer in the SDK takes seconds (`workflow.rb:141-148,394,421-424`, `retry_policy.rb:40-44`). `retry_policy:` → `Temporalio::RetryPolicy.new(...)` (`retry_policy.rb:47-55`): `initial_interval` → `initial_interval:`, `backoff_coefficient` → `backoff_coefficient:`, `maximum_interval` → `max_interval:` (renamed), `maximum_attempts` → `max_attempts:` (renamed; `0`, the default, is unlimited), `non_retryable_error_types` → `non_retryable_error_types:`. `priority:` → `Temporalio::Priority.new(priority_key:, fairness_key:, fairness_weight:)`, the same names (`priority.rb:80`).

**Options live on the call, not on a stub.** Each `execute_activity`, `execute_child_workflow` or `start_operation` call carries its own keywords; calls sharing options splat one frozen `Hash` ([below](#definition-level-default_options)).

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

```ruby
result = Temporalio::Workflow.execute_activity(
  UnreliableService, data,
  start_to_close_timeout: 120,
  retry_policy: Temporalio::RetryPolicy.new(max_attempts: 5, initial_interval: 1, backoff_coefficient: 2.0, max_interval: 60)
)
```

`Workflow.execute_activity` (`workflow.rb:172-189`) must get `start_to_close_timeout:` or `schedule_to_close_timeout:`, else it raises `ArgumentError` (`internal/worker/workflow_instance/outbound_implementation.rb:62-64`). With no `options:` anywhere, the call still sets `start_to_close_timeout:`.

| TWF | `Workflow.execute_activity` keyword |
|-----|---------------------------|
| `task_queue` | `task_queue:` |
| `schedule_to_close_timeout` | `schedule_to_close_timeout:` |
| `schedule_to_start_timeout` | `schedule_to_start_timeout:` |
| `start_to_close_timeout` | `start_to_close_timeout:` |
| `heartbeat_timeout` | `heartbeat_timeout:` |
| `retry_policy` | `retry_policy:` |
| `priority` | `priority:` |
| `request_eager_execution: false` | `disable_eager_execution: true` (inverted, renamed; default `false`, `workflow.rb:185`; sent as `do_not_eagerly_execute`, `outbound_implementation.rb:86`) |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```ruby
child_result = Temporalio::Workflow.execute_child_workflow(
  ChildWorkflow, input.data,
  execution_timeout: 3600,
  parent_close_policy: Temporalio::Workflow::ParentClosePolicy::REQUEST_CANCEL,
  retry_policy: Temporalio::RetryPolicy.new(max_attempts: 3)
)
```

| TWF | `Workflow.execute_child_workflow` / `start_child_workflow` keyword (`workflow.rb:199-221,444-466`) |
|-----|------------------------|
| `task_queue` | `task_queue:` |
| `workflow_execution_timeout` | `execution_timeout:` (`workflow_` dropped) |
| `workflow_run_timeout` | `run_timeout:` (`workflow_` dropped) |
| `workflow_task_timeout` | `task_timeout:` (`workflow_` dropped) |
| `workflow_id_reuse_policy` | `id_reuse_policy:` ([below](#workflow-id-policies)) |
| `retry_policy` | `retry_policy:` |
| `priority` | `priority:` |
| `parent_close_policy` | `parent_close_policy:` `Temporalio::Workflow::ParentClosePolicy::TERMINATE`, `REQUEST_CANCEL` or `ABANDON` (`workflow/parent_close_policy.rb:12-16`); the keyword defaults to `TERMINATE` (`workflow.rb:453`), the spec's default |

A client start, `Client#start_workflow` (`client.rb:321-341`), takes the same keywords less `parent_close_policy:`, plus `id:` and `task_queue:` (both required) and `id_conflict_policy:`.

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, keywords of `execute_operation` and `start_operation` in seconds (`workflow/nexus_client.rb:41-52,74-85`): `schedule_to_close_timeout` → `schedule_to_close_timeout:`, `schedule_to_start_timeout` → `schedule_to_start_timeout:`, `start_to_close_timeout` → `start_to_close_timeout:`. `start_to_close_timeout:` bounds an async operation after its start (`:33-34`). The call's `cancellation_type:` belongs to [detach](./detach.md) alone; Nexus is experimental ([nexus.md](./nexus.md)).

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```ruby
billing = Temporalio::Workflow.create_nexus_client(endpoint: 'BillingEndpoint', service: 'BillingService')
payment_result = billing.execute_operation('ChargePayment', payment, schedule_to_close_timeout: 3600)
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

One frozen `Hash` constant beside the definition is that rule. Every call splats it; a call with its own `options:` writes its keys after the splat, a nested block as a whole new object:

```ruby
class ChargeCard < Temporalio::Activity::Definition
  DEFAULTS = {
    start_to_close_timeout: 30,
    retry_policy: Temporalio::RetryPolicy.new(max_attempts: 5)
  }.freeze

  def execute(card, amount)
    # ...
  end
end

# In the workflow:
receipt = Temporalio::Workflow.execute_activity(ChargeCard, card, amount, **ChargeCard::DEFAULTS)
tip = Temporalio::Workflow.execute_activity(
  ChargeCard, card, tip_amount,
  **ChargeCard::DEFAULTS, retry_policy: Temporalio::RetryPolicy.new(max_attempts: 1)
)
```

Never build the override's nested block from the default's (`ChargeCard::DEFAULTS[:retry_policy].with(max_attempts: 1)`): that merges field by field.

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `id_reuse_policy: Temporalio::WorkflowIDReusePolicy::ALLOW_DUPLICATE`; `workflow_id_conflict_policy` → `id_conflict_policy: Temporalio::WorkflowIDConflictPolicy::USE_EXISTING` (`common_enums.rb:9-39`). Where each lands depends on the start kind:

- **Client start** (client code): both, as keywords of `Client#start_workflow`, from the type's start-options method ([workflow-def.md](./workflow-def.md#id_scheme)). `id_conflict_policy:` defaults to `UNSPECIFIED`, which fails the start, and a conflict raises `Temporalio::Error::WorkflowAlreadyStartedError` (`client.rb:298-301,319`).
- **Child start**: `start_child_workflow` has no conflict policy, so it takes the reuse policy only, defaulting to `ALLOW_DUPLICATE` (`workflow.rb:457`); a start onto a running ID raises `Temporalio::Error::WorkflowAlreadyStartedError` in the parent (`workflow.rb:440`).

## Worker options

A namespace worker's `options:` map in [worker.md](./worker.md#worker-options).

## Timeouts and retries

`temporal-developer` `references/ruby/error-handling.md` § Retry Policy Configuration, § Timeout Configuration.
