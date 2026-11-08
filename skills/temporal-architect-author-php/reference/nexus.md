# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(confirmation)
```

**A `nexus` call and a `detach nexus` are unsupported in PHP.** `temporal/sdk` 2.20 has no Nexus Operations API: no workflow method starts an operation, and beyond raw gRPC RPCs, its only Nexus surface is the worker's task-slot and poller fields (`Worker/WorkerOptions.php:131-140`; `temporal-developer` [`php.md` § Unsupported Features](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/php.md#unsupported-features)). This is an SDK limit, not a design gap: the `.twf` stays as written, and the calling workflow is authored in an SDK with a Nexus caller.
