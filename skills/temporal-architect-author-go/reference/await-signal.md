# await signal / update

```twf
signal Approve(approver: string):
	status = "approved"
await signal Approve -> (approver)
```

```go
var approves arrivals[ApproveArgs]
// the Approve handler runs its body, then approves.add(args) (signal-handler.md)

approved, err := approves.take(ctx)
if err != nil {
    return Decision{}, err
}
approver := approved.Approver
```

Every signal or update the design waits on gets an `arrivals[T]` queue, `T` being its params struct (`struct{}` for none). Copy the helper from the corpus's [`messages/go/arrivals.go`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/go/arrivals.go) into the workflow's package; [`approval.go`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/messages/go/approval.go) beside it is the worked example.

- The handler adds the arrival after its body ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)). A message nothing waits on needs no queue.
- `take` gives the oldest pending arrival, else waits for the next. Waiters are served in the order they began, by ticket; a bare `workflow.Await(len(pending) > 0)` would serve them in the order their coroutines were created.
- A promise draws its ticket with `wait` at its binding and takes with `takeAt` ([promise.md](./promise.md)).
- An `await one` case uses `wait`, `ready`, `claim` and `leave` instead, so it takes only if it wins ([await-one.md](./await-one.md)).
- Code after `take` sees current state, which later handlers may have changed; per-arrival data comes from the taken value.
