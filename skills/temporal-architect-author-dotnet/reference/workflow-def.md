# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```csharp
[Workflow]
public class ProcessOrder
{
    [WorkflowRun]
    public Task<Result> RunAsync(Order order) => Task.FromResult(new Result("done"));
}
```

A `[Workflow]` class named as the `.twf` names it, else `[Workflow("Name")]` ([SKILL.md](../SKILL.md#wire-names)), with one `[WorkflowRun]` method. Params are positional, one payload each; no DSL return type → `Task`; `-> (A, B)` → `Task<R>` of one positional record ([types.md](./types.md)). Workflow state is the class's fields, and a constructor that needs the run's params is `[WorkflowInit]` (`temporal-developer` `references/dotnet/dotnet.md` § Workflow Definition).

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```csharp
public static class Shipping
{
    public static string ShipItemId(string orderId, string itemId) => $"ship-{orderId}-{itemId}";
}
```

One static ID function per scheme, beside the workflow, taking one argument per hole. Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies, or backs a Nexus run operation, also gets one start-options function holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```csharp
public static WorkflowOptions OrderTrackerStartOptions(string orderId) =>
    new(OrderTrackerId(orderId), FulfillmentTaskQueue) { IdConflictPolicy = WorkflowIdConflictPolicy.UseExisting };

await client.StartWorkflowAsync((OrderTracker wf) => wf.RunAsync(orderId), OrderTrackerStartOptions(orderId));
```

`WorkflowOptions` is the client's (`Client/WorkflowOptions.cs:28`, `new(id, taskQueue)`); the run's args travel in the lambda.

## Determinism constraints

`temporal-developer` `references/dotnet/determinism.md` § Forbidden Operations in Workflows, `determinism-protection.md`, and `gotchas.md` § .NET Task Determinism; changing running workflows: `references/dotnet/versioning.md`.
