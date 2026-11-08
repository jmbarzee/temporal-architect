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

### PHP

```php
#[WorkflowInterface]
final class HumanReview
{
    private bool $reviewComplete = false;
    private string $result = '';

    #[UpdateMethod(name: 'SubmitReview')]
    public function submitReview(string $decision): ReviewResult
    {
        $this->result = $decision;
        $this->reviewComplete = true;
        return new ReviewResult($this->result);
    }

    #[WorkflowMethod]
    #[ReturnType(ReviewResult::class)]
    public function run(string $docId): \Generator
    {
        $fired = false;
        $timer = Workflow::async(static function () use (&$fired): \Generator {
            yield Workflow::timer(48 * 3600)->then(static function () use (&$fired): void {
                $fired = true;
            });
        });
        yield Workflow::await(function () use (&$fired): bool { return $this->reviewComplete || $fired; });
        if ($this->reviewComplete) { // listed first, so it wins a tie
            $timer->cancel();
        } else {
            yield $this->activities->escalate($docId);
            $this->result = 'escalated';
        }

        yield Workflow::await(fn(): bool => Workflow::allHandlersFinished());
        return new ReviewResult($this->result);
    }
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `bool` in the condition; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `Workflow::awaitWithTimeout(48 * 3600, fn(): bool => $this->reviewComplete)`**: it races by settle order, not the first listed ([await-one.md](./await-one.md))
3. **The timer's flag is set in its `then`, read by a closure that captures it by reference**, or a tie goes to the wrong case and an arrow function never sees it ([await-one.md](./await-one.md#cases), [condition.md](./condition.md))
4. **Cancel the losing timer** (`twf spec statement-syntax`, lifecycle of non-winning cases), or it fires later ([await-one.md](./await-one.md#notes))
5. **`allHandlersFinished` before returning**, so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The PHP race is Pattern 1's, with a signal handler (`#[SignalMethod(name: 'CancelRetention')] public function cancelRetention(): void { $this->cancelled = true; }`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `Workflow::timer($retentionDays * 86400)` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `deleteDocument` call after the race rather than one per case
