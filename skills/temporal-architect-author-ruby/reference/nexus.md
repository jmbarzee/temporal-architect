# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```ruby
billing = Temporalio::Workflow.create_nexus_client(endpoint: 'BillingEndpoint', service: 'BillingService')
payment_result = PaymentResult.from_h(billing.execute_operation('ChargePayment', order.payment))
```

- **Experimental.** `Workflow.create_nexus_client`, `NexusClient` and `NexusOperationHandle` each say "Nexus support is experimental" (`workflow.rb:47-55`, `workflow/nexus_client.rb:9`, `workflow/nexus_operation_handle.rb:9`), so every `nexus` call is preview in Ruby.
- `create_nexus_client(endpoint:, service:)` scopes a client to one endpoint + service; `execute_operation(operation, arg, **options)` starts the operation and blocks until its result (`workflow/nexus_client.rb:74-90`). Its one `arg` is the operation's one input, per spec 04; a failed operation raises `Temporalio::Error::NexusOperationError` (`:73`).
- There is no contract class: the endpoint, service and operation are strings, written byte for byte as the `.twf` names them, and nothing checks the input's shape against the handler. A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, is the string `'OrderService'`.
- Ruby cannot host the service: [nexus-service-def.md](./nexus-service-def.md).
- Bound to a promise, the call runs in a `Temporalio::Workflow::Future`, and `future.wait` is the `await` ([promise.md](./promise.md)). Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
