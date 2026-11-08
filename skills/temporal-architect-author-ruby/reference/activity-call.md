# activity call

```twf
activity ValidateOrder(order) -> validated
```

```ruby
validated = ValidateResult.from_h(
  Temporalio::Workflow.execute_activity(ValidateOrder, order, start_to_close_timeout: 60)
)
```

- `Workflow.execute_activity(activity, *args, **options)` (`workflow.rb:172-189`) sends the class's wire name and blocks the workflow's fiber until the result. Pass the class, never a name string, so the name stays the class's; the workflow never builds the activity, so its dependencies stay on the worker.
- A user-type result arrives as a `Hash`; rebuild it with `from_h` ([types.md](./types.md#user-types)).
- A failed activity raises `Temporalio::Error::ActivityError` (`error/failure.rb:200`) from the call; let it propagate unless the `.twf` handles it.
- The options are the call's keywords ([options.md](./options.md)); `start_to_close_timeout:` or `schedule_to_close_timeout:` is required.
- Bound to a promise, the call runs in a `Temporalio::Workflow::Future.new { … }` and `future.wait` is the `await` (`workflow/future.rb:140-145`) ([promise.md](./promise.md)).
- A `task_queue` with `{x}` parameters names one member of a worker family: pass `task_queue:` from the family's queue method with the workflow's inputs, and `schedule_to_start_timeout:` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
