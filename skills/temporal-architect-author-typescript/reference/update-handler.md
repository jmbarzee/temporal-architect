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

```ts
export const ChangePlan = defineUpdate<ChangeResult, [newPlan: string]>('ChangePlan');

// in the workflow function, before its first await:
setHandler(
  ChangePlan,
  async (newPlan) => {
    const validation = await ValidatePlan(newPlan);
    if (validation.valid) {
      plan = newPlan;
      return { success: true, plan };
    }
    return { success: false, error: validation.reason };
  },
  { unfinishedPolicy: HandlerUnfinishedPolicy.ABANDON, description: 'Switches the subscription plan' },
);
```

- `defineUpdate<Ret, [params]>(name)` (`workflow/src/workflow.ts`); params map positionally, as for a [signal](./signal-handler.md).
- Unlike a query, the handler may `await` activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last `await`: `reviews.add(note); return status;` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival.
- Options: `UpdateHandlerOptions {description, unfinishedPolicy}` (`workflow/src/interfaces.ts`), mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in TypeScript (the `validator` option). Validators, and finishing handlers before the workflow returns or continues as new: `temporal-developer` `references/typescript/patterns.md` § Updates, § Waiting for All Handlers to Finish.
