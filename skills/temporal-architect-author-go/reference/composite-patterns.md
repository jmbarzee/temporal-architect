# composite patterns

Bugs cluster where patterns combine. Two worked compositions:

## Pattern 1: Update handler + condition + selector (HumanReview)

An update handler sets a condition that races against a timer in a selector: "approve within the deadline, or auto-escalate."

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

    sel := workflow.NewSelector(ctx)

    condCh := workflow.NewChannel(ctx)
    workflow.Go(ctx, func(gCtx workflow.Context) {
        if err := workflow.Await(gCtx, func() bool { return reviewComplete }); err != nil {
            return // context cancelled
        }
        condCh.Send(gCtx, true)
    })
    sel.AddReceive(condCh, func(ch workflow.ReceiveChannel, more bool) {
        ch.Receive(ctx, nil)
        cancelTimer()
    })

    sel.AddFuture(workflow.NewTimer(timerCtx, 48*time.Hour), func(f workflow.Future) {
        if err := f.Get(ctx, nil); err != nil {
            return // timer cancelled — review won the race
        }
        var a *Activities
        _ = workflow.ExecuteActivity(ctx, a.Escalate, docId).Get(ctx, nil)
        result = "escalated"
    })

    sel.Select(ctx)

    _ = workflow.Await(ctx, func() bool { return workflow.AllHandlersFinished(ctx) })

    return ReviewResult{Decision: result}, nil
}
```

### Why this is tricky

1. **Update handler must be registered before `sel.Select`** — if the selector blocks first, updates arriving during the race window are rejected
2. **Condition is not a future** — it must be bridged to the selector via a goroutine + channel ([await-one.md](./await-one.md#cases))
3. **Cancel the timer in the winning handler** — losing cases keep running ([await-one.md](./await-one.md#notes))
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

1. **The signal goroutine and the condition goroutine share `cancelled`** — safe under Temporal's cooperative scheduling, a data race in ordinary Go
2. **Both branches run the same tail** — make one `DeleteDocument` call after `sel.Select` rather than one per handler
