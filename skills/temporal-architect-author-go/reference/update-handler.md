# update handler

## DSL

```twf
update ChangePlan(newPlan: string) -> (ChangeResult):
    activity ValidatePlan(newPlan) -> validation
    if (validation.valid):
        plan = newPlan
        return ChangeResult{success: true, plan: plan}
    else:
        return ChangeResult{success: false, error: validation.reason}
```

## Go

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
    workflow.UpdateHandlerOptions{},
)
if err != nil {
    return Result{}, err
}
```

## Notes

- Update handlers receive `workflow.Context` as first param (unlike queries) — they can call activities and use temporal primitives
- Update handlers can modify workflow state (unlike queries)
- The caller blocks until the handler returns
- Update handlers cannot call `close` — only the main workflow body can terminate the workflow
- Register updates at the very start of the workflow function, before any blocking calls

## Validators

- Set via `workflow.UpdateHandlerOptions{Validator: func(...) error{...}}` in `SetUpdateHandlerWithOptions`
- **Validators reject updates before History write.** If the validator returns an error, no events are recorded — the update "disappears." The caller receives an "Update failed" error
- **Handler errors are post-acceptance.** Once the validator passes (or is absent), `WorkflowExecutionUpdateAccepted` is written. If the handler then returns an error, `WorkflowExecutionUpdateCompleted` records the failure — but the acceptance event persists
- The validator function has the same parameter types as the handler but returns only `error`. It may optionally include or omit `workflow.Context` as the first parameter
- **Validators must not mutate workflow state** — no variable assignment, no scheduling activities, no side-effects. They may read workflow state
- **Validators must not block** — same restriction as query handlers
- A panic in a validator is treated as a rejection (equivalent to returning an error)

## Pitfalls

- **Missing validator.** The example above performs validation via an activity inside the handler — this is post-acceptance validation. To reject invalid updates without writing to History, add a validator
- **Handler lifetime vs workflow completion.** Default `HandlerUnfinishedPolicy` is `WarnAndAbandon` — if the workflow completes or calls Continue-As-New while an update handler is still running, the handler is abandoned and the caller receives `ServiceError` "workflow execution already completed"
- To avoid abandoned handlers, wait before exiting:
  ```go
  err = workflow.Await(ctx, func() bool { return workflow.AllHandlersFinished(ctx) })
  ```
- **Continue-As-New during handler execution.** The caller gets "workflow execution already completed." The update is lost. Drain handlers before CAN
