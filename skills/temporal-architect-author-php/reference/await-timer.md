# await timer

```twf
await timer(5m)
```

```php
yield Workflow::timer(300);
```

- `Workflow::timer($interval)` (`Workflow.php:625`) takes the `.twf` duration as an `int` of seconds or a `\DateInterval` (`Internal/Workflow/WorkflowContext.php:548`). A variable duration passes straight through: `yield Workflow::timer($backoff)`. Never `sleep()`: `temporal-developer` [`gotchas.md` § Using sleep()](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/gotchas.md#using-sleep).
- A cancelled scope rejects it: `temporal-developer` [`patterns.md` § Cancellation Scopes](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#cancellation-scopes).
- Inside `await one:` or a `promise`, see [await-one.md](./await-one.md).
