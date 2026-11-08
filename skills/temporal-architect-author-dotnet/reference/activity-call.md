# activity call

```twf
activity ValidateOrder(order) -> validated
```

```csharp
var validated = await Workflow.ExecuteActivityAsync(
    (OrderActivities a) => a.ValidateOrderAsync(order),
    new() { StartToCloseTimeout = TimeSpan.FromMinutes(1) });
```

- The lambda names the activity method, and the SDK sends that method's wire name (`Workflows/Workflow.cs:654-662`, `Activities/ActivityDefinition.cs:234-241`): a static method is `() => Activities.Compose(name)`, an instance method `(OrderActivities a) => a.ValidateOrderAsync(order)`. The lambda is never invoked in the workflow, so the instance's dependencies stay on the worker.
- A failed activity throws `ActivityFailureException` from the `await`; let it propagate unless the `.twf` handles it.
- `ActivityOptions` is the required second argument ([options.md](./options.md)); calls sharing options share one static object.
- A `task_queue` with `{x}` parameters names one member of a worker family: set `TaskQueue` from the family's queue function with the workflow's inputs, and set `ScheduleToStartTimeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
