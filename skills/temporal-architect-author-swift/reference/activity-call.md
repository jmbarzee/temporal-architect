# activity call

```twf
activity ValidateOrder(order) -> validated
```

```swift
let validated = try await context.executeActivity(
    OrderActivities.Activities.ValidateOrder.self,
    options: ActivityOptions(startToCloseTimeout: .seconds(60)),
    input: order
)
```

- `context.executeActivity(_:options:input:)` (`Temporal/Worker/Workflow/WorkflowContext.swift:496-507`) sends the definition's wire name and suspends the workflow until the result. It names the macro's nested definition, never calls the container's method, so the container and its dependencies stay on the worker. A `Void`-input activity drops `input:` (`:531`).
- `options:` is required and carries the call's options ([options.md](./options.md)): an `ActivityOptions` needs `startToCloseTimeout` or `scheduleToCloseTimeout`, one of which each initializer takes first (`Temporal/Worker/Workflow/ActivityOptions.swift:184,225`).
- Several `.twf` args are the definition's one input struct, built at the call: `input: ChargeCardInput(card: card, amount: amount)` ([activity-def.md](./activity-def.md)).
- A failed activity throws `ActivityError` (`Temporal/Errors/Failures/ActivityError.swift:16`), its `cause` the activity's own error; let it propagate unless the `.twf` handles it.
- Bound to a promise, the call is an `async let` at the binding, and its `try await` is the `await` ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: set `taskQueue` from the family's queue function with the workflow's inputs, and `scheduleToStartTimeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
