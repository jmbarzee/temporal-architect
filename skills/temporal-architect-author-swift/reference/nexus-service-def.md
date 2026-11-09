# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		close complete(RefundResult{status: "requested"})
```

**A `nexus service`, its `sync` and `async` operations, and a worker that registers one are unsupported in Swift.** swift-temporal-sdk 1.5.0 has no Nexus: its worker does not poll Nexus tasks (`Temporal/Bridge/WorkerClient/BridgeWorker+OptionsInit.swift:60`), and `TemporalWorker` registers only activities and workflows (`Temporal/Worker/TemporalWorker.swift:90-96`). A design whose Swift worker registers a Nexus service cannot be authored in Swift; put that service, with its backing workflows, on a worker in another SDK. A `nexus endpoint` in a namespace stays: it is deployment config, routed to that worker.
