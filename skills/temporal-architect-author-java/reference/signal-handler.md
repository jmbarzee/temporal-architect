# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```java
@WorkflowInterface
public interface OrderWorkflow {
  @WorkflowMethod
  OrderResult run(String orderId);

  @SignalMethod(name = "PaymentReceived")
  void paymentReceived(String transactionId, BigDecimal amount);
}

public class OrderWorkflowImpl implements OrderWorkflow {
  record Payment(String transactionId, BigDecimal amount) {}

  private String status = "";
  private String lastTransactionId = "";
  private final Arrivals<Payment> paymentsReceived = new Arrivals<>(); // only if the design waits on it

  @Override
  public void paymentReceived(String transactionId, BigDecimal amount) {
    status = "payment_received";
    lastTransactionId = transactionId;
    paymentsReceived.add(new Payment(transactionId, amount));
  }
  // ... run()
}
```

- A `@SignalMethod` on the `@WorkflowInterface`, returning `void` (`common/metadata/POJOWorkflowMethod.java:37`), always with `name =` (the SKILL's Wire names); senders call it through the interface ([signal-send.md](./signal-send.md)). Params map positionally, one payload each, decoded into the method's param types (`internal/sync/SignalDispatcher.java:87`); no params → `void open()`.
- State and `Arrivals` are fields initialized at their declaration: a handler can run before the workflow method starts (`workflow/SignalMethod.java:11-21`, `internal/sync/SyncWorkflow.java:111-114`).
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). A body that blocks (a timer, an activity) adds after its last blocking call: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.
- A `TemporalFailure` the handler leaves uncaught, such as an `await all` branch's, fails the run (`internal/sync/WorkflowExecutionHandler.java:89-90,136`, `internal/replay/ReplayWorkflowExecutor.java:80-83`).

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```java
@SignalMethod(
    name = "Cancel",
    description = "Cancels the subscription",
    unfinishedPolicy = HandlerUnfinishedPolicy.ABANDON)
void cancel();
```

- `@SignalMethod` and `@UpdateMethod` carry the same two attributes (`workflow/SignalMethod.java:46,49`, `workflow/UpdateMethod.java:28,31`).
- `unfinished_policy: abandon` → `HandlerUnfinishedPolicy.ABANDON`; `warn_and_abandon` → `WARN_AND_ABANDON`, the default, which may be left unset (`workflow/HandlerUnfinishedPolicy.java:12,19`).
- `description` is UI/CLI text with no runtime behavior.
