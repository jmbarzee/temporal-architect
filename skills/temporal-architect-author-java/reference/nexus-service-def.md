# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: req.chargeId
		close complete(RefundResult{status: "requested"})
```

```java
// BillingService.java: the contract, shared by caller and handler
@Service
public interface BillingService {
  @Operation(name = "ChargePayment")
  PaymentResult chargePayment(PaymentRequest input);

  @Operation(name = "RefundPayment")
  RefundResult refundPayment(RefundRequest req);
}
```

```java
// BillingServiceImpl.java: the handler
@ServiceImpl(service = BillingService.class)
public class BillingServiceImpl {
  // async: workflow-backed; resolves when the workflow completes
  @OperationImpl
  public OperationHandler<PaymentRequest, PaymentResult> chargePayment() {
    return WorkflowRunOperation.fromWorkflowMethod(
        (ctx, details, input) ->
            Nexus.getOperationContext()
                    .getWorkflowClient()
                    .newWorkflowStub(BillingChargeWorkflow.class, BillingChargeWorkflow.startOptions(input))
                ::run);
  }

  // sync: the body runs in the handler, with a Temporal client, not a workflow
  @OperationImpl
  public OperationHandler<RefundRequest, RefundResult> refundPayment() {
    return OperationHandler.sync(
        (ctx, details, req) -> {
          Nexus.getOperationContext()
              .getWorkflowClient()
              .newWorkflowStub(BillingChargeWorkflow.class, req.chargeId())
              .refund(req);
          return new RefundResult("requested");
        });
  }
}
```

The caller is GA since 1.29.0 (`releases/v1.29.0:36`), and `WorkflowRunOperation` and the `@Service`/`@Operation` contract annotations carry no experimental marker; `nexus-sdk`'s `OperationHandler` type is `@io.nexusrpc.Experimental` (`handler/OperationHandler.java:17`), on both kinds.

Registration on the **handler** worker (the target namespace's), not the caller: its registrations method calls `worker.registerNexusServiceImplementation(new BillingServiceImpl())` (`worker/Worker.java:497`) and registers the backing workflows ([worker.md](./worker.md)). A `.twf` `nexus service` is one `@ServiceImpl` class implementing **every** operation it declares — never a subset: a missing handler throws at registration (`nexus-sdk` `handler/ServiceImplInstance.java:259-265`), and `twf check` rejects `nexus service Svc.Op`. Operations a design deploys apart are a separate `nexus service`.

## Contract

A `@Service` interface named as the `.twf` service, with `name` unset; each `@Operation(name = "…")` method carries the `.twf` operation name, since the default is the method name ([SKILL.md](../SKILL.md#wire-names)). Each handler is a public no-arg `@OperationImpl` method with its operation method's name, returning `OperationHandler<I, O>` (`handler/ServiceImplInstance.java:99-125`). An operation method takes at most one parameter (`OperationDefinition.java:15-16`): an operation's several values travel as one declared record, per spec 04. Every method on the contract must be an `@Operation`, statics included, so its ID and start-options helpers live on the backing workflow's interface ([workflow-def.md](./workflow-def.md#id_scheme)); put the contract in a package both sides use.

## async

`async Op workflow Name` → `WorkflowRunOperation.fromWorkflowMethod((ctx, details, input) -> client.newWorkflowStub(Name.class, options)::run)` (`nexus/WorkflowRunOperation.java:27`), with `client` from `Nexus.getOperationContext().getWorkflowClient()` (`nexus/NexusOperationContext.java:29`): any duration; the caller gets a completion callback, with cancellation propagation and re-attachment via operation token. The start is a client start whose task queue defaults to the handler worker's (`internal/nexus/NexusStartWorkflowHelper.java:46`); pass the backing workflow's start-options method for a deterministic ID (Nexus retries the start) and its `default_options:`, including both ID policies. A qualified `workflow orders.Name` is `Name` from that package ([workflow-call.md](./workflow-call.md)).

The backing workflow's one parameter is the operation's input.

**One ID function per backing workflow.** The async start and every client start or `id:` send in a sync body reach the same run only if they render the `id_scheme` through the same ID method, as the corpus's `greetId(name)` returns `"greet-" + name` for both. A constructed `id:` calls it; a learned `id:` (`req.chargeId` above) is already the full workflow ID and passes as is. Never rebuild the ID inline, nor from the scheme's hole alone.

## sync

`sync Op(param) -> (T):` → `OperationHandler.sync((ctx, details, input) -> …)` (`handler/OperationHandler.java:24`). The body holds only client forms, each a call through `client = Nexus.getOperationContext().getWorkflowClient()` or plain Java:

| Statement in a sync body | Java |
|---|---|
| `workflow Name(args) [-> r]` (a client start) | `R r = client.newWorkflowStub(Name.class, Name.startOptions(...)).run(...)`, which starts the run and waits for its result (`client/WorkflowClient.java:141`; [workflow-call.md](./workflow-call.md)) |
| `detach workflow Name(args)` | `WorkflowClient.start(client.newWorkflowStub(Name.class, Name.startOptions(...))::run, ...)`; never reads the result ([detach.md](./detach.md)) |
| `signal Type.Name(args)` + `id:` | `client.newWorkflowStub(Type.class, workflowId).name(...)`, or `(Type.class, workflowId, Optional.of(runId))` for `run_id:` (`client/WorkflowClient.java:151,165`); args as in [signal-send.md](./signal-send.md) |
| `close complete(r)` / `close fail(e)` | `return r` / `throw OperationException.failed(ApplicationFailure.newFailure(...))` (`nexus-sdk` `OperationException.java:35`) |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | Java equivalents ([control-flow.md](./control-flow.md)) |

`TemporalOperationHandler` is experimental (`nexus/TemporalOperationHandler.java:52`) and not used: `OperationHandler.sync` and `WorkflowRunOperation.fromWorkflowMethod` cover both kinds.
