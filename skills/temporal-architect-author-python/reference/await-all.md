# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```python
billing = workflow.create_nexus_client(service=BillingService, endpoint="BillingEndpoint")
inventory, payment = await asyncio.gather(
    workflow.execute_activity(reserve_inventory, order, start_to_close_timeout=timedelta(minutes=1)),
    billing.execute_operation(BillingService.charge_payment, order.payment),
)
```

- One `asyncio.gather` over every branch's awaitable, whatever its kind; the results unpack in branch order (`temporal-developer` `references/python/patterns.md` § Parallel Execution).
- `gather` raises at the first branch failure, with that failure, as spec 06 asks. When two fail, the one that fails first surfaces and the later is only marked retrieved (CPython 3.13 `asyncio/tasks.py:824-827,839-841`). Never cancel the branches still running: they end with the run.
- That failure is a `FailureError` (`ActivityError`, `ChildWorkflowError`, `NexusOperationError`). Unrouted, it fails the run in the body or a signal handler (`temporalio/worker/_workflow_instance.py:2887-2889`), and only the update in an update handler (`:764-776`).
- Never use `asyncio.TaskGroup`: it raises a `BaseExceptionGroup` (CPython 3.13 `asyncio/taskgroups.py:173`), which is not a `FailureError`, so it fails the workflow task, which retries forever, instead of the run (`temporalio/worker/_workflow_instance.py:2024-2039`).
- A `detach` call's branch is its `start_child_workflow` / `start_operation`, which returns once the call has started.

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```python
await asyncio.gather(
    *(workflow.execute_activity(process_batch_item, item, start_to_close_timeout=timedelta(minutes=1)) for item in items)
)
```

- One `gather` over the generator, so a failure surfaces as in the fixed form.
