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

### Perl

```perl
class HumanReview :isa(Temporalio::Workflow::Definition) {
    field $review_complete = 0;
    field $result          = '';

    method submit_review :Update('SubmitReview') ($decision) {
        $result          = $decision;
        $review_complete = 1;
        return { decision => $result };
    }

    async method run :Run ($doc_id) {
        my $timer = Temporalio::Workflow::sleep(48 * 3600);
        await Temporalio::Workflow::wait_condition(sub { $review_complete || $timer->is_ready });
        if ($review_complete) {    # listed first, so it wins a tie
            $timer->cancel unless $timer->is_ready;
        }
        else {
            await Temporalio::Workflow::execute_activity('Escalate',
                args => [$doc_id], start_to_close_timeout => 60);
            $result = 'escalated';
        }

        await Temporalio::Workflow::wait_condition(\&Temporalio::Workflow::all_handlers_finished);
        return { decision => $result };
    }
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a field in the predicate; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `wait_condition(sub { $review_complete }, timeout => 48 * 3600)`**: it races internally and dies with `Temporalio::Exception::Timeout`, so job order, not listed order, decides ([await-one.md](./await-one.md))
3. **Cancel the losing timer** (spec 06, lifecycle of non-winning cases), or it fires later ([await-one.md](./await-one.md#notes))
4. **`all_handlers_finished` before returning**, so an in-flight update is not abandoned (`Workflow.pm:364-371`, [update-handler.md](./update-handler.md))

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

The Perl race is Pattern 1's, with a signal handler (`method cancel_retention :Signal('CancelRetention') () { $cancelled = 1; return }`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `Temporalio::Workflow::sleep($retention_days * 24 * 3600)` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
