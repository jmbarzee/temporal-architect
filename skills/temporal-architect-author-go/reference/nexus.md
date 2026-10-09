# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```go
c := workflow.NewNexusClient("BillingEndpoint", "BillingService")
var paymentResult PaymentResult
fut := c.ExecuteOperation(ctx, ChargePaymentOp, order.Payment, workflow.NexusOperationOptions{})
if err := fut.Get(ctx, &paymentResult); err != nil {
    return Result{}, err
}
```

- `NewNexusClient(endpoint, service)` scopes a client to one endpoint + service; `ExecuteOperation(ctx, operation, input, options)` returns a `NexusOperationFuture` — execute and `.Get()`, like a child workflow.
- Name the operation by the constant from the service contract ([nexus-service-def.md](./nexus-service-def.md#naming-contract)), not a bare string, so caller and handler stay in sync.
- Options: [options.md](./options.md). Fire-and-forget: [detach.md](./detach.md).
