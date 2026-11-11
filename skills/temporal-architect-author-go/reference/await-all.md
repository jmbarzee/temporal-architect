# await all

```twf
await all:
	activity ReserveInventory(order) -> inventory
	nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```go
inventoryF := workflow.ExecuteActivity(ctx, ReserveInventory, order)
paymentF := workflow.NewNexusClient("BillingEndpoint", "BillingService").
    ExecuteOperation(ctx, ChargePaymentOp, order.Payment, workflow.NexusOperationOptions{})
if err := awaitAll(ctx, inventoryF, paymentF); err != nil {
    return Result{}, err
}
var inventory Inventory
var payment PaymentResult
if err := inventoryF.Get(ctx, &inventory); err != nil {
    return Result{}, err
}
if err := paymentF.Get(ctx, &payment); err != nil {
    return Result{}, err
}
```

`awaitAll` joins the futures with a `workflow.Selector` and returns at the first error. Copy it from the corpus's [`failure/go/await_all.go`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/go/await_all.go) into the workflow's package.

- Every branch is a future, started before `awaitAll` and whatever its kind (activity, child workflow, Nexus). A branch that is not one call runs in `workflow.Go` and settles a `workflow.NewFuture`.
- A `detach` call's branch is its `GetChildWorkflowExecution()` future, which completes once the call has started ([detach.md](./detach.md)).
- **The first branch to fail fails the `await all` at once, with that failure** (`twf spec statement-syntax`, Await All Block). The branches still running are not cancelled, so never cancel their context: that is what sends a cancel request (sdk-go `internal/workflow.go:1062-1068`). Never join with `workflow.NewWaitGroup` or `.Get` in turn: `wg.Wait` blocks until every branch ends (`internal/internal_workflow.go:1981-1995`), and `.Get` in turn surfaces failures in listed order.
- **When two branches fail**, the first failure in event order surfaces: a blocked `Select` runs the first future to settle (`internal/internal_workflow.go:1532-1541`). If several settled before `Select` was entered, the first listed runs (`internal/internal_workflow.go:1545-1555`).
- Return `awaitAll`'s error. From the workflow function it fails the run; from an update handler it becomes that update's failure, and the run goes on (`internal/internal_update.go:316-317`). [`job.go`](https://github.com/jmbarzee/temporal-architect/blob/main/corpus/failure/go/job.go) beside it is the worked example.

## Fan-out

```twf
await all:
	for (item in items):
		activity ProcessBatchItem(item)
```

```go
futures := make([]workflow.Future, len(items))
for i, item := range items {
    futures[i] = workflow.ExecuteActivity(ctx, ProcessBatchItem, item)
}
if err := awaitAll(ctx, futures...); err != nil {
    return Result{}, err
}
```

`ExecuteActivity` returns immediately, so starting every future and then joining them needs no goroutines.
