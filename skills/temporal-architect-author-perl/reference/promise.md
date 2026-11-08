# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```perl
my $handle_a = Temporalio::Workflow::start_activity('ProcessA',
    args => [$items->{a}], start_to_close_timeout => 60);
# ... do other work ...
my $result_a = await $handle_a;
```

| `promise p <- …` | Perl |
|------------------|------|
| `activity` | the unawaited future of `Temporalio::Workflow::start_activity` ([activity-call.md](./activity-call.md)) |
| `workflow` | the unawaited future of `Temporalio::Workflow::execute_child_workflow`; a child the design also signals is `await Temporalio::Workflow::start_child_workflow(…)`, whose `->result` is the promise ([workflow-call.md](./workflow-call.md)) |
| `timer(5m)` | `Temporalio::Workflow::sleep(300)` ([await-timer.md](./await-timer.md)) |
| `nexus …` | the unawaited `$nc->execute_operation(…)` ([nexus.md](./nexus.md)) |
| `signal Approve` / `update Review` | `$approves->take` |

- A promise on a signal or update begins waiting at its binding, not at its `await`: calling `take` on the message's `Arrivals` runs it to its `wait_condition`, which registers the wait at the call (`Workflow/Runner.pm:2008-2016`), as the corpus's `my $approval = $approves->take;` in `Approval.pm` does ([await-signal.md](./await-signal.md)).
- In `await one:`, a promise is an `is_ready` case ([await-one.md](./await-one.md#cases)).
