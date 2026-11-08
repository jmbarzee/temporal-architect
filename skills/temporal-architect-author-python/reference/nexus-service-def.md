# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: "charge-{req.chargeId}"
		close complete(RefundResult{status: "requested"})
```

```python
# api.py: the contract, shared by caller and handler
@nexusrpc.service
class BillingService:
    charge_payment: nexusrpc.Operation[PaymentRequest, PaymentResult] = nexusrpc.Operation(name="ChargePayment")
    refund_payment: nexusrpc.Operation[RefundRequest, RefundResult] = nexusrpc.Operation(name="RefundPayment")
```

```python
# service.py: the handler
@nexusrpc.handler.service_handler(service=BillingService)
class BillingServiceHandler:
    # async: workflow-backed; the caller's result arrives when the workflow completes
    @nexus.workflow_run_operation
    async def charge_payment(
        self, ctx: nexus.WorkflowRunOperationContext, req: PaymentRequest
    ) -> nexus.WorkflowHandle[PaymentResult]:
        return await ctx.start_workflow(BillingChargeWorkflow.run, req, **billing_charge_workflow_start_options(req))

    # sync: the body runs in the handler, with a Temporal client, not a workflow
    @nexusrpc.handler.sync_operation
    async def refund_payment(self, ctx: nexusrpc.handler.StartOperationContext, req: RefundRequest) -> RefundResult:
        handle = nexus.client().get_workflow_handle_for(BillingChargeWorkflow.run, billing_charge_id(req.charge_id))
        await handle.signal(BillingChargeWorkflow.refund, req)
        return RefundResult(status="requested")
```

`@nexusrpc.service`, `service_handler`, `sync_operation` and `@nexus.workflow_run_operation` carry no experimental tag (`nexusrpc/_service.py:89`, `nexusrpc/handler/_decorators.py:50,219`, `temporalio/nexus/_decorators.py:71`); Nexus is GA since `temporalio` 1.24.0.

Registration on the **handler** worker (the target namespace's), not the caller: its factory passes `nexus_service_handlers=[BillingServiceHandler()]` and registers the backing workflows ([worker.md](./worker.md)). A `.twf` `nexus service` is one `service_handler` class implementing **every** operation it declares — `service_handler` raises `TypeError` on a missing one (`nexusrpc/handler/_operation_handler.py:196`), and `twf check` rejects `nexus service Svc.Op`; operations a design deploys apart are a separate `nexus service`.

## Contract

The `@nexusrpc.service` class's `__name__` is the service's wire name, so name it as the `.twf` does; each `Operation` attribute is snake_case with `name=` set to the `.twf` operation name, and the handler method keeps the attribute's name ([SKILL.md](../SKILL.md#wire-names)). `nexusrpc.Operation[I, O]` carries one input: an operation's several values travel as one declared `@dataclass`, per spec 04. Put the contract in a module both sides import, beside the ID and start-options functions ([workflow-def.md](./workflow-def.md#id_scheme)).

## async

`async Op workflow Name` → a `@nexus.workflow_run_operation` method returning `await ctx.start_workflow(Name.run, input, id=…)`: any duration; the caller gets a completion callback, with cancellation propagation and re-attachment via operation token. `ctx.start_workflow` is a client start whose `task_queue` defaults to the handler worker's and whose `id` is required (`temporalio/nexus/_operation_context.py:473`); pass the backing workflow's ID function for a deterministic ID (Nexus retries the start), and unpack its start-options function when the type has one, so its `default_options:` and both ID policies apply. A qualified `workflow orders.Name` is `Name` from that package's module ([workflow-call.md](./workflow-call.md)).

The backing workflow's one parameter is the operation's input.

## sync

`sync Op(param) -> (T):` → a `@nexusrpc.handler.sync_operation async def op(self, ctx: StartOperationContext, input: I) -> T` method (`nexusrpc/handler/_decorators.py:219`). It must finish within the 10-second handler deadline (docs.temporal.io `develop/python/nexus/feature-guide`); a timed-out start is retried until the caller's `schedule_to_close_timeout` (`twf spec statement-syntax`, Nexus call options). The body holds only client forms, each a client call through `nexus.client()` (`temporalio/nexus/_operation_context.py:104`) or plain Python:

| Statement in a sync body | Python |
|---|---|
| `workflow Name(args) [-> r]` (a client start) | `handle = await nexus.client().start_workflow(Name.run, arg, task_queue=…, **name_start_options(…))`, then `r = await handle.result()` ([workflow-call.md](./workflow-call.md)) |
| `detach workflow Name(args)` | the same `start_workflow`; never `handle.result()` ([detach.md](./detach.md)) |
| `signal Type.Name(args)` + `id:` | `await nexus.client().get_workflow_handle_for(Type.run, workflow_id, run_id=…).signal(Type.name, arg)`; args as in [signal-send.md](./signal-send.md) |
| `close complete(r)` / `close fail(e)` | `return r` / `raise` the error |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | Python equivalents ([control-flow.md](./control-flow.md)) |

`@nexus.temporal_operation`, which the docs' Nexus guide leads with, is experimental and not used (`temporalio/nexus/_decorators.py:190`): `sync_operation` and `workflow_run_operation` cover both kinds.
