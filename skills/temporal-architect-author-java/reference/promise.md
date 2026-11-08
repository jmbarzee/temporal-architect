# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (the stub call blocks at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```java
Promise<ResultA> handleA = Async.function(activities::processA, items.a());
// ... do other work ...
ResultA resultA = handleA.get();
```

| `promise p <- …` | Java |
|------------------|------|
| `activity` / `workflow` | `Async.function(stub::method, arg)` on the activity or child stub (`workflow/Async.java:28`); `Async.procedure` for a `void` method; a child the design also signals: [signal-send.md](./signal-send.md) |
| `timer(5m)` | `Workflow.newTimer(Duration.ofMinutes(5))` (`workflow/Workflow.java:786`) |
| `nexus …` | `Async.function(svc::op, arg)` on the Nexus service stub (`internal/sync/NexusServiceStubImpl.java:36`; [nexus.md](./nexus.md)) |
| `signal Approve` / `update Review` | `approves.promise()` |

- `get()` blocks for the result and throws a failure (`workflow/Promise.java:41-47`). A failed promise never read only logs a warning, never failing the workflow (`internal/sync/DeterministicRunnerImpl.java:336-344`).
- A promise on a signal or update begins waiting at its binding, not at its `get()`: `promise()` draws its ticket from the message's `Arrivals` before its `Async.function` ([await-signal.md](./await-signal.md)), as the corpus's `Promise<String> approval = approves.promise()` does. Not `Async.function(approves::take)`: the new thread first runs once the current one blocks (`internal/sync/DeterministicRunnerImpl.java:215`), so its ticket would be late.
- In `await one:`, a promise is an `isCompleted()` case ([await-one.md](./await-one.md#cases)).
