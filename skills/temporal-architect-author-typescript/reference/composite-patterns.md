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

### TypeScript

```ts
export const SubmitReview = defineUpdate<ReviewResult, [decision: string]>('SubmitReview');

export async function HumanReview(docId: string): Promise<ReviewResult> {
  let reviewComplete = false;
  let result = '';

  setHandler(SubmitReview, (decision) => {
    result = decision;
    reviewComplete = true;
    return { decision: result };
  });

  const timer = new CancellationScope();
  let timerFired = false;
  timer.run(() => sleep('48h')).then(
    () => (timerFired = true),
    () => {}, // cancelled because the review won
  );
  await condition(() => reviewComplete || timerFired);
  if (reviewComplete) { // listed first, so it wins a tie
    timer.cancel();
  } else {
    await Escalate(docId);
    result = 'escalated';
  }

  await condition(allHandlersFinished);
  return { decision: result };
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `boolean` in the predicate; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `condition(() => reviewComplete, '48h')`**: it races internally, so a tie goes to whichever settles first, not the first listed ([await-one.md](./await-one.md))
3. **Cancel the losing timer**: losing cases keep running ([await-one.md](./await-one.md#notes))
4. **`allHandlersFinished` before returning**, so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The TypeScript race is Pattern 1's, with a signal handler (`setHandler(CancelRetention, () => { cancelled = true; })`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `sleep(retentionDays * 24 * 60 * 60 * 1000)`, milliseconds ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
