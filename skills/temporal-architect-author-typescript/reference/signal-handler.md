# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```ts
export const PaymentReceived = defineSignal<[transactionId: string, amount: string]>('PaymentReceived');

export async function OrderWorkflow(orderId: string): Promise<OrderResult> {
  let status = '';
  let lastTransactionId = '';
  const paymentsReceived = new Arrivals<[string, string]>(); // only if the design waits on it

  setHandler(PaymentReceived, (transactionId, amount) => {
    status = 'payment_received';
    lastTransactionId = transactionId;
    paymentsReceived.add([transactionId, amount]);
  });
  // ... workflow body
}
```

- `defineSignal<[params]>(name)` (`workflow/src/workflow.ts`), exported from the workflows module so senders import it ([signal-send.md](./signal-send.md)). Params map positionally, one payload each; no params → `defineSignal('Name')` and a handler `() => …`.
- Call `setHandler` at the top of the workflow function, before its first `await`.
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). An `async` body adds after its last `await`: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```ts
setHandler(
  Cancel,
  () => {
    cancelled = true;
  },
  { unfinishedPolicy: HandlerUnfinishedPolicy.ABANDON, description: 'Cancels the subscription' },
);
```

- `SignalHandlerOptions {description, unfinishedPolicy}` (`workflow/src/interfaces.ts`); `UpdateHandlerOptions` carries the same two keys.
- `unfinished_policy: abandon` → `HandlerUnfinishedPolicy.ABANDON`; `warn_and_abandon` → `WARN_AND_ABANDON`, the SDK default, which may be left unset (`workflow/src/workflow.ts`). `HandlerUnfinishedPolicy` imports from `@temporalio/common` (`common/src/interfaces.ts`).
- `description` is UI/CLI text with no runtime behavior.
