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

### Java

```java
@WorkflowInterface
public interface HumanReview {
  @WorkflowMethod
  ReviewResult run(String docId);

  @UpdateMethod(name = "SubmitReview")
  ReviewResult submitReview(String decision);
}

public class HumanReviewImpl implements HumanReview {
  private final ReviewActivities activities =
      Workflow.newActivityStub(ReviewActivities.class, ACTIVITY_OPTIONS);
  private boolean reviewComplete;
  private String result = "";

  @Override
  public ReviewResult submitReview(String decision) {
    result = decision;
    reviewComplete = true;
    return new ReviewResult(result);
  }

  @Override
  public ReviewResult run(String docId) {
    CompletablePromise<Void> timer = Workflow.newPromise();
    CancellationScope timerScope =
        Workflow.newCancellationScope(() -> timer.completeFrom(Workflow.newTimer(Duration.ofHours(48))));
    timerScope.run();
    Workflow.await(() -> reviewComplete || timer.isCompleted());
    if (reviewComplete) { // listed first, so it wins a tie
      timerScope.cancel(); // the inline timer lost
    } else {
      activities.escalate(docId);
      result = "escalated";
    }

    Workflow.await(Workflow::isEveryHandlerFinished);
    return new ReviewResult(result);
  }
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `boolean` in the predicate; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `Workflow.await(Duration.ofHours(48), () -> reviewComplete)`**: at a tie it reports the timeout, so the timer wins although the condition is listed first ([await-one.md](./await-one.md))
3. **The losing timer is cancelled**: spec 06 cancels a losing inline timer, so it starts in its own `CancellationScope`; a losing activity, child or Nexus case would keep running ([await-one.md](./await-one.md#notes))
4. **`Workflow.isEveryHandlerFinished` before returning** (`workflow/Workflow.java:1784`), so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The Java race is Pattern 1's, with a signal handler (`@SignalMethod(name = "CancelRetention") void cancelRetention();`, its body `cancelled = true;`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `Workflow.newTimer(Duration.ofDays(retentionDays))` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `deleteDocument` call after the race rather than one per case
