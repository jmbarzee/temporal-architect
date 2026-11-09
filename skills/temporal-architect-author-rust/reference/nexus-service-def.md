# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: "charge-{req.chargeId}"
		close complete(RefundResult{status: "requested"})
```

**Unsupported in Rust.** The SDK has no Nexus handler — "Defining Nexus handlers will be added later" (`sdk/README.md:341`) — and its worker never polls Nexus tasks (`enable_nexus: false`, `sdk/src/lib.rs:723-728`). So a `nexus service`, its `sync` and `async` operation bodies, and the client-start forms inside them have no Rust form. Implement the handler worker in another SDK, with that SDK's author skill, and give the `.twf` worker that registers the service that SDK's `@sdk` annotation, never `@sdk(rust, …)`.

What stays in Rust:

- **The caller.** A Rust workflow calls the service through the untyped caller ([nexus.md](./nexus.md)).
- **The backing workflow.** `async Op workflow Name` may start a Rust workflow, whose one parameter is the operation's input. Its worker serves the workflow's task queue; the endpoint's task queue needs the handler SDK's worker, since a Rust worker serves no Nexus task.
- **One ID function per backing workflow.** The handler's async start and every `id:` send in a sync body reach the Rust workflow's run only if they render its `id_scheme` exactly as the Rust ID function does ([workflow-def.md](./workflow-def.md#id_scheme)): the `Refund` send above goes through the same ID function as the `ChargePayment` start, in the handler's SDK. A constructed `id:` renders the scheme; a learned `id:` is already the full workflow ID and passes as is (`twf spec cross-workflow-signals`).
