# options

Option keys map to the call's keyword arguments, mostly by the same name, and a duration to a `timedelta` (`2m` → `timedelta(minutes=2)`):

- `retry_policy:` → `retry_policy=RetryPolicy(initial_interval=, backoff_coefficient=, maximum_interval=, maximum_attempts=, non_retryable_error_types=)` (`temporalio/common.py:37`).
- `priority:` → `priority=Priority(priority_key=, fairness_key=, fairness_weight=)` (`temporalio/common.py:1143`).
- `request_eager_execution` has no per-call form. Eager dispatch is worker-wide and inverted: `Worker(disable_eager_activity_execution=…)` on the worker running the calling workflow (`temporalio/worker/_worker.py:139`). `true` is the default and maps to nothing; `false` maps to `disable_eager_activity_execution=True`, which turns eager dispatch off for every call that worker's workflows make, so tell the user when its calls disagree.

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

```python
result = await workflow.execute_activity(
    unreliable_service,
    data,
    start_to_close_timeout=timedelta(minutes=2),
    retry_policy=RetryPolicy(
        maximum_attempts=5,
        initial_interval=timedelta(seconds=1),
        backoff_coefficient=2.0,
        maximum_interval=timedelta(seconds=60),
    ),
)
```

Options belong to each `execute_activity` call (`temporalio/workflow/_activities.py:482`): `task_queue`, `schedule_to_close_timeout`, `schedule_to_start_timeout`, `start_to_close_timeout`, `heartbeat_timeout`, `retry_policy`, `priority`. Every call needs `start_to_close_timeout` or `schedule_to_close_timeout`, or the schedule raises (`temporalio/worker/_workflow_instance.py:2092`); with no `options:`, set `start_to_close_timeout`.

## Child workflow options

```twf
workflow ChildWorkflow(input.data) -> childResult
	options:
		workflow_execution_timeout: 1h
		parent_close_policy: REQUEST_CANCEL
		retry_policy:
			maximum_attempts: 3
```

```python
child_result = await workflow.execute_child_workflow(
    ChildWorkflow.run,
    input.data,
    execution_timeout=timedelta(hours=1),
    parent_close_policy=ParentClosePolicy.REQUEST_CANCEL,
    retry_policy=RetryPolicy(maximum_attempts=3),
)
```

`start_child_workflow`/`execute_child_workflow` take them as keyword arguments (`temporalio/workflow/_workflow_ops.py:314`), the `workflow_` prefix dropped: `task_queue`, `workflow_execution_timeout` → `execution_timeout`, `workflow_run_timeout` → `run_timeout`, `workflow_task_timeout` → `task_timeout`, `workflow_id_reuse_policy` → `id_reuse_policy`, `retry_policy`, `priority`, `parent_close_policy`. `ParentClosePolicy` is `TERMINATE` (default), `REQUEST_CANCEL` or `ABANDON`.

## Nexus operation options

A `nexus` call's options are exactly its three timeouts, keyword arguments of `execute_operation`/`start_operation` (`temporalio/workflow/_nexus.py:104`): `schedule_to_close_timeout`, `schedule_to_start_timeout`, and `start_to_close_timeout`, which bounds an async operation after its start.

```twf
nexus BillingEndpoint BillingService.ChargePayment(payment) -> paymentResult
	options:
		schedule_to_close_timeout: 1h
```

```python
billing = workflow.create_nexus_client(service=BillingService, endpoint="BillingEndpoint")
payment_result = await billing.execute_operation(
    BillingService.charge_payment, payment, schedule_to_close_timeout=timedelta(hours=1)
)
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

A module-level `workflow.ActivityConfig` beside the definition (`temporalio/workflow/_activities.py:86`), unpacked with `**` at each call, is that rule: a dict merge replaces a key, and the nested `RetryPolicy` with it. A child's is a `workflow.ChildWorkflowConfig` (`temporalio/workflow/_workflow_ops.py:163`).

```python
charge_card_defaults: workflow.ActivityConfig = {
    "start_to_close_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(maximum_attempts=5),
}

receipt = await workflow.execute_activity(charge_card, args=[card, amount], **charge_card_defaults)
tip_options: workflow.ActivityConfig = {**charge_card_defaults, "retry_policy": RetryPolicy(maximum_attempts=1)}
tip = await workflow.execute_activity(charge_card, args=[card, tip_amount], **tip_options)
```

## Workflow ID policies

```twf
workflow Cart(customerId: string):
	id_scheme: "cart-{customerId}"
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_conflict_policy: USE_EXISTING
```

`workflow_id_reuse_policy` → `id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE`; `workflow_id_conflict_policy` → `id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING` (`temporalio/common.py:111,131`). Where each lands depends on the start kind:

- **Client start** (sync nexus body, async operation, client code): both, from the type's start-options function ([workflow-def.md](./workflow-def.md#id_scheme)). A conflict under `FAIL` raises `WorkflowAlreadyStartedError` (`temporalio/client/_impl.py:197`). Update-with-start requires a conflict policy (`WithStartWorkflowOperation` raises on `UNSPECIFIED`, `temporalio/client/_workflow.py:1205`); supply one when the type declares none.
- **Child start**: `start_child_workflow` has no `id_conflict_policy`, so it takes the reuse policy only; a start onto a running ID raises `WorkflowAlreadyStartedError` (`temporalio/worker/_workflow_instance.py:991`).

## Timeouts and retries

`temporal-developer` `references/python/error-handling.md` § Timeout Configuration, § Retry Policy Configuration.
