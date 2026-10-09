# nexus service definition

```twf
nexus service BillingService:
    operation ChargePayment(PaymentRequest) -> (PaymentResult)
    operation RefundPayment(RefundRequest) -> (RefundResult)
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
        return client.StartWorkflowOptions{
            ID: "payment-" + input.OrderID, // business-meaningful ID for deduplication
        }, nil
    },
)

// Sync: direct implementation, or temporalnexus.GetClient(ctx) for Temporal client calls
var RefundPaymentOperation = nexus.NewSyncOperation(RefundPaymentOp, func(ctx context.Context, input RefundRequest, options nexus.StartOperationOptions) (RefundResult, error) {
    return RefundResult{}, nil
})
```

Registration on the **handler** worker (the target namespace's), not the caller:

```go
service := nexus.NewService(BillingServiceName)
err := service.Register(ChargePaymentOperation, RefundPaymentOperation)
if err != nil {
    log.Fatalln("Unable to register operations", err)
}
w.RegisterNexusService(service)
w.RegisterWorkflow(BillingChargeWorkflow) // handler workflows must also be registered
```

## Sync vs async

The choice is static — the builder function, not runtime conditions.

- **Sync** (`nexus.NewSyncOperation`) — must finish within 10 seconds: short computations, querying/signaling/updating a workflow, direct calls to external services or databases. On handler timeout the caller's Nexus machinery retries until `ScheduleToCloseTimeout`.
- **Async** (`temporalnexus.NewWorkflowRunOperation`) — any duration, when the operation is a Temporal workflow. The caller gets a completion callback; supports cancellation propagation and re-attachment via operation token.

## Naming contract

Operation names match byte-for-byte at the wire between caller and handler — no transformation. The string passed to the builder is canonical; define it once as a constant (above) and reference it from both sides. Polyglot callers must also agree on service name and input/output types — use Protobuf or JSON as the Data Converter format.
