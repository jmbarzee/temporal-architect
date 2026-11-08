# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```php
$ticket = $this->paymentsReceived->begin();
$fired = false;
$timer = Workflow::async(static function () use (&$fired): \Generator {
    yield Workflow::timer(86400)->then(static function () use (&$fired): void {
        $fired = true;
    });
});
yield Workflow::await(function () use ($ticket, &$fired): bool {
    return $this->paymentsReceived->ready($ticket) || $fired;
});

if ($this->paymentsReceived->ready($ticket)) { // listed first, so it wins a tie
    $this->paymentsReceived->claim();
    $timer->cancel();
    $this->status = 'processing';
} else {
    $this->paymentsReceived->leave($ticket);
    yield $this->activities->cancelOrder($orderId);
    throw new ApplicationFailure('order cancelled', 'OrderCancelled', true, EncodedValues::fromValues([new OrderResult('cancelled')]));
}
```

One `Workflow::await` with one condition over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Neither `Promise::any`/`Promise::race` nor `Workflow::awaitWithTimeout` is `await one`: each takes whichever settles first, not the first listed, and `awaitWithTimeout` is itself a `Promise::any` (a `race` under `FeatureFlags::$settleAwaitOnFirstSettledCondition`) over its timer and conditions, as is `Workflow::await` given several conditions (`Internal/Workflow/WorkflowContext.php:699-740,863-920`). [`corpus/messages/php/Fixtures/AwaitOne.php`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/php/Fixtures/AwaitOne.php) is the worked example over `Arrivals`, and [`corpus/concurrency/php/BatchTest.php`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/php/BatchTest.php) holds the tie in both orders and the tempting forms.

## Cases

| Case | Before `Workflow::await` | In the condition | Winner |
|------|--------------------------|------------------|--------|
| signal, update | `$t = $xs->begin()` | `$xs->ready($t)` | `$xs->claim()` |
| timer | a `Workflow::async` scope over `Workflow::timer($d)`, whose `then` sets `$fired` | `$fired` | — |
| activity, child workflow, promise | its promise `$p`, whose `then` sets `$done` on either outcome | `$done` | `yield $p` |
| condition | — | the condition | — |
| nested `await all:` | `$all = Promise::all([…])`, whose `then` sets `$done` on either outcome | `$done` | `yield $all` |
| nexus | unsupported: PHP has no Nexus API | | |

A message case waits without taking: `ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), only the winner claims the arrival, and every other message case calls `$xs->leave($t)`, leaving the arrival pending. An earlier waiter is served first, so a case waits behind it. A flag is set in its promise's `then`, never after a `yield` in a scope: the server's responses settle their promises before the workflow ticks, while a scope resumes after its promise settles, possibly after the listed-order check (`WorkerFactory.php:367-384`, `Internal/Transport/Client.php:50-83`, `Internal/Workflow/Process/Scope.php:494-507`). The condition is a closure, not `fn()`, since it reads locals by reference ([condition.md](./condition.md)). `yield $p` on a rejected promise throws.

## Notes

- **An inline timer case that loses is cancelled** (`twf spec statement-syntax`, lifecycle of non-winning cases): `$timer->cancel()` cancels its scope, or it fires later and adds workflow tasks. Inline activity and child workflow cases keep running until the run ends, and a bound promise is never cancelled by losing ([`Fixtures/BoundDeadline.php`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/php/Fixtures/BoundDeadline.php)). Cancelling a child only *requests* its cancellation; for its lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)). Scopes: `temporal-developer` [`references/php/patterns.md` § Cancellation Scopes](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/patterns.md#cancellation-scopes).
- An empty case body → the winner's `claim()` or `yield` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh ticket and timer each iteration.
