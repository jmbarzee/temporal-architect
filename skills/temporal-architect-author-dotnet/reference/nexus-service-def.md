# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: req.chargeId
		close complete(RefundResult{status: "requested"})
```

```csharp
// Api.cs: the contract, shared by caller and handler
using NexusRpc;

[NexusService]
public interface IBillingService
{
    [NexusOperation]
    PaymentResult ChargePayment(PaymentRequest input);

    [NexusOperation]
    RefundResult RefundPayment(RefundRequest req);
}
```

```csharp
// BillingService.cs: the handler
using NexusRpc.Handlers;
using Temporalio.Nexus;

[NexusServiceHandler(typeof(IBillingService))]
public class BillingService
{
    // async: workflow-backed; resolves when the workflow completes
    [NexusOperationHandler]
    public IOperationHandler<PaymentRequest, PaymentResult> ChargePayment() =>
        WorkflowRunOperationHandler.FromHandleFactory(
            (WorkflowRunOperationContext ctx, PaymentRequest input) =>
                ctx.StartWorkflowAsync(
                    (BillingChargeWorkflow wf) => wf.RunAsync(input), Billing.BillingChargeWorkflowStartOptions(input)));

    // sync: the body runs in the handler, with a Temporal client, not a workflow
    [NexusOperationHandler]
    public IOperationHandler<RefundRequest, RefundResult> RefundPayment() =>
        OperationHandler.Sync<RefundRequest, RefundResult>(async (ctx, req) =>
        {
            await NexusOperationExecutionContext.Current.TemporalClient
                .GetWorkflowHandle<BillingChargeWorkflow>(req.ChargeId)
                .SignalAsync(wf => wf.RefundAsync(req));
            return new("requested");
        });
}
```

The caller and `WorkflowRunOperationHandler` are GA since `Temporalio` 1.18.0 (`CHANGELOG.md`); `OperationHandler.Sync` and the `NexusRpc` contract attributes carry no experimental marker.

Registration on the **handler** worker (the target namespace's), not the caller: its registrations method calls `AddNexusService(new BillingService())` (`Worker/TemporalWorkerOptions.cs:491`) and adds the backing workflows ([worker.md](./worker.md)). A `.twf` `nexus service` is one `[NexusServiceHandler]` class implementing **every** operation it declares — never a subset: a missing handler throws at registration (`NexusRpc` `Handlers/ServiceHandlerInstance.cs:33-37`), and `twf check` rejects `nexus service Svc.Op`. Operations a design deploys apart are a separate `nexus service`.

## Contract

A `[NexusService]` interface named `I` + the `.twf` service name, each `[NexusOperation]` method named as the `.twf` operation, with no `Name` set ([SKILL.md](../SKILL.md#wire-names)). Each handler method has its operation method's name and returns `IOperationHandler<TInput, TResult>`. An operation method takes at most one parameter (`NexusRpc` `OperationDefinition.cs:37-41`): an operation's several values travel as one declared `record`, per spec 04. Put the contract in a file both sides use, beside the ID and start-options functions ([workflow-def.md](./workflow-def.md#id_scheme)).

## async

`async Op workflow Name` → `WorkflowRunOperationHandler.FromHandleFactory((WorkflowRunOperationContext ctx, I input) => ctx.StartWorkflowAsync((Name wf) => wf.RunAsync(input), options))` (`Nexus/WorkflowRunOperationHandler.cs:61`): any duration; the caller gets a completion callback, with cancellation propagation and re-attachment via operation token. `ctx.StartWorkflowAsync` is a client start that requires an ID and defaults `TaskQueue` to the handler worker's (`Nexus/WorkflowRunOperationContext.cs:33-36`); pass the backing workflow's start-options function for a deterministic ID (Nexus retries the start) and its `default_options:`, including both ID policies. A qualified `workflow orders.Name` is `Name` from that package's namespace ([workflow-call.md](./workflow-call.md)).

The backing workflow's one parameter is the operation's input.

## sync

`sync Op(param) -> (T):` → `OperationHandler.Sync<I, T>(async (ctx, input) => …)` (`NexusRpc` `Handlers/OperationHandler.cs:19-21`). The body holds only client forms, each a client call through `NexusOperationExecutionContext.Current.TemporalClient` (`Nexus/NexusOperationExecutionContext.cs:94`) or plain C#:

| Statement in a sync body | C# |
|---|---|
| `workflow Name(args) [-> r]` (a client start) | `var handle = await client.StartWorkflowAsync((Name wf) => wf.RunAsync(...), NameStartOptions(...))`, then `var r = await handle.GetResultAsync()` ([workflow-call.md](./workflow-call.md)) |
| `detach workflow Name(args)` | the same `StartWorkflowAsync`; never `GetResultAsync()` ([detach.md](./detach.md)) |
| `signal Type.Name(args)` + `id:` | `await client.GetWorkflowHandle<Type>(workflowId, runId).SignalAsync(wf => wf.NameAsync(...))` (`Client/TemporalClient.Workflow.cs:68`); args as in [signal-send.md](./signal-send.md) |
| `close complete(r)` / `close fail(e)` | `return r` / `throw` the error |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | C# equivalents ([control-flow.md](./control-flow.md)) |

`TemporalOperationHandler`, which the docs' .NET Nexus guide leads with, is experimental (`Nexus/TemporalOperationHandler.cs:15`) and not used: `OperationHandler.Sync` and `WorkflowRunOperationHandler` cover both kinds.
