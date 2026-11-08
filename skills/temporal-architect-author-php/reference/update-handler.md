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

```php
#[UpdateMethod(name: 'ChangePlan', unfinishedPolicy: HandlerUnfinishedPolicy::Abandon, description: 'Switches the subscription plan')]
#[ReturnType(ChangeResult::class)]
public function changePlan(string $newPlan): \Generator
{
    $validation = yield $this->activities->validatePlan($newPlan);
    if ($validation->valid) {
        $this->plan = $newPlan;
        return new ChangeResult(success: true, plan: $this->plan);
    }
    return new ChangeResult(success: false, error: $validation->reason);
}
```

- A public `#[UpdateMethod(name: '…')]` method on the workflow class; params map positionally, as for a [signal](./signal-handler.md). A handler that `yield`s is a generator and declares its result with `#[ReturnType]`, which the SDK reads in place of `\Generator` (`Internal/Declaration/Reader/WorkflowReader.php:186-191`); a plain handler declares its type.
- Unlike a query, the handler may `yield` activities, children and timers, and may mutate workflow state. It cannot `close` the workflow. Its return value is the caller's result.
- If the design waits on the update (`await update`, an update case or promise), the handler adds its arrival to the update's `Arrivals` just before it returns, after its last `yield`: `$this->reviews->add($note); return $this->status;` ([await-signal.md](./await-signal.md)). The caller gets its result then, before any waiter takes the arrival.
- Options: `unfinishedPolicy:` and `description:` on the attribute (`Workflow/UpdateMethod.php:37-41`), mapped as for a [signal](./signal-handler.md#handler-options).
- The `.twf` has no validator; one is authored in PHP (`#[UpdateValidatorMethod(forUpdate: '…')]`). Validators, and finishing handlers before the workflow returns or continues as new: `temporal-developer` [`references/php/patterns.md` § Updates](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#updates), [§ Waiting for All Handlers to Finish](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#waiting-for-all-handlers-to-finish).
