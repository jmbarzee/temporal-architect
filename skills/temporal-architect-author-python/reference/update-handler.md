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

```python
@workflow.update(
    name="ChangePlan",
    unfinished_policy=workflow.HandlerUnfinishedPolicy.ABANDON,
    description="Switches the subscription plan",
)
async def change_plan(self, new_plan: str) -> ChangeResult:
    validation = await workflow.execute_activity(
        validate_plan, new_plan, start_to_close_timeout=timedelta(minutes=1)
    )
    if validation.valid:
        self.plan = new_plan
        return ChangeResult(success=True, plan=self.plan)
    return ChangeResult(success=False, error=validation.reason)
```

- `@workflow.update(name=…)` (`temporalio/workflow/_handlers.py:302`); params map positionally, as for a [signal](./signal-handler.md).
- Unlike a query, the handler may `await` activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last `await`: `self.reviews.add(note); return self.status` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival.
- Options: `description` and `unfinished_policy`, mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in Python (`@change_plan.validator`). Validators, and finishing handlers before the workflow returns or continues as new: `temporal-developer` `references/python/patterns.md` § Updates, § Waiting for All Handlers to Finish.
