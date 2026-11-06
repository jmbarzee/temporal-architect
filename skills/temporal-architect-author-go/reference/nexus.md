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

- `NewNexusClient(endpoint, service)` scopes a client to one endpoint + service; `ExecuteOperation(ctx, operation, input, options)` returns a `NexusOperationFuture` — execute and `.Get()`, like a child workflow. It takes one `input`: a call with several args packs them into the operation's input struct (#415).
- Name the operation by the constant from the service contract ([nexus-service-def.md](./nexus-service-def.md#naming-contract)), not a bare string, so caller and handler stay in sync. A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, takes those constants from an import of the Go package generated for the `.twf` package `orders`: `NewNexusClient("Ep", orders.OrderServiceName)`, `orders.PlaceOrderOp`.
- Options: [options.md](./options.md). Fire-and-forget: [detach.md](./detach.md).
