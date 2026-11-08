# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```csharp
var billing = Workflow.CreateNexusWorkflowClient<IBillingService>("BillingEndpoint");
var paymentResult = await billing.ExecuteNexusOperationAsync(svc => svc.ChargePayment(order.Payment));
```

- `Workflow.CreateNexusWorkflowClient<TService>(endpoint)` scopes a client to one endpoint + service (`Workflows/Workflow.cs:380`); `ExecuteNexusOperationAsync(svc => svc.Op(input), options?)` starts the operation and awaits its result (`Workflows/NexusWorkflowClient.cs:125-130`). Its one `input` is the call's one argument: a second throws `ArgumentException` (`:151-154`). A failed operation throws `NexusOperationFailureException` from the `await`.
- `TService` is the contract interface ([nexus-service-def.md](./nexus-service-def.md#contract)), so the operation and its input are type-checked against it and caller and handler stay in sync. A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, is `IOrderService` from the namespace generated for the `.twf` package `orders`.
- Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
