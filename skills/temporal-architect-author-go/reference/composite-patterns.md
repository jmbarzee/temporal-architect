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

### Go

```go
func HumanReview(ctx workflow.Context, docId string) (ReviewResult, error) {
    reviewComplete := false
    var result string

    err := workflow.SetUpdateHandlerWithOptions(ctx, "SubmitReview",
        func(ctx workflow.Context, decision string) (ReviewResult, error) {
            result = decision
            reviewComplete = true
            return ReviewResult{Decision: result}, nil
        },
        workflow.UpdateHandlerOptions{},
    )
    if err != nil {
        return ReviewResult{}, err
    }

    timerCtx, cancelTimer := workflow.WithCancel(ctx)
    timer := workflow.NewTimer(timerCtx, 48*time.Hour)
    if err := workflow.Await(ctx, func() bool { return reviewComplete || timer.IsReady() }); err != nil {
        return ReviewResult{}, err
    }
    yielded := false // let a same-task update's handler run first (await-one.md)
    workflow.Go(ctx, func(workflow.Context) { yielded = true })
    if err := workflow.Await(ctx, func() bool { return yielded }); err != nil {
        return ReviewResult{}, err
    }

    if reviewComplete { // listed first, so it wins a tie
        cancelTimer()
    } else {
        var a *Activities
        if err := workflow.ExecuteActivity(ctx, a.Escalate, docId).Get(ctx, nil); err != nil {
            return ReviewResult{}, err
        }
        result = "escalated"
    }

    if err := workflow.Await(ctx, func() bool { return workflow.AllHandlersFinished(ctx) }); err != nil {
        return ReviewResult{}, err
    }
    return ReviewResult{Decision: result}, nil
}
```

### Why this is tricky

1. **Update handler must be registered before the race blocks** — updates arriving before registration are rejected
2. **The condition is read, not taken** — it is a `bool` in the `Await` predicate; nothing waits on the update itself, so it needs no arrival queue ([await-one.md](./await-one.md#cases))
3. **Cancel the losing timer** — losing cases keep running ([await-one.md](./await-one.md#notes))
4. **`AllHandlersFinished` wait before return** — without this, an in-flight update handler is abandoned when the workflow completes (see [update-handler.md](./update-handler.md))

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

The Go race is Pattern 1's, with the signal handled by a looping goroutine ([signal-handler.md](./signal-handler.md)) instead of an update handler. Two things differ:

1. **The signal goroutine and the workflow's `Await` predicate share `cancelled`** — safe under Temporal's cooperative scheduling, a data race in ordinary Go
2. **Both branches run the same tail** — make one `DeleteDocument` call after the race rather than one per case
