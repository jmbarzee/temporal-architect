# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```java
BillingService billing = Workflow.newNexusServiceStub(BillingService.class, BILLING_OPTIONS); // endpoint: nexus.md
Promise<Inventory> inventory = Async.function(activities::reserveInventory, order);
Promise<Payment> payment = Async.function(billing::chargePayment, order.payment());
Promise.allOf(inventory, payment).get();
```

- One `Promise.allOf(…).get()` over every branch's [promise](./promise.md), whatever its kind (`workflow/Promise.java:159`); each result is then its promise's `get()`, as the corpus's `Batch` reads `count.get()`.
- `allOf` fails at the first failure (`workflow/Promise.java:145-147`); the other branches keep running. To cancel them, start the branches in a `CancellationScope` and cancel it on failure (`temporal-developer` `references/java/patterns.md` § Cancellation Scopes).
- A `detach` call's branch is its start promise, `Workflow.getWorkflowExecution(child)`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```java
List<Promise<Void>> branches = new ArrayList<>();
for (Item item : items) {
  branches.add(Async.procedure(activities::processBatchItem, item));
}
Promise.allOf(branches).get();
```

`Promise.allOf(Iterable)` (`workflow/Promise.java:151`); `Async.procedure` for a `void` method (`workflow/Async.java:135`).
