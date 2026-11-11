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

```java
// on the @WorkflowInterface:
@UpdateMethod(
    name = "ChangePlan",
    description = "Switches the subscription plan",
    unfinishedPolicy = HandlerUnfinishedPolicy.ABANDON)
ChangeResult changePlan(String newPlan);

// in the impl:
@Override
public ChangeResult changePlan(String newPlan) {
  Validation validation = activities.validatePlan(newPlan);
  if (validation.valid()) {
    plan = newPlan;
    return new ChangeResult(true, plan, null);
  }
  return new ChangeResult(false, null, validation.reason());
}
```

- `@UpdateMethod(name = …)` (`workflow/UpdateMethod.java:25`); params map positionally, one payload each, as for a [signal](./signal-handler.md) (`internal/sync/UpdateDispatcher.java:89`).
- Unlike a query, the handler may call activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- A `TemporalFailure` the handler leaves uncaught, such as an `await all` branch's, fails only this update, and the run goes on (`internal/sync/WorkflowExecutionHandler.java:136`, `internal/sync/SyncWorkflow.java:183-184`).
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last blocking call: `reviews.add(note); return status;` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival, as the corpus's `ApprovalTest` asserts.
- Options: `description` and `unfinishedPolicy`, mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in Java (`@UpdateValidatorMethod`). Validators, and finishing handlers before the workflow returns or continues as new: `temporal-developer` `references/java/patterns.md` § Updates, § Waiting for All Handlers to Finish.
