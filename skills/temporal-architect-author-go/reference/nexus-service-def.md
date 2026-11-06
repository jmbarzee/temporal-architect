# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: req.chargeId
		close complete(RefundResult{status: "requested"})
```

```go
import (
    "github.com/nexus-rpc/sdk-go/nexus"     // NewService, NewSyncOperation
    "go.temporal.io/sdk/temporalnexus"      // NewWorkflowRunOperation, GetClient
)

// Service contract — shared by caller and handler
const BillingServiceName = "BillingService"
const ChargePaymentOp = "ChargePayment"
const RefundPaymentOp = "RefundPayment"

// Async: workflow-backed; resolves when the workflow completes
var ChargePaymentOperation = temporalnexus.NewWorkflowRunOperation(
    ChargePaymentOp,
    BillingChargeWorkflow,
    func(ctx context.Context, input PaymentRequest, options nexus.StartOperationOptions) (client.StartWorkflowOptions, error) {
        // The backing workflow's start-options function: a deterministic ID from
        // its ID function (Nexus retries the start) and its default_options,
        // including both ID policies (workflow-def.md#id_scheme).
        return BillingChargeWorkflowStartOptions(input), nil
    },
)

// Sync: the body runs in the handler, with a Temporal client, not a workflow context
var RefundPaymentOperation = nexus.NewSyncOperation(RefundPaymentOp, func(ctx context.Context, req RefundRequest, options nexus.StartOperationOptions) (RefundResult, error) {
    err := temporalnexus.GetClient(ctx).SignalWorkflow(ctx, req.ChargeID, "", "Refund", req)
    if err != nil {
        return RefundResult{}, err
    }
    return RefundResult{Status: "requested"}, nil
})
```

Registration on the **handler** worker (the target namespace's), not the caller. A `.twf` `nexus service` is one `nexus.NewService` with **every** operation it declares registered — never a subset (`twf check` rejects `nexus service Svc.Op`); operations a design deploys apart are a separate `nexus service`:

```go
service := nexus.NewService(BillingServiceName)
err := service.Register(ChargePaymentOperation, RefundPaymentOperation)
if err != nil {
    log.Fatalln("Unable to register operations", err)
}
w.RegisterNexusService(service)
w.RegisterWorkflow(BillingChargeWorkflow) // handler workflows must also be registered
```

## async

`async Op workflow Name` → `temporalnexus.NewWorkflowRunOperation(Op, Name, getOptions)`: any duration; the caller gets a completion callback, with cancellation propagation and re-attachment via operation token. A qualified `workflow orders.Name` is `orders.Name` from that package's import ([workflow-call.md](./workflow-call.md)).

`NewWorkflowRunOperation` takes `func(workflow.Context, I) (O, error)`: one input. A backing workflow with several params takes `NewWorkflowRunOperationWithOptions` with a `Handler`, whose input packs the params into one struct (#415) and unpacks them into `ExecuteUntypedWorkflow`:

```go
var ShipOperation = temporalnexus.MustNewWorkflowRunOperationWithOptions(temporalnexus.WorkflowRunOperationOptions[ShipInput, ShipResult]{
    Name: ShipOp,
    Handler: func(ctx context.Context, in ShipInput, options nexus.StartOperationOptions) (temporalnexus.WorkflowHandle[ShipResult], error) {
        return temporalnexus.ExecuteUntypedWorkflow[ShipResult](ctx, options, ShipOrderStartOptions(in.OrderID), ShipOrder, in.OrderID, in.Address)
    },
})
```

## sync

`sync Op(params) -> (T):` → `nexus.NewSyncOperation(Op, func(ctx, input, options) (T, error))`. It must finish within 10 seconds; on handler timeout the caller's Nexus machinery retries until `ScheduleToCloseTimeout`. The body holds only client forms, each a client call or plain Go:

| Statement in a sync body | Go |
|---|---|
| `workflow Name(args) -> r` (a client start) | `run, err := temporalnexus.GetClient(ctx).ExecuteWorkflow(ctx, NameStartOptions(...), Name, args...)`, then `run.Get(ctx, &r)` ([workflow-call.md](./workflow-call.md)) |
| `detach workflow Name(args)` | the same `ExecuteWorkflow`, its error returned; never `run.Get` |
| `signal Type.Name(args)` + `id:` | `temporalnexus.GetClient(ctx).SignalWorkflow(ctx, workflowID, runID, "Name", arg)`; args pack as in [signal-send.md](./signal-send.md) |
| `close complete(r)` / `close fail(e)` | `return r, nil` / `return T{}, err` |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | Go equivalents ([control-flow.md](./control-flow.md)) |

## Naming contract

Operation names match byte-for-byte at the wire between caller and handler — no transformation. The string passed to the builder is canonical; define it once as a constant (above) and reference it from both sides. Polyglot callers must also agree on service name and input/output types — use Protobuf or JSON as the Data Converter format.
