# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: int):
		status = "payment_received"
		lastTransactionId = transactionId
```

```php
#[WorkflowInterface]
final class OrderWorkflow
{
    /** @var Arrivals<array{string, int}> only if the design waits on it */
    private Arrivals $paymentsReceived;
    private string $status = '';
    private string $lastTransactionId = '';

    public function __construct()
    {
        $this->paymentsReceived = new Arrivals();
    }

    #[SignalMethod(name: 'PaymentReceived')]
    public function paymentReceived(string $transactionId, int $amount): void
    {
        $this->status = 'payment_received';
        $this->lastTransactionId = $transactionId;
        $this->paymentsReceived->add([$transactionId, $amount]);
    }

    // #[WorkflowMethod] ...
}
```

- A public `#[SignalMethod(name: '…')]` method returning `void` on the workflow class; senders call it through a stub ([signal-send.md](./signal-send.md)). `name:` sets the `.twf` name, since the default is the method name as is ([SKILL.md § Wire names](../SKILL.md#wire-names)). Params map positionally, one payload each.
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). A generator handler (one that `yield`s) adds after its last `yield`: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.
- A failure the handler leaves uncaught, such as an `await all` branch's, fails the run (`Internal/Workflow/Process/Process.php:142-147,276`); a PHP `\Error` fails the workflow task instead, as in an [update](./update-handler.md) (`:271-273`).

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```php
#[SignalMethod(name: 'Cancel', unfinishedPolicy: HandlerUnfinishedPolicy::Abandon, description: 'Cancels the subscription')]
public function cancel(): void
{
    $this->cancelled = true;
}
```

- `#[SignalMethod]` carries `unfinishedPolicy:` and `description:` (`Workflow/SignalMethod.php:36-40`); `#[UpdateMethod]` carries the same two (`Workflow/UpdateMethod.php:37-41`).
- `unfinished_policy: abandon` → `HandlerUnfinishedPolicy::Abandon`; `warn_and_abandon` → `WarnAndAbandon`, the default, which may be left unset (`Workflow/HandlerUnfinishedPolicy.php:13-26`).
- `description` is UI/CLI text with no runtime behavior.
