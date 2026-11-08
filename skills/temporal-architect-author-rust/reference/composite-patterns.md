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

### Rust

```rust
#[workflow]
pub struct HumanReview {
    doc_id: String,
    review_complete: bool,
    result: String,
}

#[workflow_methods]
impl HumanReview {
    #[init]
    pub fn new(_ctx: &WorkflowContextView, doc_id: String) -> Self {
        Self { doc_id, review_complete: false, result: String::new() }
    }

    #[update(name = "SubmitReview")]
    pub fn submit_review(&mut self, _ctx: &mut SyncWorkflowContext<Self>, decision: String) -> ReviewResult {
        self.result = decision;
        self.review_complete = true;
        ReviewResult { decision: self.result.clone() }
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<ReviewResult> {
        let ctx = &*ctx;
        let mut timer = ctx.timer(Duration::from_secs(48 * 3600));
        select! {
            _ = ctx.wait_condition(|s| s.review_complete) => {
                timer.cancel(); // the inline timer lost
            }
            _ = timer => {
                let doc_id = ctx.state(|s| s.doc_id.clone());
                ctx.execute_activity(ReviewActivities::escalate, doc_id, activity_options()).await?;
                ctx.state_mut(|s| s.result = "escalated".into());
            }
        }

        let handlers = ctx.clone();
        ctx.wait_condition(move |_| handlers.all_handlers_finished()).await?;
        Ok(ReviewResult { decision: ctx.state(|s| s.result.clone()) })
    }
}
```

### Why this is tricky

1. **The condition is read, not taken**: it is a `wait_condition` arm; nothing waits on the update itself, so it needs no `Arrivals` ([await-one.md](./await-one.md#cases))
2. **`workflows::select!`, condition arm first**: it polls in listed order, so a review and a fired timer in one workflow task resolve to the review ([await-one.md](./await-one.md))
3. **The losing timer is cancelled by hand**: dropping it cancels nothing, so the winning arm calls `timer.cancel()`; a losing activity, child or Nexus case would keep running ([await-one.md](./await-one.md#notes))
4. **`all_handlers_finished` before returning** (`crates/workflow/src/workflow_context.rs:2292-2312`), so an in-flight update is not abandoned ([update-handler.md](./update-handler.md))

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

The Rust race is Pattern 1's, with a signal handler (`#[signal(name = "CancelRetention")] pub fn cancel_retention(&mut self, _ctx: &mut SyncWorkflowContext<Self>)`, its body `self.cancelled = true;`) in place of the update. Two things differ:

1. **The timer's duration is computed**: `ctx.timer(Duration::from_secs(retention_days as u64 * 24 * 3600))` ([await-timer.md](./await-timer.md))
2. **Both branches run the same tail**: make one `delete_document` call after the race rather than one per case
