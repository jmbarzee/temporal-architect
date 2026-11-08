# await timer

```twf
await timer(5m)
```

```csharp
await Workflow.DelayAsync(TimeSpan.FromMinutes(5));
```

- `Workflow.DelayAsync(TimeSpan)` (`Workflows/Workflow.cs:427`) takes the `.twf` duration as a `TimeSpan`. A variable duration passes straight through: `await Workflow.DelayAsync(backoff)`. Never `Task.Delay`: `temporal-developer` `references/dotnet/gotchas.md` § Task.Delay / Thread.Sleep.
- A cancelled token throws from it: `temporal-developer` `references/dotnet/patterns.md` § Cancellation Handling (CancellationToken).
- Inside `await one:` or a `promise`, see [await-one.md](./await-one.md).
