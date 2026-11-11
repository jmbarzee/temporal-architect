# await all

```twf
await all:
	activity Count(items) -> count
	workflow Audit(items) -> audited
```

```swift
let count = Slot<Int>()
let audited = Slot<Bool>()
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask {
        count.value = try await context.executeActivity(
            BatchActivities.Activities.Count.self,
            options: .init(startToCloseTimeout: .seconds(60), cancellationType: .abandon),
            input: input
        )
    }
    group.addTask {
        audited.value = try await context.executeChildWorkflow(
            Audit.self, options: .init(cancellationType: .abandon), input: input)
    }
    for try await _ in group {}
}
```

- One task-group child per branch, whatever its kind, each call with `cancellationType: .abandon`; a result goes in a `Slot`, the corpus's one-field class beside `Flag`, read with `count.value!` once the group returns, as the corpus's [`Batch`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/swift/Workflows.swift) does. Structured concurrency in workflows: DocC [`Workflow-Concurrency.md` § Use Structured Concurrency patterns](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-structured-concurrency-patterns).
- `for try await _ in group {}` takes the children in the order they finish and rethrows the first failure (Swift 6.2 `stdlib/public/Concurrency/TaskGroup.swift:666-671,1012-1055`), so the first branch to fail fails the `await all` at once, with that failure (spec 06). When two fail, the first to finish surfaces: the one that failed in the earlier workflow task, and within one task the one whose resolution job comes first, since the instance resumes jobs in order and the executor runs them first in, first out (`Temporal/Worker/Workflow/WorkflowInstance.swift:334-414`, `Temporal/Worker/Workflow/WorkflowTaskExecutor.swift:38-77`).
- Not an `async let` per branch and one `try await (a, b)`: the tuple's elements are awaited left to right, so a later branch's failure waits for every earlier branch, and the throw then cancels and awaits the rest ([SE-0317 § Implicit `async let` awaiting](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0317-async-let.md#implicit-async-let-awaiting)). Not `group.waitForAll()`: it rethrows the first failure only once every child has finished (`TaskGroup.swift:646-663`), so a sibling that retries forever holds the failure forever.
- The throw leaves the group, which cancels and then awaits the children still running (`TaskGroup.swift:198-201`). `.abandon` keeps that cancel inside the worker: sdk-core resolves the call as cancelled at once and sends no cancel request (sdk-core `crates/sdk-core/src/worker/workflow/machines/activity_state_machine.rs:47-62,191-194`, `child_workflow_state_machine.rs:734-749` at `6e90e6d`), so the group returns at once and the activity or child runs on until the run ends, a child then meeting `parent_close_policy` ([options.md](./options.md)). The defaults, `.tryCancel` and `.waitCancellationCompleted` (`Temporal/Worker/Workflow/ActivityOptions.swift:85`, `Temporal/Worker/Workflow/ChildWorkflowOptions.swift:132`), would request the cancel, and the child's would hold the group until the child closed.
- Left unrouted, the failure fails the run from `run` or a [signal handler](./signal-handler.md) ([close.md](./close.md)); from an [update handler](./update-handler.md) it fails only that update, and the run goes on (`Temporal/Worker/Workflow/WorkflowInstance.swift:898-920`). [`corpus/failure/swift/Job.swift`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/swift/Job.swift) is the worked example; its `JobTests` asserts both, with `Process` still running and never asked to cancel.
- A `detach` branch is its start, `startChildWorkflow`, done once the child has started ([detach.md](./detach.md)).
- A `nexus` branch is unsupported ([nexus.md](./nexus.md)).

## Partial: a branch still running stops at its call

Swift cannot leave a child task running past its scope: leaving the scope cancels and awaits it, and only a non-child task escapes that ([SE-0317 § Implicit `async let` awaiting](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0317-async-let.md#implicit-async-let-awaiting), `TaskGroup.swift:198-201`), which a workflow never starts ([promise.md](./promise.md)). `.abandon` keeps each branch's call running, as spec 06 requires, but the branch's own task is cancelled: statements after that call never run, an inline timer branch is cancelled (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:85-103`, history records `TimerCanceled`), and a signal or update branch stops waiting. From `run` or a signal handler the run is failing anyway, so only that `TimerCanceled` shows; from an update handler the run goes on without them. And as for losing `await one` cases, an external cancel of the run abandons the branch calls rather than requesting their cancel ([await-one.md](./await-one.md#notes)).

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
                options: .init(startToCloseTimeout: .seconds(60), cancellationType: .abandon),
                input: item
            )
        }
    }
    for try await _ in group {}
}
```

A task group's children start in the order they are added ([`Workflow-Concurrency.md` § Use Structured Concurrency patterns](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-structured-concurrency-patterns)); the failure, the two-failure order and the partial are as above.
