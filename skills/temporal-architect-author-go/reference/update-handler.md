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

```go
err := workflow.SetUpdateHandlerWithOptions(ctx, "ChangePlan",
    func(ctx workflow.Context, newPlan string) (ChangeResult, error) {
        var validation Validation
        err := workflow.ExecuteActivity(ctx, ValidatePlan, newPlan).Get(ctx, &validation)
        if err != nil {
            return ChangeResult{}, err
        }
        if validation.Valid {
            plan = newPlan
            return ChangeResult{Success: true, Plan: plan}, nil
        }
        return ChangeResult{Success: false, Error: validation.Reason}, nil
    },
    workflow.UpdateHandlerOptions{
        UnfinishedPolicy: workflow.HandlerUnfinishedPolicyAbandon,
        Description:      "Switches the subscription plan",
    },
)
if err != nil {
    return Result{}, err
}
```

- Unlike queries, the handler takes `workflow.Context` first, may call activities and other primitives, and may mutate workflow state. It cannot `close` the workflow. The caller blocks until it returns.
- Register at the very start of the workflow, before any blocking call.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's queue just before it returns: `reviews.add(note); return status, nil` ([await-signal.md](./await-signal.md)). The caller gets its result then, not when a waiter takes it, so never hand the arrival over by sending on a `workflow.Channel`: the send blocks the handler until something receives.
- `unfinished_policy: warn_and_abandon` → `HandlerUnfinishedPolicyWarnAndAbandon` (the SDK default; may be left unset); `abandon` → `HandlerUnfinishedPolicyAbandon`. `description` → `Description` — UI/CLI text, no runtime behavior (Experimental). These are the only two option keys TWF admits.
- The `.twf` has no validator; one is authored in Go (`UpdateHandlerOptions{Validator}`). Validators and finishing handlers before exit: `temporal-developer` `references/go/patterns.md` § Updates, § Waiting for All Handlers to Finish.
