# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```python
@workflow.defn
class OrderWorkflow:
    def __init__(self) -> None:
        self.status = ""
        self.last_transaction_id = ""
        self.payments_received: Arrivals[tuple[str, str]] = Arrivals()  # only if the design waits on it

    @workflow.signal(name="PaymentReceived")
    def payment_received(self, transaction_id: str, amount: str) -> None:
        self.status = "payment_received"
        self.last_transaction_id = transaction_id
        self.payments_received.add((transaction_id, amount))

    # ... @workflow.run
```

- `@workflow.signal(name=…)` on a method returning `None` (`temporalio/workflow/_handlers.py:98`). Params map positionally, one payload each; no params → `def x(self) -> None`.
- State the handler touches lives in `__init__`: a signal can run before `run` starts.
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). An `async def` body adds after its last `await`: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```python
@workflow.signal(
    name="Cancel",
    unfinished_policy=workflow.HandlerUnfinishedPolicy.ABANDON,
    description="Cancels the subscription",
)
def cancel(self) -> None:
    self.cancelled = True
```

- `@workflow.signal` and `@workflow.update` both take `description` and `unfinished_policy` (`temporalio/workflow/_handlers.py:98-105`, `:302-306`).
- `unfinished_policy: abandon` → `HandlerUnfinishedPolicy.ABANDON`; `warn_and_abandon` → `WARN_AND_ABANDON`, the default, which may be left unset.
- `description` is UI/CLI text with no runtime behavior.
