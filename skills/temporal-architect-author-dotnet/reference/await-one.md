# await one

```twf
await one:
	signal PaymentReceived:
		status = "processing"
	timer(24h):
		activity CancelOrder(orderId)
		close fail(OrderResult{status: "cancelled"})
```

```csharp
using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
var timer = Workflow.DelayAsync(TimeSpan.FromHours(24), timerCancel.Token);
await Workflow.WaitConditionAsync(() => paymentsReceived.Ready || timer.IsCompleted);

if (paymentsReceived.Ready) // listed first, so it wins a tie
{
    paymentsReceived.Claim();
    timerCancel.Cancel();
    status = "processing";
}
else
{
    await Workflow.ExecuteActivityAsync(() => Activities.CancelOrder(orderId), Options);
    throw new ApplicationFailureException("order cancelled", errorType: "OrderCancelled", details: new object[] { new OrderResult("cancelled") });
}
```

One `WaitConditionAsync` over every case blocks until any is ready; then the first listed ready case wins, checked in `.twf` order. Neither `Workflow.WhenAnyAsync` nor `WaitConditionAsync(c, timeout)` is `await one`: both pick the case that completes first, not the first listed, and the timeout form is itself a `WhenAny` over the condition and a delay (`Worker/WorkflowInstance.cs:650-668`), so at a tie the timer wins. [`corpus/concurrency/dotnet/Workflows.workflow.cs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/concurrency/dotnet/Workflows.workflow.cs) is the worked example; its `AwaitOneTests.cs` holds the tie and the tempting forms.

## Cases

| Case | Before `WaitConditionAsync` | In the predicate | Winner |
|------|-----------------------------|------------------|--------|
| signal, update | — | `xs.Ready` | `xs.Claim()` |
| timer | `var timer = Workflow.DelayAsync(d, cts.Token)` | `timer.IsCompleted` | — |
| activity, child workflow, nexus, promise | its `Task` `p` | `p.IsCompleted` | `await p` |
| condition | — | the condition | — |
| nested `await all:` | `var all = Workflow.WhenAllAsync(…)` | `all.IsCompleted` | `await all` |

A message case waits without taking: `Ready` checks its `Arrivals` ([await-signal.md](./await-signal.md)), and only the winner claims the arrival; a losing case leaves it pending. An earlier waiter is served first, so a case waits behind it. `IsCompleted` is also true for a faulted `Task`; the winner's `await p` rethrows.

## Notes

- **An inline timer case that loses is cancelled** (#496): cancel its token, or it fires later and adds workflow tasks. Inline activity, child workflow and Nexus cases keep running until the run ends, and a bound promise is never cancelled by losing. Cancelling a child only *requests* its cancellation; for its lifecycle at parent close, use `parent_close_policy` ([options.md](./options.md)). Tokens: `temporal-developer` `references/dotnet/patterns.md` § Cancellation Handling (CancellationToken).
- An empty case body → the winner's `Claim()` or `await` alone.
- Event-driven/entity workflows repeat the race in a loop, with a fresh timer each iteration.
