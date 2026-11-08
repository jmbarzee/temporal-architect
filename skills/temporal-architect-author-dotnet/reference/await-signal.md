# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```csharp
private readonly Arrivals<string> approves = new();

[WorkflowSignal]
public Task ApproveAsync(string approver)
{
    status = "approved";
    approves.Add(approver);
    return Task.CompletedTask;
}

// in the [WorkflowRun] body:
var approver = await approves.TakeAsync();
```

Every signal or update the design waits on gets an `Arrivals<T>`, `T` being its one param, a tuple of several (`(string, decimal)`, deconstructed at the take), or `bool` for none (`Add(true)`; C# has no `Arrivals<void>`). Copy the class from the corpus's [`messages/dotnet/Arrivals.cs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/dotnet/Arrivals.cs) into the workflow's namespace; [`Approval.workflow.cs`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/dotnet/Approval.workflow.cs) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `TakeAsync` gives the oldest pending arrival, else waits for the next. A plain queue needs no waiter tickets, because .NET's event loop frees only the first satisfied `WaitConditionAsync`, in the order the waits began, and runs its continuation before checking the next (`Worker/WorkflowInstance.cs:636,963-1010`, on for every new workflow at `:741-752`); so no two waiters see one arrival. Don't port this shape to an SDK without that guarantee. A `bool` flag holds only one arrival, so it is no `.twf` wait.
- `TakeAsync` begins waiting when called, so a promise begins waiting at its binding ([promise.md](./promise.md)). It takes an optional `CancellationToken`; a cancelled waiter leaves the queue (cancellation: `temporal-developer` `references/dotnet/patterns.md` § Cancellation Handling (CancellationToken)).
- An `await one` case checks `Ready` and calls `Claim()` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- Code after `TakeAsync` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
