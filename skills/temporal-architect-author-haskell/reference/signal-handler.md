# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```haskell
paymentReceivedSignal :: KnownSignal '[Text, Scientific]
paymentReceivedSignal = KnownSignal "PaymentReceived" JSON

orderWorkflow :: ProvidedWorkflow (Text -> Workflow OrderResult)
orderWorkflow = provideCallStack $ provideWorkflow JSON "OrderWorkflow" \orderId -> do
  status <- newStateVar ""
  lastTransactionId <- newStateVar ""
  paymentsReceived <- A.newArrivals -- only if the design waits on it
  setSignalHandler paymentReceivedSignal \transactionId amount -> do
    writeStateVar status "payment_received"
    writeStateVar lastTransactionId transactionId
    A.add paymentsReceived (transactionId, amount)
  -- ...
```

- A `KnownSignal` value per signal, beside the workflow, with the `.twf` name as its string ([SKILL.md](../SKILL.md#wire-names)); senders import it ([signal-send.md](./signal-send.md)). Its type lists the params: they map positionally, one payload each, and the handler takes them as curried arguments (`Workflow/Signal.hs:10-15`, `Workflow.hs:1359-1368`). A signal with none is `KnownSignal '[]`, its handler a bare `Workflow ()`.
- `setSignalHandler` registers the handler inside the workflow body, at the top, beside the `StateVar`s it writes. A signal that arrives before registration is buffered and run at registration (`WorkflowInstance.hs:572-577`, `Workflow.hs:1378-1382`).
- The handler runs every arrival's body, whether or not anything waits, then calls `A.add` last ([await-signal.md](./await-signal.md)): the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

Unsupported at the pin: `KnownSignal` holds only a name and a codec (`Workflow/Signal.hs:10-15`), and `KnownUpdate` only a codec and a name (`Workflow/Update.hs:11-17`), so neither `description` nor `unfinished_policy` has a field. The SDK's unfinished-handler checks are pending features (`sdk/test/PendingFeaturesSpec.hs:59-64`). Write the handler without them and tell the user the `.twf` options do not reach the worker.
