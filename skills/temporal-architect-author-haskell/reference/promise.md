# promise

A promise is a started call: the call starts when it is made, and `await` only waits for it. Default to an inline call (`await` at once); use a promise when other work can proceed first, and for `await all:` / `await one:`.

```twf
promise handleA <- activity ProcessA(items.a)
# ... do other work ...
await handleA -> resultA
```

```haskell
handleA <- startActivity processA processOptions items.a
-- ... do other work ...
resultA <- wait handleA
```

| `promise p <- …` | Binding | `await p` |
|------------------|---------|-----------|
| `activity` | `p <- startActivity act opts args…`, a `Task` ([activity-call.md](./activity-call.md)) | `wait p` |
| `workflow` | `p <- startChildWorkflow wf opts args…`, a `ChildWorkflowHandle` ([workflow-call.md](./workflow-call.md)) | `wait p` |
| `timer(5m)` | `p <- createTimer (minutes 5)`, a `Maybe Timer` (`Workflow.hs:1431`) | `traverse_ wait p` (`Nothing`, for a duration of zero or less, has elapsed) |
| `nexus …` | `p <- startNexusOperation client "Op" opts (encodeJSON x)`, a `Task Payload` ([nexus.md](./nexus.md)) | `wait p`, then `decodeJSON` |
| `signal Approve` / `update Review` | `p <- A.begin approves`, a place in the message's `Arrivals` line | `A.takeAt approves p` |

- A promise on a signal or update begins waiting at its binding, not at its `await`: `begin` takes its place in the line, so an `await` of the same message after the binding takes the next arrival, as the corpus's `pendingApproval <- A.begin approves` does ([await-signal.md](./await-signal.md)).
- In `await one:`, a promise is a `race` branch that waits for it ([await-one.md](./await-one.md#cases)).
