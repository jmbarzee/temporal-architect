# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```ts
const billing = createNexusServiceClient({ endpoint: 'BillingEndpoint', service: BillingService });
const [inventory, payment] = await Promise.all([
  ReserveInventory(order),
  billing.executeOperation('ChargePayment', order.payment),
]);
```

- One `Promise.all` over every branch's promise, whatever its kind; the results destructure in branch order.
- `Promise.all` rejects at the first failure; the other branches keep running. To cancel them, run the branches in a `CancellationScope` and cancel it on failure (`temporal-developer` `references/typescript/patterns.md` § Cancellation Scopes).
- A `detach` call's branch is its `startChild` / `startOperation`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```ts
await Promise.all(items.map((item) => ProcessBatchItem(item)));
```
