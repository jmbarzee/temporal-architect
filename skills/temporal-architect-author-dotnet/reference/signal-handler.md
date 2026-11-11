# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```csharp
[Workflow]
public class OrderWorkflow
{
    private readonly Arrivals<(string, decimal)> paymentsReceived = new(); // only if the design waits on it
    private string status = "";
    private string lastTransactionId = "";

    [WorkflowSignal]
    public Task PaymentReceivedAsync(string transactionId, decimal amount)
    {
        status = "payment_received";
        lastTransactionId = transactionId;
        paymentsReceived.Add((transactionId, amount));
        return Task.CompletedTask;
    }

    // [WorkflowRun] ...
}
```

- A `[WorkflowSignal]` method returning `Task` on the workflow class; senders call it through a handle ([signal-send.md](./signal-send.md)). Params map positionally, one payload each.
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). An `async` body adds after its last `await`: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.
- A `FailureException` the handler leaves uncaught, such as an `await all` branch's, fails the run: the handler runs as a top-level task (`Worker/WorkflowInstance.cs:1768,1177-1184`).

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```csharp
[WorkflowSignal(UnfinishedPolicy = HandlerUnfinishedPolicy.Abandon, Description = "Cancels the subscription")]
public Task CancelAsync()
{
    cancelled = true;
    return Task.CompletedTask;
}
```

- `WorkflowSignalAttribute` carries `Description` and `UnfinishedPolicy` (`Workflows/WorkflowSignalAttribute.cs:45,58`); `WorkflowUpdateAttribute` carries the same two.
- `unfinished_policy: abandon` → `HandlerUnfinishedPolicy.Abandon`; `warn_and_abandon` → `WarnAndAbandon`, the default, which may be left unset (`Workflows/HandlerUnfinishedPolicy.cs:11-25`).
- `description` is UI/CLI text with no runtime behavior.
