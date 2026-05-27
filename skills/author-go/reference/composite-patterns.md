# composite patterns

Patterns in isolation are straightforward. Bugs cluster where patterns combine. These worked examples show the most common compositions and their pitfalls.

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

    // Register update handler FIRST — before any blocking call
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

    // Race: condition (set by update) vs timer
    timerCtx, cancelTimer := workflow.WithCancel(ctx)

    sel := workflow.NewSelector(ctx)

    // Condition case — wrap in goroutine + channel (conditions aren't futures)
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

    // Timer case
    sel.AddFuture(workflow.NewTimer(timerCtx, 48*time.Hour), func(f workflow.Future) {
        if err := f.Get(ctx, nil); err != nil {
            return // timer cancelled — review won the race
        }
        var a *Activities
        _ = workflow.ExecuteActivity(ctx, a.Escalate, docId).Get(ctx, nil)
        result = "escalated"
    })

    sel.Select(ctx)

    // Wait for any in-flight update handlers before returning
    _ = workflow.Await(ctx, func() bool { return workflow.AllHandlersFinished(ctx) })

    return ReviewResult{Decision: result}, nil
}
```

### Why this is tricky

1. **Update handler must be registered before `sel.Select`** — if the selector blocks first, updates arriving during the race window are rejected
2. **Condition is not a future** — it must be bridged to the selector via a goroutine + channel (see [await-one.md](./await-one.md), "condition promise" pattern)
3. **Timer should be cancelled in the condition handler** — per DSL semantics, non-winning cases are not automatically cancelled; the timer continues running until workflow completion. Cancelling it in the winning handler is an optimization that prevents unnecessary history events (a timer-fired event 48h later)
4. **`AllHandlersFinished` wait before return** — without this, an in-flight update handler is abandoned when the workflow completes (see [update-handler.md](./update-handler.md))

---

## Pattern 2: Signal handler goroutine + main-thread await after sleep (ManageRetention)

A long-running workflow sleeps for a retention period while a signal handler goroutine listens for early cancellation.

### DSL

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

### Go

```go
func ManageRetention(ctx workflow.Context, docId string, retentionDays int) error {
    cancelled := false

    // Signal channel + handler goroutine
    cancelRetentionCh := workflow.GetSignalChannel(ctx, "CancelRetention")
    workflow.Go(ctx, func(gCtx workflow.Context) {
        for {
            cancelRetentionCh.Receive(gCtx, nil)
            cancelled = true
        }
    })

    // Race: signal-set condition vs retention timer
    timerCtx, cancelTimer := workflow.WithCancel(ctx)

    sel := workflow.NewSelector(ctx)

    // Condition case
    condCh := workflow.NewChannel(ctx)
    workflow.Go(ctx, func(gCtx workflow.Context) {
        if err := workflow.Await(gCtx, func() bool { return cancelled }); err != nil {
            return
        }
        condCh.Send(gCtx, true)
    })
    sel.AddReceive(condCh, func(ch workflow.ReceiveChannel, more bool) {
        ch.Receive(ctx, nil)
        cancelTimer()
    })

    // Timer case
    duration := time.Duration(retentionDays) * 24 * time.Hour
    sel.AddFuture(workflow.NewTimer(timerCtx, duration), func(f workflow.Future) {
        if err := f.Get(ctx, nil); err != nil {
            return // timer cancelled — signal won
        }
    })

    sel.Select(ctx)

    // Both paths delete the document
    var a *Activities
    err := workflow.ExecuteActivity(ctx, a.DeleteDocument, docId).Get(ctx, nil)
    if err != nil {
        return err
    }
    return nil
}
```

### Why this is tricky

1. **Signal handler goroutine runs independently of the selector** — it loops forever, processing every signal arrival. The condition bridge (`workflow.Await` + channel send) connects it to the selector
2. **The signal handler mutates `cancelled`, the selector reads it via the condition goroutine** — two goroutines share state through a bool, which is safe in Temporal's cooperative scheduling model but would be a data race in normal Go
3. **Timer cancellation is recommended** — per DSL semantics, non-winning cases are not automatically cancelled; the timer continues until workflow completion regardless. Cancelling it in the winning handler avoids a wasted timer-fired history event
4. **Shared post-race logic** — when both branches do the same thing, factor the common activity call after `sel.Select` instead of duplicating inside handlers
