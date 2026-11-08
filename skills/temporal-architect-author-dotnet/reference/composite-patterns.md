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

### C#

```csharp
[Workflow]
public class HumanReview
{
    private bool reviewComplete;
    private string result = "";

    [WorkflowUpdate]
    public Task<ReviewResult> SubmitReviewAsync(string decision)
    {
        result = decision;
        reviewComplete = true;
        return Task.FromResult(new ReviewResult(result));
    }

    [WorkflowRun]
    public async Task<ReviewResult> RunAsync(string docId)
    {
        using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var timer = Workflow.DelayAsync(TimeSpan.FromHours(48), timerCancel.Token);
        await Workflow.WaitConditionAsync(() => reviewComplete || timer.IsCompleted);
        if (reviewComplete) // listed first, so it wins a tie
        {
            timerCancel.Cancel();
        }
        else
        {
            await Workflow.ExecuteActivityAsync(() => Activities.Escalate(docId), Options);
            result = "escalated";
        }

        await Workflow.WaitConditionAsync(() => Workflow.AllHandlersFinished);
        return new(result);
    }
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `bool` in the predicate; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `WaitConditionAsync(() => reviewComplete, TimeSpan.FromHours(48))`**: it races internally, so a tie goes to the timer, not the first listed ([await-one.md](./await-one.md))
3. **Cancel the losing timer** (`twf spec statement-syntax`, lifecycle of non-winning cases), or it fires later ([await-one.md](./await-one.md#notes))
4. **`AllHandlersFinished` before returning**, so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The C# race is Pattern 1's, with a signal handler (`[WorkflowSignal] public Task CancelRetentionAsync() { cancelled = true; return Task.CompletedTask; }`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `Workflow.DelayAsync(TimeSpan.FromDays(retentionDays), …)` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
