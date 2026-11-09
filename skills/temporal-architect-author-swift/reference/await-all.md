# await all

```twf
await all:
	activity Count(items) -> count
	workflow Audit(items) -> audited
```

```swift
async let counted = context.executeActivity(
    BatchActivities.Activities.Count.self,
    options: .init(startToCloseTimeout: .seconds(60)),
    input: input
)
async let audited = context.executeChildWorkflow(Audit.self, input: input)
let (count, wasAudited) = try await (counted, audited)
```

- One `async let` per branch, whatever its kind ([promise.md](./promise.md)), then one `try await` over the tuple, as the corpus's [`Batch`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/swift/Workflows.swift) does. Structured concurrency in workflows: DocC [`Workflow-Concurrency.md` § Use Structured Concurrency patterns](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-structured-concurrency-patterns).
- The tuple is awaited element by element, so a failure surfaces when its element is reached; the throw then leaves the scope, which cancels and awaits the branches still running. To keep them running after a failure, bind them in an outer scope.
- A `detach` branch is its start, `startChildWorkflow`, done once the child has started ([detach.md](./detach.md)).

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    for item in items {
        group.addTask {
            try await context.executeActivity(
                BatchActivities.Activities.ProcessBatchItem.self,
                options: .init(startToCloseTimeout: .seconds(60)),
                input: item
            )
        }
    }
    try await group.waitForAll()
}
```

A task group's children start in the order they are added ([`Workflow-Concurrency.md` § Use Structured Concurrency patterns](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-structured-concurrency-patterns)); `group.waitForAll()` throws the first failure, and the group cancels the rest as it exits.
