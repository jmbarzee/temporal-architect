# activity definition

```twf
activity ValidateOrder(order: Order) -> (ValidateResult):
	result = validate(order)
	return result
```

```swift
@ActivityContainer
struct OrderActivities {
    let validator: any Validator

    @Activity
    func validateOrder(input: Order) async throws -> ValidateResult {
        try await validator.validate(input)
    }
}
```

- An `@Activity` method of an `@ActivityContainer` struct, named as the `.twf` names it in lowerCamel (`validateOrder` registers `ValidateOrder`), else `@Activity(name: "…")` ([SKILL.md](../SKILL.md#wire-names)). The macro makes a nested definition per method, `OrderActivities.Activities.ValidateOrder`, which is what a workflow calls ([activity-call.md](./activity-call.md)), plus `allActivities` for registration (`TemporalMacros/ActivityContainerMacro.swift:119,157-158`).
- **One parameter at most** (`TemporalMacros/ActivityMacro.swift:39-42`): several `.twf` params are one `Codable, Sendable` struct whose fields are the params as named; none is a method with no parameter, and its definition's `Input` is `Void` (`TemporalMacros/ActivityContainerMacro.swift:50`). No DSL return type → no return clause.
- The container holds the activity's dependencies as stored properties; the worker process builds it with real ones, a test with fakes. One container may hold several activities.
- The `.twf` body is pseudocode — ask the user when the real logic is ambiguous.
- Cancellation reaches an activity only through heartbeats, as Swift task cancellation: DocC [`Implementing-Activities.md` § Handle activity heartbeating and cancellation](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Implementing-Activities.md#handle-activity-heartbeating-and-cancellation).

## Activity Implementation Pattern

Generate all four pieces:

1. **Container** — one stored property per external dependency; the worker registers an instance ([worker.md](./worker.md)).
2. **Activity methods** — thin translation: validate input, call the dependency, translate output.
3. **Protocols** — shaped by what the activities need, informed by the dependency map ([dependency-resolution.md](./dependency-resolution.md)).
4. **Concrete implementations** — the real library integration: client construction, request/response conversion, error handling.

Methods and protocols are mechanical; concrete implementations need the library knowledge from dependency resolution.
