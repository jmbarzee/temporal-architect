# options

Option keys are flat key/value pairs on the call, after its first argument. A duration is seconds (`2m` → `120`; fractional allowed, `Workflow/Runner.pm:4402-4408`). `retry_policy:` → `Temporalio::Common::RetryPolicy->new(...)` with the `.twf` key names unchanged: `initial_interval`, `backoff_coefficient`, `maximum_interval`, `maximum_attempts`, `non_retryable_error_types` (`Common/RetryPolicy.pm:15-19`). `priority:` → `Temporalio::Common::Priority->new(priority_key =>, fairness_key =>, fairness_weight =>)` (`Common/Priority.pm:16-24`).

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

```perl
my $result = await Temporalio::Workflow::execute_activity('UnreliableService',
    args                   => [$data],
    start_to_close_timeout => 120,
    retry_policy           => Temporalio::Common::RetryPolicy->new(
        maximum_attempts    => 5,
        initial_interval    => 1,
        backoff_coefficient => 2,
        maximum_interval    => 60,
    ),
);
```

An unknown key dies with `Temporalio::Exception::Argument`, and the call needs `start_to_close_timeout` or `schedule_to_close_timeout` (`Workflow/Runner.pm:670-697`, `Common/Options.pm:51-56`). With no `options:` anywhere, the call still sets `start_to_close_timeout`.

| TWF | `execute_activity` key |
|-----|------------------------|
| `task_queue` | `task_queue` |
| `schedule_to_close_timeout` | `schedule_to_close_timeout` |
| `schedule_to_start_timeout` | `schedule_to_start_timeout` |
| `start_to_close_timeout` | `start_to_close_timeout` |
| `heartbeat_timeout` | `heartbeat_timeout` |
| `retry_policy` | `retry_policy` |
| `priority` | `priority` |
| `request_eager_execution: false` | not per call: the worker-wide `disable_eager_activity_execution => 1` (inverted, renamed; default `0`, `Worker.pm:104-109`), for every activity the worker's workflows schedule |

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```perl
my $child_result = await Temporalio::Workflow::execute_child_workflow('ChildWorkflow',
    args                => [$input->{data}],
    execution_timeout   => 3600,
    parent_close_policy => 'request_cancel',
    retry_policy        => Temporalio::Common::RetryPolicy->new(maximum_attempts => 3),
);
```

A child start **silently ignores an unknown key** (`Workflow/Runner.pm:1189-1267` reads only the keys it knows, with no check), so a misspelled key is dropped without error: check each key against this table. Enum values are lowercase strings (`Workflow/Runner.pm:4368-4397`).

| TWF | `start_child_workflow` key |
|-----|----------------------------|
| `task_queue` | `task_queue` (default the parent's, `:1216`) |
| `workflow_execution_timeout` | `execution_timeout` (renamed) |
| `workflow_run_timeout` | `run_timeout` (renamed) |
| `workflow_task_timeout` | `task_timeout` (renamed) |
| `workflow_id_reuse_policy` | `id_reuse_policy` (renamed): `allow_duplicate` (default), `allow_duplicate_failed_only`, `reject_duplicate`, `terminate_if_running` |
| `retry_policy` | `retry_policy` |
| `priority` | **unsupported**: a child start carries no priority |
| `parent_close_policy` | `parent_close_policy`: `terminate` (default), `request_cancel` or `abandon` |

A client start (`$client->start_workflow($wf, \@args, %opts)`, `Client.pm:202`) takes the same names plus `id_conflict_policy` and `priority`, requires `id` and `task_queue`, and dies on an unknown key (`Client.pm:493-518`).

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, keys of `execute_operation`/`start_operation` after the input (`Workflow/Runner.pm:1634-1643`): `schedule_to_close_timeout`, `schedule_to_start_timeout`, and `start_to_close_timeout`, which bounds an async operation after its start. Its `cancellation_type` belongs to [detach](./detach.md) alone. Unknown keys are ignored here too.

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```perl
my $billing = Temporalio::Workflow::create_nexus_client(
    endpoint => 'BillingEndpoint', service => 'BillingService');
my $payment_result = await $billing->execute_operation('ChargePayment', $payment,
    schedule_to_close_timeout => 3600);
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

One sub beside the definition returns the defaults as a key/value list, building fresh objects on each call. A call spreads it first and adds its overrides after: in a Perl list the later key wins, and a nested block is a whole new object.

```perl
# In BillingActivities.pm, inside the class block:
sub charge_card_options () {
    return (start_to_close_timeout => 30,
        retry_policy => Temporalio::Common::RetryPolicy->new(maximum_attempts => 5));
}

my $receipt = await Temporalio::Workflow::execute_activity('ChargeCard',
    args => [$card, $amount], BillingActivities::charge_card_options());

my $tip = await Temporalio::Workflow::execute_activity('ChargeCard',
    args => [$card, $tip_amount], BillingActivities::charge_card_options(),
    retry_policy => Temporalio::Common::RetryPolicy->new(maximum_attempts => 1));
```

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `id_reuse_policy => 'allow_duplicate'`; `workflow_id_conflict_policy` → `id_conflict_policy => 'use_existing'` (`fail`, `use_existing`, `terminate_existing`; `Client.pm:48-60`). Where each lands depends on the start kind:

- **Client start** (sync nexus body, async operation, client code): both, from the type's start-options sub ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `fail` dies with `Temporalio::Exception::WorkflowAlreadyStarted` (`Client.pm:199`).
- **Child start**: no conflict policy (a child start would drop the key), so it takes the reuse policy only; a start onto a running ID fails the start with `Temporalio::Exception::WorkflowAlreadyStarted` (`Workflow/Runner.pm:2589-2595`).

## Timeouts and retries

sdk-perl `README.md` § Invoking activities (`:591-615`) and § Workflow exceptions (`:763-827`).
