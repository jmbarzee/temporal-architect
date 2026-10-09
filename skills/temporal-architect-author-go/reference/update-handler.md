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
- `unfinished_policy: warn_and_abandon` → `HandlerUnfinishedPolicyWarnAndAbandon` (the SDK default; may be left unset); `abandon` → `HandlerUnfinishedPolicyAbandon`. `description` → `Description` — UI/CLI text, no runtime behavior (Experimental). These are the only two option keys TWF admits.

## Validators

The `validator` is authored in Go, not derived from the DSL: `UpdateHandlerOptions{Validator: func(...) error {...}}`.

- Same parameter types as the handler (the leading `workflow.Context` is optional), returns only `error`.
- **Rejects before History.** A validator error (or panic) records no events — the update disappears and the caller gets "Update failed". Once it passes (or is absent), `WorkflowExecutionUpdateAccepted` is written; a later handler error is recorded in `WorkflowExecutionUpdateCompleted`, and the acceptance persists. So validation inside the handler (the activity above) is post-acceptance — add a validator to reject without writing History.
- May read workflow state; must not mutate it, schedule activities, cause side effects, or block.

## Unfinished handlers

If the workflow completes or continues-as-new while a handler is still running, the handler is abandoned (the default policy warns) and the caller receives `serviceerror.NotFound` saying the workflow already completed — for CAN, the update is lost. Wait before exiting:

```go
err = workflow.Await(ctx, func() bool { return workflow.AllHandlersFinished(ctx) })
```
