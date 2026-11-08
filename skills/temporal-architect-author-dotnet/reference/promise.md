# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```csharp
var handleA = Workflow.ExecuteActivityAsync(() => Activities.ProcessA(items.A), Options);
// ... do other work ...
var resultA = await handleA;
```

| `promise p <- …` | C# |
|------------------|----|
| `activity` / `workflow` | the un-awaited `Task` of `Workflow.ExecuteActivityAsync` / `Workflow.ExecuteChildWorkflowAsync`; a child the design also signals is `await Workflow.StartChildWorkflowAsync(…)`, whose `GetResultAsync()` is the promise ([signal-send.md](./signal-send.md)) |
| `timer(5m)` | `Workflow.DelayAsync(TimeSpan.FromMinutes(5))` |
| `nexus …` | `client.ExecuteNexusOperationAsync(…)` |
| `signal Approve` / `update Review` | `approves.TakeAsync()` |

- A promise on a signal or update begins waiting at its binding, not at its `await`: `TakeAsync` registers its wait on the message's `Arrivals` when called ([await-signal.md](./await-signal.md)), as the corpus's `var approval = approves.TakeAsync();` does.
- In `await one:`, a promise is an `IsCompleted` case ([await-one.md](./await-one.md#cases)).
