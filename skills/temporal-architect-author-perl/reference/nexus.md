# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```perl
my $billing = Temporalio::Workflow::create_nexus_client(
    endpoint => 'BillingEndpoint', service => 'BillingService');
my $payment_result = await $billing->execute_operation('ChargePayment', $order->{payment});
```

- `Temporalio::Workflow::create_nexus_client(endpoint =>, service =>)` scopes a client to one endpoint + service by name (`Workflow.pm:315-317`); `execute_operation($op, $input, %opts)` starts the operation and awaits its result (`Workflow/NexusClient.pm:59-62`). A failed operation dies with `Temporalio::Exception::NexusOperation` at the `await` (`README.md:1176-1178`).
- There is no contract type: the endpoint, service and operation are the `.twf` names as strings, and nothing checks the input against the handler until it runs. The service and operation strings must equal the handler's registered names ([nexus-service-def.md](./nexus-service-def.md)). A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, is still `service => 'OrderService'`.
- The one input is the call's one argument, a single payload (`Workflow/Runner.pm:1616-1619`); an operation's several values travel as one hashref, per spec 04.
- Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
