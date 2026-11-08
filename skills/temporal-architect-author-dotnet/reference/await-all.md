# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```csharp
var billing = Workflow.CreateNexusWorkflowClient<IBillingService>("BillingEndpoint");
var inventory = Workflow.ExecuteActivityAsync(() => Activities.ReserveInventory(order), Options);
var payment = billing.ExecuteNexusOperationAsync(svc => svc.ChargePayment(order.Payment));
await Workflow.WhenAllAsync(inventory, payment);
// then `await inventory`, `await payment` for the results
```

- One `Workflow.WhenAllAsync` over every branch's `Task`, whatever its kind; each result comes from awaiting its own `Task` after. Branches of one result type → `Workflow.WhenAllAsync<T>`, whose array is in branch order.
- Never `Task.WhenAll`: `temporal-developer` `references/dotnet/gotchas.md` § Task.WhenAll / Task.WhenAny.
- `WhenAllAsync` is `Task.WhenAll` (`Workflows/Workflow.cs:1486-1496`): it completes once every branch has finished, even after one fails, and the `await` rethrows the first failure. To stop the others early, give the branches one linked `CancellationToken` and cancel it on failure (`temporal-developer` `references/dotnet/patterns.md` § Cancellation Handling (CancellationToken)).
- A `detach` call's branch is its `StartChildWorkflowAsync` / `StartNexusOperationAsync`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```csharp
await Workflow.WhenAllAsync(items.Select(item =>
    Workflow.ExecuteActivityAsync(() => Activities.ProcessBatchItem(item), Options)));
```
