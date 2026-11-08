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

### Ruby

```ruby
class HumanReview < Temporalio::Workflow::Definition
  def initialize
    @review_complete = false
    @result = ''
  end

  workflow_update name: 'SubmitReview'
  def submit_review(decision)
    @result = decision
    @review_complete = true
    ReviewResult.new(decision: @result)
  end

  def execute(doc_id)
    timer_cancellation, cancel_timer = Temporalio::Cancellation.new(Temporalio::Workflow.cancellation)
    timer = Temporalio::Workflow::Future.new do
      Temporalio::Workflow.sleep(48 * 3600, cancellation: timer_cancellation)
    end
    Temporalio::Workflow.wait_condition { @review_complete || timer.done? }
    if @review_complete # listed first, so it wins a tie
      cancel_timer.call # the inline timer lost
    else
      Temporalio::Workflow.execute_activity(Escalate, doc_id, start_to_close_timeout: 60)
      @result = 'escalated'
    end

    Temporalio::Workflow.wait_condition { Temporalio::Workflow.all_handlers_finished? }
    ReviewResult.new(decision: @result)
  end
end
```

### Why this is tricky

1. **The condition is read, not taken**: it is an instance variable in the condition; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **Not `Workflow.timeout(48 * 3600) { wait_condition { @review_complete } }`**: its timer raises into the waiter before the update's handler runs, so the timer wins a tie although the condition is listed first ([await-one.md](./await-one.md))
3. **The losing timer is cancelled**: spec 06 cancels a losing inline timer, so it sleeps on its own `Temporalio::Cancellation`; a losing activity, child or Nexus case would keep running ([await-one.md](./await-one.md#notes))
4. **`Workflow.all_handlers_finished?` before returning** (`workflow.rb:30`), so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The Ruby race is Pattern 1's, with a signal handler (`workflow_signal name: 'CancelRetention'` on `def cancel_retention`, its body `@cancelled = true`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `Workflow.sleep(retention_days * 24 * 3600, cancellation: timer_cancellation)`, in seconds ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `DeleteDocument` call after the race rather than one per case
