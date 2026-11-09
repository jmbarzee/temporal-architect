# await timer

```twf
await timer(5m)
```

```swift
try await context.sleep(for: .seconds(300))
```

- `context.sleep(for:summary:)` (`Temporal/Worker/Workflow/WorkflowContext.swift:310`) takes the `.twf` duration as a `Swift.Duration`, which has no minute or hour factory: `5m` is `.seconds(300)`. A variable duration passes straight through: `try await context.sleep(for: backoff)`. Never `Task.sleep`: DocC [`Workflow-Concurrency.md` § Use safe APIs for deterministic execution](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-safe-apis-for-deterministic-execution).
- A cancelled task throws `CanceledError` from it and cancels the timer (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:62-103`).
- As a `promise`, a timer is an `async let` at the binding; as an inline race case, a child task its round cancels when it loses ([await-one.md](./await-one.md)).
