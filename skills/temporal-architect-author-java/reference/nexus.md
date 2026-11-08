# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```java
private final BillingService billing =
    Workflow.newNexusServiceStub(
        BillingService.class, NexusServiceOptions.newBuilder().setEndpoint("BillingEndpoint").build());

PaymentResult paymentResult = billing.chargePayment(order.payment());
```

- `Workflow.newNexusServiceStub(service, options)` scopes a stub to one endpoint + service (`workflow/Workflow.java:1805`); calling an operation method on it starts the operation and blocks until its result. Its one argument is the operation's one input, which the contract enforces ([nexus-service-def.md](./nexus-service-def.md#contract)). A failed operation throws `NexusOperationFailure` from the call. Nexus left experimental in 1.29.0 (`releases/v1.29.0:36`), but `NexusOperationFailure` and `Worker.registerNexusServiceImplementation` are still `@Experimental` (`failure/NexusOperationFailure.java:12`, `worker/Worker.java:496`).
- The stub's type is the contract interface, so the operation and its input are type-checked against it and caller and handler stay in sync. A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, is `OrderService` imported from the Java package generated for the `.twf` package `orders`.
- The endpoint name can sit on the contract as a constant, as the corpus's `GreeterService.ENDPOINT`: a field is not a method, so the `@Service` rules leave it alone.
- Bound to a promise, the promise is `Workflow.startNexusOperation(billing::chargePayment, payment).getResult()` (`workflow/Workflow.java:1828`, `workflow/NexusOperationHandle.java:22`). Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
