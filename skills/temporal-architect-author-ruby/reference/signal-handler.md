# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```ruby
class OrderWorkflow < Temporalio::Workflow::Definition
  Payment = Data.define(:transaction_id, :amount)

  def initialize
    @status = ''
    @last_transaction_id = ''
    @payments_received = Arrivals.new # only if the design waits on it
  end

  workflow_signal name: 'PaymentReceived'
  def payment_received(transaction_id, amount)
    @status = 'payment_received'
    @last_transaction_id = transaction_id
    @payments_received.add(Payment.new(transaction_id:, amount:))
  end
  # ... execute
end
```

- `workflow_signal name: '…'` marks the next method (`workflow/definition.rb:140-152`), always with `name:` (the SKILL's Wire names). Params map positionally, one payload each, converted for the method's params (`internal/worker/workflow_instance.rb:445,725-733`); no params → `def open`. A `decimal` arrives as its base-10 `String` ([types.md](./types.md)).
- State and `Arrivals` are set in `initialize`: a handler can run before `execute` starts, since the activation creates the instance, applies every job, and only then schedules `execute` (`internal/worker/workflow_instance.rb:201-208`).
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). A body that blocks (a timer, an activity) adds after its last blocking call: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```ruby
workflow_signal name: 'Cancel',
                description: 'Cancels the subscription',
                unfinished_policy: Temporalio::Workflow::HandlerUnfinishedPolicy::ABANDON
def cancel
  @cancelled = true
end
```

- `workflow_signal` and `workflow_update` take the same two keywords (`workflow/definition.rb:140-152,197-210`).
- `unfinished_policy: abandon` → `HandlerUnfinishedPolicy::ABANDON`; `warn_and_abandon` → `WARN_AND_ABANDON`, the default, which may be left unset (`workflow/handler_unfinished_policy.rb:8,10`).
- `description` is UI/CLI text with no runtime behavior; the SDK marks it experimental (`workflow/definition.rb:130-131`).
