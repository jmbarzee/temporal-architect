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

```swift
@WorkflowUpdate(description: "Switches the subscription plan", unfinishedPolicy: .abandon)
mutating func changePlan(context: WorkflowContext<Self>, input: String) async throws -> ChangeResult {
    let validation = try await context.executeActivity(
        PlanActivities.Activities.ValidatePlan.self,
        options: .init(startToCloseTimeout: .seconds(60)),
        input: input
    )
    if validation.valid {
        plan = input
        return ChangeResult(success: true, plan: plan, error: nil)
    }
    return ChangeResult(success: false, plan: nil, error: validation.reason)
}
```

- A `@WorkflowUpdate` method with one `input`, after an optional `context:` (`TemporalMacros/WorkflowUpdateMacro.swift:51-65`), as for a [signal](./signal-handler.md); its return type is the caller's result.
- Unlike a query, it may be `async throws`, call activities, children and timers through `context`, and mutate workflow state. It cannot `close` the workflow.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last blocking call: `reviews.add(input); return status` ([await-signal.md](./await-signal.md)). The caller gets its result when the handler returns (`Temporal/Worker/Workflow/WorkflowInstance.swift:881-897`), before any waiter takes the arrival, as the corpus's `reviewAnsweredBeforeAWaiterTakesIt` asserts.
- Options: `description:` and `unfinishedPolicy:`, mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in Swift, `@WorkflowUpdate(validator:)` (`Temporal/Macros/WorkflowMacro.swift:180-190`). To finish in-flight handlers before the workflow returns or continues as new, `try await context.condition { context.allHandlersFinished }` (`Temporal/Worker/Workflow/WorkflowContext.swift:165-177`). Updates: DocC [`Developing-Workflows.md` § Define update handlers](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Developing-Workflows.md#define-update-handlers).
