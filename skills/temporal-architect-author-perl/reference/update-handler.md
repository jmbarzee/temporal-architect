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

```perl
# description: "Switches the subscription plan" (no Perl form)
async method change_plan :Update('ChangePlan', 'unfinished_policy=ABANDON') ($new_plan) {
    my $validation = await Temporalio::Workflow::execute_activity('ValidatePlan',
        args => [$new_plan], start_to_close_timeout => 60);
    if ($validation->{valid}) {
        $plan = $new_plan;
        return { success => !!1, plan => $plan };
    }
    return { success => !!0, error => $validation->{reason} };
}
```

- An `:Update('Name')` method on the workflow class, always with the `.twf` name ([SKILL.md](../SKILL.md#wire-names)); params positional, as for a [signal](./signal-handler.md). A plain `method` for a body with no `await`, an `async method` otherwise: either way the update completes when the handler's future does (`Workflow/Runner.pm:3676-3681`).
- Unlike a query, the handler may `await` activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- A Temporal failure the handler leaves unrouted, such as an `await all` branch's, fails only this update, and the run goes on (`Workflow/Runner.pm:3662-3669`), as the corpus's `failure/perl/t/job.t` asserts.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last `await`, as the corpus's `Approval.pm` does: `$reviews->add($note); return $status;` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival.
- Options: `unfinished_policy` as the attribute's kwarg, mapped as for a [signal](./signal-handler.md#handler-options); `description` is **unsupported** there too.
- The `.twf` has no validator; one is authored in Perl as an `:UpdateValidator('Name')` method, synchronous and read-only (`Workflow/Definition.pm:83-102`, `Workflow/Runner.pm:3429-3442`). Validators, and `await Temporalio::Workflow::wait_condition(\&Temporalio::Workflow::all_handlers_finished)` before the workflow returns or continues as new: sdk-perl [§ Definition](https://github.com/MasonEgger/sdk-perl/blob/55816a1/README.md#definition), `Workflow.pm:364-371`.
