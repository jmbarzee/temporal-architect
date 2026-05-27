# await all

## DSL

```twf
await all:
    activity ReserveInventory(order) -> inventory
    activity ChargePayment(order) -> payment
```

## Go

```go
var inventory Inventory
var payment Payment
var inventoryErr, paymentErr error

wg := workflow.NewWaitGroup(ctx)

wg.Go(ctx, func(gCtx workflow.Context) {
    inventoryErr = workflow.ExecuteActivity(gCtx, ReserveInventory, order).Get(gCtx, &inventory)
})
wg.Go(ctx, func(gCtx workflow.Context) {
    paymentErr = workflow.ExecuteActivity(gCtx, ChargePayment, order).Get(gCtx, &payment)
})

wg.Wait(ctx)

if inventoryErr != nil {
    return Result{}, inventoryErr
}
if paymentErr != nil {
    return Result{}, paymentErr
}
```

## Fan-out pattern

### DSL

```twf
await all:
    for (item in items):
        activity ProcessBatchItem(item)
```

### Go

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

## Mixed activity + nexus

### DSL

```twf
await all:
    activity ReserveInventory(order) -> inventory
    nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> payment
```

### Go

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
    paymentErr = c.ExecuteOperation(gCtx, "ChargePayment", order.Payment, workflow.NexusOperationOptions{}).Get(gCtx, &payment)
})

wg.Wait(ctx)

if inventoryErr != nil {
    return Result{}, inventoryErr
}
if paymentErr != nil {
    return Result{}, paymentErr
}
```

## Notes

- Each statement in `await all:` runs in its own goroutine via `workflow.WaitGroup.Go`
- `wg.Wait(ctx)` blocks until all goroutines complete — no fragile completion predicates
- Fan-out with `for`: start all futures first, then `.Get` all — no goroutines needed since `ExecuteActivity` returns immediately
- Nexus operations in `await all:` follow the same goroutine pattern — `ExecuteOperation` returns a future, `.Get()` blocks in the goroutine
- Errors: check each goroutine's error after `wg.Wait`. For fail-fast, use `workflow.WithCancel` and cancel the context on first error
