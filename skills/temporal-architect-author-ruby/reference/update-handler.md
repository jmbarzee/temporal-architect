# update handler

```twf
update ChangePlan(newPlan: string) -> (ChangeResult):
	options:
		unfinished_policy: abandon
		description: "Switches the subscription plan"
	activity ValidatePlan(newPlan) -> validation
	if (validation.valid):
		plan = newPlan
		return ChangeResult{success: true, plan: plan}
	else:
		return ChangeResult{success: false, error: validation.reason}
```

```ruby
workflow_update name: 'ChangePlan',
                description: 'Switches the subscription plan',
                unfinished_policy: Temporalio::Workflow::HandlerUnfinishedPolicy::ABANDON
def change_plan(new_plan)
  validation = Validation.from_h(
    Temporalio::Workflow.execute_activity(ValidatePlan, new_plan, start_to_close_timeout: 60)
  )
  if validation.valid
    @plan = new_plan
    ChangeResult.new(success: true, plan: @plan, error: nil)
  else
    ChangeResult.new(success: false, plan: nil, error: validation.reason)
  end
end
```

- `workflow_update name: '…'` (`workflow/definition.rb:197-210`); params map positionally, one payload each, as for a [signal](./signal-handler.md) (`internal/worker/workflow_instance.rb:570`).
- Unlike a query, the handler may call activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last blocking call: `@reviews.add(note)`, then `@status` ([await-signal.md](./await-signal.md)). The SDK completes the update with the method's return value as soon as it returns (`internal/worker/workflow_instance.rb:590-596`), so the caller gets its result before any waiter takes the arrival, as the corpus's `test_review_answered_before_a_waiter_takes_it` asserts.
- A `Temporalio::Error::Failure` the handler leaves unrescued, such as an `await all` branch's, fails only this update, and the run goes on (`internal/worker/workflow_instance.rb:531,600-612`).
- Options: `description` and `unfinished_policy`, mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in Ruby (`workflow_update_validator(:change_plan)`, `workflow/definition.rb:218`). Validators, and finishing handlers before the workflow returns or continues as new: `temporal-developer` `references/ruby/patterns.md` § Updates, § Waiting for All Handlers to Finish.
