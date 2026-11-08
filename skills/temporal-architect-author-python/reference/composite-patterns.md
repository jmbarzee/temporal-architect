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

### Python

```python
@workflow.defn
class HumanReview:
    def __init__(self) -> None:
        self.review_complete = False
        self.result = ""

    @workflow.update(name="SubmitReview")
    def submit_review(self, decision: str) -> ReviewResult:
        self.result = decision
        self.review_complete = True
        return ReviewResult(decision=self.result)

    @workflow.run
    async def run(self, doc_id: str) -> ReviewResult:
        timer = asyncio.create_task(workflow.sleep(timedelta(hours=48)))
        await workflow.wait_condition(lambda: self.review_complete or timer.done())
        if self.review_complete:  # listed first, so it wins a tie
            timer.cancel()
        else:
            await workflow.execute_activity(escalate, doc_id, start_to_close_timeout=timedelta(minutes=1))
            self.result = "escalated"

        await workflow.wait_condition(workflow.all_handlers_finished)
        return ReviewResult(decision=self.result)
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `bool` in the predicate; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `wait_condition(lambda: self.review_complete, timeout=timedelta(hours=48))`**: it raises on timeout rather than listing the timer as a case ([condition.md](./condition.md))
3. **The losing timer is cancelled**: spec 06 cancels a losing inline timer; a losing activity, child or Nexus case would keep running ([await-one.md](./await-one.md#notes))
4. **`all_handlers_finished` before returning**, so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The Python race is Pattern 1's, with a signal handler (`@workflow.signal(name="CancelRetention") def cancel_retention(self) -> None: self.cancelled = True`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `workflow.sleep(timedelta(days=retention_days))`
2. **Both branches run the same tail**: make one `delete_document` call after the race rather than one per case
