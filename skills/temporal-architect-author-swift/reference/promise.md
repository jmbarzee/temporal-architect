# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`try await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```swift
async let handleA = context.executeActivity(
    ItemActivities.Activities.ProcessA.self,
    options: .init(startToCloseTimeout: .seconds(60)),
    input: items.a
)
// ... do other work ...
let resultA = try await handleA
```

| `promise p <- …` | Swift |
|------------------|------|
| `activity` / `workflow` | `async let p = context.executeActivity(…)` / `context.executeChildWorkflow(…)`; a child the design also signals: [signal-send.md](./signal-send.md) |
| `timer(5m)` | `async let p: Void = context.sleep(for: .seconds(300))`; one an `await one` reads also sets a `Flag` ([await-one.md](./await-one.md#cases)) |
| `nexus …` | unsupported ([nexus.md](./nexus.md)) |
| `signal Approve` / `update Review` | `let ticket = approves.begin()`, then `async let approval = context.take(\.approves, at: ticket)` |

- `async let` starts its child task at the binding; `try await p` waits for it and throws its failure. An `async let` still unawaited when its scope exits is cancelled and awaited there, so bind it in the scope the `.twf` binding has.
- A promise on a signal or update begins waiting at its binding, not at its `await`: the ticket is taken from the message's `Arrivals` synchronously, before the `async let` ([await-signal.md](./await-signal.md)), as the corpus's `Approval` binds `approval`. Not `async let p = context.take(\.approves)`: its child first runs once the parent suspends, since the executor runs one task until it suspends before the next (`Temporal/Worker/Workflow/WorkflowTaskExecutor.swift:38-77`), so a later `await signal Approve` takes its ticket first (the corpus's `naiveAsyncLetPromiseBeginsLate`). Not a ticket alone redeemed later either: no one claims at it meanwhile, so it holds every later waiter of that message.
- Never `Task {}` in a workflow. Workflow code runs on the instance's serial executor by task-executor preference (`Temporal/Worker/Workflow/WorkflowInstance.swift:286,496,764`), which `async let` and task-group children inherit and an unstructured `Task {}` does not ([SE-0417](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0417-task-executor-preference.md)): the SDK names the executor when it needs one (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:141`). Safe APIs: DocC [`Workflow-Concurrency.md` § Use safe APIs for deterministic execution](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-safe-apis-for-deterministic-execution).
- In `await one:`, a promise is a case read through its `Flag` ([await-one.md](./await-one.md#cases)). Losing a round never cancels it, a `timer` promise included: it is bound outside the round's task group, and stays awaitable (spec 06).
