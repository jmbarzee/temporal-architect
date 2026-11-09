# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

**A `nexus` call is unsupported in Swift**, as a statement, an `await`, a `promise` or an `await one` case. swift-temporal-sdk 1.5.0 has no Nexus: its worker does not poll Nexus tasks (`Temporal/Bridge/WorkerClient/BridgeWorker+OptionsInit.swift:60`), it ignores Nexus resolutions (`Temporal/Worker/Workflow/WorkflowInstance.swift:406-409`), and workflows have no Nexus call (`WorkflowContext`'s public API, `Temporal/Worker/Workflow/WorkflowContext.swift:97-1122`, never names Nexus). A design whose Swift workflow calls one cannot be authored in Swift; put that caller on a worker in another SDK.
