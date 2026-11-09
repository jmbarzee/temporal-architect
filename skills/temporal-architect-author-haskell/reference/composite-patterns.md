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

### Haskell

```haskell
submitReviewUpdate :: KnownUpdate '[Text] ReviewResult SomeException
submitReviewUpdate = KnownUpdate JSON "SubmitReview"

humanReview :: ProvidedWorkflow (Text -> Workflow ReviewResult)
humanReview = provideCallStack $ provideWorkflow JSON "HumanReview" \docId -> do
  reviewComplete <- newStateVar False
  result <- newStateVar ""
  setUpdateHandler
    submitReviewUpdate
    ( \decision -> do
        writeStateVar result decision
        writeStateVar reviewComplete True
        ReviewResult <$> readStateVar result
    )
    Nothing

  timer <- createTimer (hours 48)
  r <- race (waitCondition (readStateVar reviewComplete)) (traverse_ wait timer)
  case r of
    Left () -> traverse_ cancel timer
    Right () -> do
      executeActivity escalate escalateOptions docId
      writeStateVar result "escalated"
  ReviewResult <$> readStateVar result
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `StateVar` read in a `race` branch; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **`result` is a `StateVar`**, since the handler writes what the body returns ([control-flow.md](./control-flow.md))
3. **Cancel the losing timer** (spec 06, lifecycle of non-winning cases), or it fires later ([await-one.md](./await-one.md#lifecycle-of-losing-cases))
4. **A same-activation tie goes to the update whatever the listing**, which here is also the listed order ([await-one.md](./await-one.md#tie-order-at-e57a0ae))

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

The Haskell race is Pattern 1's, with a signal handler (`setSignalHandler cancelRetentionSignal (writeStateVar cancelled True)`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `createTimer (hours (24 * fromIntegral retentionDays))` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
