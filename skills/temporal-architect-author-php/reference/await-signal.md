# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```php
/** @var Arrivals<string> */
private Arrivals $approves; // new Arrivals() in the constructor

#[SignalMethod(name: 'Approve')]
public function approve(string $approver): void
{
    $this->status = 'approved';
    $this->approves->add($approver);
}

// in the #[WorkflowMethod] body:
$approver = yield $this->approves->take();
```

Every signal or update the design waits on gets an `Arrivals`, its template type being its one param, an array of several (`array{string, int}`, destructured at the take: `[$id, $amount] = yield $xs->take();`), or `true` for none (`add(true)`). Copy the class from the corpus's [`messages/php/Arrivals.php`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/php/Arrivals.php) into the workflow's namespace; [`Approval.php`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/php/Approval.php) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take()` gives the oldest pending arrival, else waits for the next. Waiters are served in the order they began, by ticket. PHP needs the tickets: `WorkflowContext::resolveConditions` resolves every condition that holds in one pass and only queues each waiter's resumption (`Internal/Workflow/WorkflowContext.php:745-756`, `Internal/Workflow/Process/Scope.php:494-507,584-588`), so a bare `Workflow::await(fn(): bool => $pending !== [])` per waiter frees two waiters for one arrival and one finds nothing (the corpus's `Fixtures/NaiveTwoWaiters.php`). A `bool` flag holds only one arrival, so it is no `.twf` wait either.
- `take()` draws its ticket when called, so a promise begins waiting at its binding ([promise.md](./promise.md)). It returns a cancellation scope; a cancelled waiter leaves the queue (scopes: `temporal-developer` [`references/php/patterns.md` § Cancellation Scopes](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#cancellation-scopes)).
- An `await one` case uses `begin`, `ready`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- Code after `take()` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
