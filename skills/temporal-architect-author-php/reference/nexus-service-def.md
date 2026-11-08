# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		close complete(RefundResult{status: "requested"})
```

**A `nexus service`, its `sync` and `async` operations, and a worker that registers one are unsupported in PHP.** `temporal/sdk` 2.20 has no Nexus handler: `WorkerInterface` registers only workflow types and activities (`Worker/WorkerInterface.php:36-74`), and beyond raw gRPC RPCs, its only Nexus surface is the worker's task-slot and poller fields (`Worker/WorkerOptions.php:131-140`; `temporal-developer` [`php.md` § Unsupported Features](https://github.com/temporalio/skill-temporal-developer/blob/2d334cd853a624bf653d16cb9678f3cd806592a1/references/php/php.md#unsupported-features)). This is an SDK limit, not a design gap: the `.twf` stays as written, and the worker that registers the service, with its backing workflows, carries another SDK's `@sdk`, never `@sdk(php, …)`. `nexus/php/` is absent from the corpus for this reason.
