# update handler

```twf
update ChangePlan(newPlan: string) -> (ChangeResult):
	activity ValidatePlan(newPlan) -> validation
	if (validation.valid):
		plan = newPlan
		return ChangeResult{success: true, plan: plan}
	else:
		return ChangeResult{success: false, error: validation.reason}
```

```rust
#[update(name = "ChangePlan")]
pub async fn change_plan(
    ctx: &mut WorkflowContext<Self>,
    new_plan: String,
) -> Result<ChangeResult, Box<dyn std::error::Error + Send + Sync>> {
    let validation = ctx
        .execute_activity(PlanActivities::validate_plan, new_plan.clone(), activity_options())
        .await?;
    if !validation.valid {
        return Ok(ChangeResult { success: false, plan: None, error: Some(validation.reason) });
    }
    ctx.state_mut(|s| s.plan = new_plan.clone());
    Ok(ChangeResult { success: true, plan: Some(new_plan), error: None })
}
```

- `#[update(name = …)]` (`crates/macros/src/workflow_definitions.rs:397-420`): sync (`&mut self`, `&mut SyncWorkflowContext<Self>`) when the body never awaits, as the corpus's `Review`; async (no `self`, `&mut WorkflowContext<Self>`, state through `ctx.state_mut`) when it calls activities, children or timers (`crates/sdk/README.md:192-199`). Params map as for a [signal](./signal-handler.md): one input, several → `MultiArgsN`.
- It returns `R`, or `Result<R, Box<dyn Error + Send + Sync>>` to fail the update (`crates/macros/src/workflow_definitions.rs:566-582,900-950`); the value is the caller's result. It cannot `close` the workflow.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last await: `self.reviews.add(note); self.status.clone()` ([await-signal.md](./await-signal.md)). The caller gets its result when the handler's routine completes (`crates/sdk/src/workflow_future.rs:492-500`), before any waiter takes the arrival, as the corpus's `review_caller_gets_its_result_before_any_waiter_takes_it` asserts.
- Handler options are unsupported in Rust: the attribute accepts only `name` (`crates/macros/src/workflow_definitions.rs:270-290`), so `unfinished_policy` and `description` have no Rust form. To finish handlers before the workflow returns, wait on `ctx.all_handlers_finished()` from a cloned context (`crates/workflow/src/workflow_context.rs:2292-2312`).
- The `.twf` has no validator; one is authored in Rust as `#[update_validator(change_plan)]` (`crates/macros/src/workflow_definitions.rs:422-447`; `crates/sdk/examples/message_passing/workflows.rs:29-40`).
