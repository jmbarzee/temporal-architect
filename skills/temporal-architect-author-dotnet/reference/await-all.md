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
var pending = new List<Task> { inventory, payment };
while (pending.Count > 0)
{
    var done = await Workflow.WhenAnyAsync(pending);
    pending.Remove(done);
    await done; // rethrows a failed branch's failure at once
}
// then `await inventory`, `await payment` for the results
```

- One `Workflow.WhenAnyAsync` loop over every branch's `Task`, whatever its kind (`Workflows/Workflow.cs:1448`); each result comes from awaiting its own `Task` after, as the corpus's `Batch` does.
- The loop throws at the first branch failure, with that failure, and cancels nothing: the other branches keep running, as spec 06 requires. When two fail, the first to fail surfaces: `WhenAny` resolves to the first task to complete, or the first listed of those already complete (dotnet/runtime v10.0.0 `Threading/Tasks/TaskFactory.cs:2336-2383`; two tasks, `Threading/Tasks/Task.cs:6611-6620`). The corpus's `JobTests` asserts the rule in the main body and in an [update handler](./update-handler.md).
- Never `Workflow.WhenAllAsync`: it is `Task.WhenAll` (`Workflows/Workflow.cs:1486-1516`), which completes only once every branch has finished (`Threading/Tasks/Task.cs:6146,6433`), so a failure waits on the slowest branch. Never `Task.WhenAll` either: `temporal-developer` `references/dotnet/gotchas.md` § Task.WhenAll / Task.WhenAny.
- A `detach` call's branch is its `StartChildWorkflowAsync` / `StartNexusOperationAsync`, which resolves once the call has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```csharp
var pending = items.Select(item =>
    Workflow.ExecuteActivityAsync(() => Activities.ProcessBatchItem(item), Options)).ToList();
while (pending.Count > 0)
{
    var done = await Workflow.WhenAnyAsync(pending);
    pending.Remove(done);
    await done;
}
```

`ToList()` starts every branch before the loop. For a result per item, keep a copy of the list and await each `Task` after the loop.
