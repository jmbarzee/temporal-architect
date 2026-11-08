# activity call

```twf
activity ValidateOrder(order) -> validated
```

```perl
my $validated = await Temporalio::Workflow::execute_activity('ValidateOrder',
    args => [$order], start_to_close_timeout => 60);
```

- `Temporalio::Workflow::execute_activity($name, %opts)` (`Workflow.pm:211-216`) takes the activity's wire name as a string, sent verbatim (`:195-202`): the `.twf` name, never the Perl method name. Nothing checks the name or the args against the activity until the worker runs it.
- `args => [...]` holds the positional arguments, one payload each ([types.md](./types.md)).
- `start_activity` is the same call returning the future unawaited (`:223-228`): the form for a `promise` or an `await all:` branch.
- A failed activity dies with `Temporalio::Exception::Activity`, whose `cause` is the activity's own error, at the `await` (`README.md:794-827`); let it propagate unless the `.twf` handles it.
- Options are flat keys on the call, and `start_to_close_timeout` or `schedule_to_close_timeout` is required ([options.md](./options.md)); calls sharing options share one options sub.
- A `task_queue` with `{x}` parameters names one member of a worker family: set `task_queue` from the family's queue sub with the workflow's inputs, and set `schedule_to_start_timeout` when instances are short-lived ([worker.md](./worker.md#per-instance-worker-families)).
