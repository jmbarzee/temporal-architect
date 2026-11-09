# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```swift
let payment = paymentsReceived.begin()
try await withThrowingTaskGroup(of: Void.self) { group in
    let timer = Flag()
    group.addTask {
        try await context.sleep(for: .seconds(86_400))
        timer.isSet = true
    }
    try await context.condition { $0.paymentsReceived.ready(payment) || timer.isSet }
    if paymentsReceived.ready(payment) {  // listed first, so it wins a tie
        _ = paymentsReceived.claim()
        status = "processing"
    } else {
        paymentsReceived.leave(payment)
        try await context.executeActivity(
            OrderActivities.Activities.CancelOrder.self,
            options: .init(startToCloseTimeout: .seconds(60)),
            input: input
        )
        throw ApplicationError(
            message: "order cancelled",
            details: [try context.payloadConverter.convertValue(OrderResult(status: "cancelled"))],
            type: "OrderCancelled"
        )
    }
    group.cancelAll()  // a losing inline timer is cancelled
}
```

One `context.condition` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Swift needs no opt-in for this shape: sdk-core orders every activation's signals and updates before its timer, activity and child resolutions (sdk-core `crates/sdk-core/src/worker/workflow/mod.rs:1752-1771` at `6e90e6d`), the instance applies the jobs in that order (`Temporal/Worker/Workflow/WorkflowInstance.swift:334-414`), the executor runs every woken task until none is left (`Temporal/Worker/Workflow/WorkflowTaskExecutor.swift:38-77`), and only then resumes a satisfied condition (`Temporal/Worker/Workflow/WorkflowInstance.swift:417-444`), so the check reads state after every job of the workflow task. `Flag` is the corpus's one-field class; workflow code runs on that one serial executor, so it needs no lock. [`corpus/concurrency/swift/Workflows.swift`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/swift/Workflows.swift) is the worked example, its `BatchTests` holding the tie, the losing timer's `TimerCanceled`, and a bound deadline (`BoundDeadline`) that survives the rounds it loses; the `AwaitOne` fixture in [`corpus/messages/swift/ArrivalsFixtures.swift`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/swift/ArrivalsFixtures.swift) is the signal case above.

- A `group.next()` race is not `await one`: a timer or activity child of the same workflow task finishes while the executor drains, before any condition resumes, so it beats a signal listed first (`Temporal/Worker/Workflow/WorkflowInstance.swift:417-444`; the corpus's `aTaskGroupRaceIsNotListedOrder`).
- `context.timeout(for: d) { try await context.condition { … } }` is `await one` {timer, condition}, the timer listed first: it cancels its body once the sleep returns, inside the drain (`Temporal/Worker/Workflow/InternalWorkflowContext.swift:151-211`; the corpus's `timeoutOverAConditionLetsTheTimerWinATie`).

## Cases

| Case | Before the `condition` | In the predicate | Winner |
|------|------------------------|------------------|--------|
| signal, update | `let t = xs.begin()` | `$0.xs.ready(t)` | `xs.claim()`; every losing message case calls `xs.leave(t)` |
| inline timer | a child of the round's task group that sleeps, then sets a `Flag`, as above | `timer.isSet` | every other winner leads to `group.cancelAll()` |
| inline activity, child workflow, nested `await all:` | `async let p = { defer { done.isSet = true }; return try await … }()` at the run's scope, outside the round's task group, each call with `cancellationType: .abandon` | `done.isSet` | `try await p` |
| promise | its `async let` sets a `Flag` the same way, as `BoundDeadline`'s `fired` sets `deadline` | `deadline.isSet` | `try await fired` |
| condition | — | the condition | — |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival. A losing case must `leave`, or it holds its place and blocks later waiters. The predicate only reads (`Temporal/Worker/Workflow/WorkflowContext.swift:359-360`); `claim` and `leave` come after the `condition`. The `defer` sets the `Flag` of a failed call too; the winner's `try await` throws its failure.

## Notes

- **Losing cases** (spec 06): a losing inline timer is cancelled by `group.cancelAll()`, which cancels its sleep (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:85-103`), and history records `TimerCanceled`. Leave losing inline activities and children running until the run ends: start them outside the round's task group, which awaits its children when it exits, and never in a `Task {}` ([promise.md](./promise.md)). Their run-scope `async let` is cancelled when `run` returns, which sends sdk-core a cancel command for the call (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:213-216`, `Temporal/Worker/Workflow/UntypedChildWorkflowHandle.swift:163-173`), so each call sets `cancellationType: .abandon` (defaults `.tryCancel` and `.waitCancellationCompleted`, `Temporal/Worker/Workflow/ActivityOptions.swift:85`, `Temporal/Worker/Workflow/ChildWorkflowOptions.swift:132`): sdk-core then sends no cancel request (sdk-core `crates/sdk-core/src/worker/workflow/machines/activity_state_machine.rs:191-194`, `child_workflow_state_machine.rs:734`), and a losing child meets `parent_close_policy` ([options.md](./options.md)) at parent close (spec 06). What remains: an external cancel while a losing case still runs abandons it rather than requesting its cancel. Never cancel a bound `promise` for losing a round: its `async let` is bound before the rounds, as `BoundDeadline`'s `fired` is (the corpus's `aBoundPromiseSurvivesTheRoundsItLoses`).
- An empty case body → the winner's `claim()` or `try await` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh `begin` ticket per message case and a fresh task group each iteration.
