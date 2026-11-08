# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```python
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from api import BillingService

billing = workflow.create_nexus_client(service=BillingService, endpoint="BillingEndpoint")
payment_result = await billing.execute_operation(BillingService.charge_payment, order.payment)
```

- `workflow.create_nexus_client(service=, endpoint=)` scopes a client to one endpoint + service; `execute_operation(op, input, …)` starts the operation and awaits its result (`temporalio/workflow/_nexus.py:528,558`). Its one `input` is the call's one argument. A failed operation raises `NexusOperationError` at the `await`.
- `service` is the contract class and `op` its `Operation` attribute ([nexus-service-def.md](./nexus-service-def.md#contract)), so the operation and its input are type-checked against the contract and caller and handler stay in sync. A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, imports `OrderService` from the module generated for the `.twf` package `orders`.
- Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
