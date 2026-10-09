# await all

```twf
await all:
    activity ReserveInventory(order) -> inventory
    nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

```go
var inventory Inventory
var payment PaymentResult
var inventoryErr, paymentErr error

wg := workflow.NewWaitGroup(ctx)
wg.Go(ctx, func(gCtx workflow.Context) {
    inventoryErr = workflow.ExecuteActivity(gCtx, ReserveInventory, order).Get(gCtx, &inventory)
})
wg.Go(ctx, func(gCtx workflow.Context) {
    c := workflow.NewNexusClient("BillingEndpoint", "BillingService")
    paymentErr = c.ExecuteOperation(gCtx, ChargePaymentOp, order.Payment, workflow.NexusOperationOptions{}).Get(gCtx, &payment)
})
wg.Wait(ctx)

if inventoryErr != nil {
    return Result{}, inventoryErr
}
if paymentErr != nil {
    return Result{}, paymentErr
}
```

- Each branch runs in its own `wg.Go` goroutine, whatever its kind (activity, child workflow, nexus); `wg.Wait(ctx)` blocks until all finish — no completion predicates.
- Check each branch's error after `wg.Wait`. For fail-fast, run the branches under `workflow.WithCancel` and cancel on the first error.

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
for _, f := range futures {
    if err := f.Get(ctx, nil); err != nil {
        return Result{}, err
    }
}
```

`ExecuteActivity` returns immediately, so starting every future and then `.Get`-ing them needs no goroutines.
