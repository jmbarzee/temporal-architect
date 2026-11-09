# composite patterns

Bugs cluster where patterns combine. Two worked compositions:

## Pattern 1: Update handler + condition + await one (HumanReview)

An update handler sets a condition that races against a timer in an `await one`: "approve within the deadline, or auto-escalate."

### DSL

```twf
workflow HumanReview(docId: string) -> (ReviewResult):
	state:
		condition reviewComplete

	update SubmitReview(decision: string) -> (ReviewResult):
		result = decision
		set reviewComplete
		return ReviewResult{decision: result}

	await one:
		reviewComplete:
			close complete(ReviewResult{decision: result})
		timer(48h):
			activity Escalate(docId)
			close complete(ReviewResult{decision: "escalated"})
```

### Swift

```swift
@Workflow
struct HumanReview {
    var reviewComplete = false
    var result = ""

    @WorkflowUpdate
    mutating func submitReview(input: String) -> ReviewResult {
        result = input
        reviewComplete = true
        return ReviewResult(decision: result)
    }

    mutating func run(context: WorkflowContext<Self>, input: String) async throws -> ReviewResult {
        try await withThrowingTaskGroup(of: Void.self) { group in
            let timer = Flag()
            group.addTask {
                try await context.sleep(for: .seconds(172_800))
                timer.isSet = true
            }
            try await context.condition { $0.reviewComplete || timer.isSet }
            if reviewComplete {  // listed first, so it wins a tie
                group.cancelAll()  // the inline timer lost
            } else {
                try await context.executeActivity(
                    ReviewActivities.Activities.Escalate.self,
                    options: .init(startToCloseTimeout: .seconds(60)),
                    input: input
                )
                result = "escalated"
            }
        }

        try await context.condition { context.allHandlersFinished }
        return ReviewResult(decision: result)
    }
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `Bool` in the predicate; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `context.timeout(for: .seconds(172_800)) { try await context.condition { $0.reviewComplete } }`**: at a tie the timer wins although the condition is listed first ([await-one.md](./await-one.md))
3. **The losing timer is cancelled**: spec 06 cancels a losing inline timer, so it is a child of the round's task group, which `cancelAll()` cancels; a losing activity or child case keeps running, so it starts outside that group with `cancellationType: .abandon` ([await-one.md](./await-one.md#notes))
4. **`context.allHandlersFinished` before returning** (`Temporal/Worker/Workflow/WorkflowContext.swift:165-177`), so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

## Pattern 2: Signal-set condition vs timer with a shared tail (ManageRetention)

A retention timer races a cancellation signal.

```twf
workflow ManageRetention(docId: string, retentionDays: int):
	state:
		condition cancelled

	signal CancelRetention():
		set cancelled

	await one:
		cancelled:
			activity DeleteDocument(docId)
			close complete
		timer(retentionDays * 24h):
			activity DeleteDocument(docId)
			close complete
```

The Swift race is Pattern 1's, with a signal handler (`@WorkflowSignal mutating func cancelRetention(input: Void) { cancelled = true }`) in place of the update. Three things differ:

1. **Two params are one input**: `run` takes a `Codable` struct with `docId` and `retentionDays` ([workflow-def.md](./workflow-def.md))
2. **The timer's duration is computed**: `context.sleep(for: .seconds(input.retentionDays * 86_400))` ([await-timer.md](./await-timer.md))
3. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
