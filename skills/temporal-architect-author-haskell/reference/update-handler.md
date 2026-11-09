# update handler

```twf
update ChangePlan(newPlan: string) -> (ChangeResult):
	activity ValidatePlan(newPlan) -> validation
	if (validation.valid):
		plan = newPlan
		return ChangeResult{success: true, plan: plan}
	else:
		return ChangeResult{success: false, reason: validation.reason}
```

```haskell
changePlanUpdate :: KnownUpdate '[Text] ChangeResult SomeException
changePlanUpdate = KnownUpdate JSON "ChangePlan"

-- in the workflow body:
setUpdateHandler
  changePlanUpdate
  ( \newPlan -> do
      validation <- executeActivity validatePlan validateOptions newPlan
      if validation.valid
        then do
          writeStateVar plan newPlan
          pure ChangeResult {success = True, plan = Just newPlan, reason = Nothing}
        else pure ChangeResult {success = False, plan = Nothing, reason = Just validation.reason}
  )
  Nothing
```

- A `KnownUpdate` value per update, its codec first: `KnownUpdate JSON "Name"` ([SKILL.md](../SKILL.md#wire-names)). Its type lists the params, mapped positionally as for a [signal](./signal-handler.md), then the result type, then the validator's error type (`Workflow/Update.hs:11-17`); with no validator, `SomeException`.
- `setUpdateHandler ref handler validator` registers it in the workflow body (`Workflow.hs:1295-1307`). Unlike a query, the handler is a `Workflow`: it may call activities, children and timers and write `StateVar`s. Its return value is the caller's result.
- If the design waits on the update (`await update`, an update case or promise), the handler adds the arrival to the update's `Arrivals` with `A.add` just before it returns, after its last blocking call, as the corpus's `reviewUpdate` handler does: `A.add reviews note >> readStateVar status` ([await-signal.md](./await-signal.md)). The SDK completes the update when the handler returns (`WorkflowInstance.hs:584-590,662-666`), so the caller has its result before any waiter takes the arrival.
- The `.twf` has no validator; one is authored in Haskell as `Just validator`, a function of the same params into `Validation (Either e ())`, run before the update is accepted (`Workflow.hs:1295-1306`, `WorkflowInstance.hs:595-643`).
- `description` and `unfinished_policy`: unsupported at the pin, as for a [signal](./signal-handler.md#handler-options). The SDK has no wait for running handlers before the workflow returns or continues as new, and its unfinished-handler checks are pending (`sdk/test/PendingFeaturesSpec.hs:59-64`).
