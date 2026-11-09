# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```perl
class OrderWorkflow :isa(Temporalio::Workflow::Definition) {
    field $status              = '';
    field $last_transaction_id = '';
    field $payments_received   = Arrivals->new;    # only if the design waits on it

    method payment_received :Signal('PaymentReceived') ($transaction_id, $amount) {
        $status              = 'payment_received';
        $last_transaction_id = $transaction_id;
        $payments_received->add([$transaction_id, $amount]);
        return;
    }

    # async method run :Run ...
}
```

- A `:Signal('Name')` method on the workflow class, always with the `.twf` name: the default is the method name as written ([SKILL.md](../SKILL.md#wire-names)). Senders call it by that name ([signal-send.md](./signal-send.md)). Several params arrive positionally, one payload each (`Workflow/Runner.pm:3164-3180`).
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)): one param as is, several as an arrayref, none as `1`. An `async method` handler adds after its last `await`, so the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.
- A signal that arrives before `run` starts runs its handler first (`Workflow/Runner.pm:2120-2125`), so its `Arrivals` is a `field` initializer, never set in `run`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```perl
# description: "Cancels the subscription" (no Perl form)
method cancel :Signal('Cancel', 'unfinished_policy=ABANDON') () {
    $cancelled = 1;
    return;
}
```

- `unfinished_policy` is a kwarg after the name, each token quoted separately: `abandon` → `'unfinished_policy=ABANDON'`; `warn_and_abandon` → `WARN_AND_ABANDON`, the default, which may be left unset (`Workflow/Attributes.pm:28,48-58`, `Workflow/Definition.pm:180-186`). `:Update` takes the same kwarg.
- `description` is **unsupported**: the attribute takes only a name, `dynamic` and `unfinished_policy`, and any other key dies when the module loads (`Workflow/Attributes.pm:44-65`). Leave it out, keep the text as a comment, and tell the user.
