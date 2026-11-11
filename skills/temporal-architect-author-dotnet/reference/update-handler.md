# update handler

```twf
update ChangePlan(newPlan: string) -> (ChangeResult):
	options:
		unfinished_policy: abandon
		description: "Switches the subscription plan"
	activity ValidatePlan(newPlan) -> validation
	if (validation.valid):
		plan = newPlan
		return ChangeResult{success: true, plan: plan}
	else:
		return ChangeResult{success: false, error: validation.reason}
```

```csharp
[WorkflowUpdate(UnfinishedPolicy = HandlerUnfinishedPolicy.Abandon, Description = "Switches the subscription plan")]
public async Task<ChangeResult> ChangePlanAsync(string newPlan)
{
    var validation = await Workflow.ExecuteActivityAsync(() => Activities.ValidatePlan(newPlan), Options);
    if (validation.Valid)
    {
        plan = newPlan;
        return new(true, plan, null);
    }
    return new(false, null, validation.Reason);
}
```

- A `[WorkflowUpdate]` method returning `Task<T>` (or `Task` for no result) on the workflow class; params map positionally, as for a [signal](./signal-handler.md).
- Unlike a query, the handler may `await` activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- A `FailureException` the handler leaves uncaught, such as an `await all` branch's, fails only this update, and the run goes on (`Worker/WorkflowInstance.cs:1460-1472`).
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last `await`: `reviews.Add(note); return Task.FromResult(status);` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival.
- Options: `Description` and `UnfinishedPolicy` on the attribute (`Workflows/WorkflowUpdateAttribute.cs:47,60`), mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in C# (`[WorkflowUpdateValidator]`). Validators, and finishing handlers before the workflow returns or continues as new: `temporal-developer` `references/dotnet/patterns.md` § Updates, § Waiting for All Handlers to Finish.
