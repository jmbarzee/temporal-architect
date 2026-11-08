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
- `gather` raises at the first failure; the other branches keep running. To cancel them, pass tasks and `.cancel()` the rest on failure.
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
