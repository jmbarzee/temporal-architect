# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```perl
use Arrivals;

class Approval :isa(Temporalio::Workflow::Definition) {
    field $status   = 'submitted';
    field $approves = Arrivals->new;

    method approve :Signal('Approve') ($approver) {
        $status = 'approved';
        $approves->add($approver);
        return;
    }

    async method run :Run ($request) {
        my $approver = await $approves->take;
        ...
    }
}
```

Every signal or update the design waits on gets an `Arrivals` field. It holds one value per arrival: the one param, an arrayref of several (`my ($tid, $amount) = @{ await $xs->take }`), or `1` for none (`$opens->add(1)`). Copy [`corpus/messages/perl/Arrivals.pm`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/perl/Arrivals.pm) into the project beside the workflows; [`Approval.pm`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/perl/Approval.pm) beside it is the worked example. `Batch.pm` in `corpus/concurrency/perl/` keeps a payload-free signal's arrivals as a count (`$acks++`, `$acks > 0`, `$acks--`): the same queue, without values.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take` gives the oldest pending arrival, else waits for the next. A plain queue needs no waiter tickets: `wait_condition` keeps its waits in the order they began, and each check resolves a satisfied wait with `done`, whose continuation (the waiter's `shift`) runs inside `done`, before the next predicate is read (`Workflow/Runner.pm:2008-2016,2045-2054`, `Workflow/Future.pm:12-17`). So no two waiters see one arrival, and arrivals go to waiters in the order they began. Don't port this shape to an SDK without that guarantee. A scalar flag holds only one arrival, so it is no `.twf` wait.
- `take` begins waiting when called, so a promise begins waiting at its binding ([promise.md](./promise.md)).
- An `await one` case checks `ready` and calls `claim` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- Code after `take` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
