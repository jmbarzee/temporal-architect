# activity call

```twf
activity ValidateOrder(order) -> validated
```

```php
$activities = Workflow::newActivityStub(OrderActivities::class, ActivityOptions::new()->withStartToCloseTimeout(60));
$validated = yield $activities->validateOrder($order);
```

- `Workflow::newActivityStub(Class::class, $options)` (`Workflow.php:999`) returns a proxy of the activity class: calling a method schedules that method's wire name and returns a promise, which the workflow `yield`s for the result. The class is never instantiated in the workflow, so its dependencies stay on the worker.
- A `void` activity method still returns a promise; PHPStan flags `yield` on it (`method.void`), so the corpus's `Archive` ignores that one line.
- A failed activity throws `ActivityFailure` (`Exception/Failure/ActivityFailure.php:14`) from the `yield`; let it propagate unless the `.twf` handles it.
- `ActivityOptions` is the stub's ([options.md](./options.md)); calls sharing options share one stub.
- A `task_queue` with `{x}` parameters names one member of a worker family: set `withTaskQueue` from the family's queue function with the workflow's inputs, and set `withScheduleToStartTimeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
