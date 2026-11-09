# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```swift
var approves = Arrivals<String>()

@WorkflowSignal
mutating func approve(input: String) {
    status = "approved"
    approves.add(input)
}

// in run(context:input:):
let approver = try await context.take(\.approves)
```

Every signal or update the design waits on gets an `Arrivals<T>` state `var`, `T` being its handler's `input`: the one param, the struct of several (read through its fields after the take), or `Void` for none (`opens.add(())`). Copy [`corpus/messages/swift/Arrivals.swift`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/swift/Arrivals.swift) into the workflow's module; [`Approval.swift`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/swift/Approval.swift) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no `Arrivals`.
- `take(\.xs)` begins a waiter, a ticket in the order waiters began, then waits on `context.condition` until an arrival is pending and its ticket is first, and claims the oldest arrival. A bare `context.condition { !$0.pending.isEmpty }` per waiter also serves waiters in the order they began, since satisfied conditions resume one at a time in registration order (`Temporal/Worker/Workflow/WorkflowInstance.swift:417-444`; the corpus's `naiveConditionPerWaiterServesTheOrderTheyBegan`), but a promise and an `await one` case need the ticket.
- A promise takes its ticket at its binding, then claims through `take(\.xs, at:)` ([promise.md](./promise.md)).
- An `await one` case uses `begin`, `ready`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- A cancelled waiter leaves the queue: a cancelled `condition` throws (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:146-165`), and `take(_:at:)` calls `leave` before rethrowing (the corpus's `aCancelledWaiterLeavesTheQueue`).
- A signal with no params that only an `await one` waits on may count its arrivals instead, as the corpus's `Batch` does (`acks += 1`; `$0.acks > 0`; `acks -= 1`).
- Code after `take` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
