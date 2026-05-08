# Nexus: Cross-Namespace Communication

> **Example:** [`nexus.twf`](./nexus.twf)

Nexus enables workflows in one Temporal namespace to call operations in another namespace, with proper authorization and abstraction.

## When to Use Nexus

| Use Nexus | Use Child Workflow Instead |
|-----------|---------------------------|
| Cross-namespace calls | Same namespace |
| Cross-team boundaries | Same team |
| Different security contexts | Same security context |
| Service abstraction needed | Direct coupling acceptable |
| Multi-tenant architectures | Single-tenant |

---

## Nexus Concepts

### Architecture

```text
orders Namespace (Caller)
  OrderCheckout Workflow
    nexus PaymentsEndpoint PaymentsService.ProcessPayment(args) -> result
      |
      v  (cross-namespace)
payments Namespace (Target)
  PaymentsEndpoint (task_queue: "payments")
    PaymentsService
      async ProcessPayment -> starts ProcessPaymentWorkflow

orders Namespace (Caller)
  OrderCheckout Workflow
    detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(args)
      |
      v  (cross-namespace)
notifications Namespace (Target)
  NotificationsEndpoint (task_queue: "notifications")
    NotificationsService
      async SendConfirmation -> starts SendConfirmationWorkflow
```

### Components

| Component | TWF Construct | Description |
|-----------|--------------|-------------|
| **Nexus Service** | `nexus service Name:` | Top-level definition with operations |
| **Async Operation** | `async OpName workflow WorkflowName` | Delegates to a named workflow |
| **Sync Operation** | `sync OpName(params) -> (Type):` | Runs inline with a body |
| **Nexus Endpoint** | `nexus endpoint Name` (in namespace) | Deployment routing with `task_queue` |
| **Service Reference** | `nexus service Name` (in worker) | Links service to worker |
| **Nexus Call** | `nexus Endpoint Service.Op(args)` | Invokes an operation |

---

## Nexus Service Definition

Define a nexus service with typed operations:

```twf
nexus service PaymentsService:
    async ProcessPayment workflow ProcessPaymentWorkflow
    sync GetPaymentStatus(paymentId: string) -> (PaymentStatus):
        activity LookupPayment(paymentId) -> status
        close complete(status)
```

- **Async operations** delegate to a named workflow (one-liner, no body)
- **Sync operations** have a body using the workflow statement set

### Deployment

Each Nexus service lives in its own namespace. The endpoint is defined alongside the worker that serves it, in the target namespace. The caller namespace only hosts the workflows that invoke the endpoints.

```twf
worker paymentProcessingWorker:
    workflow ProcessPaymentWorkflow
    activity LookupPayment
    nexus service PaymentsService

# Target namespace: owns the service and exposes the endpoint
namespace payments:
    worker paymentProcessingWorker
        options:
            task_queue: "payments"
    nexus endpoint PaymentsEndpoint
        options:
            task_queue: "payments"

# Caller namespace: only has the workflows that call into payments
namespace orders:
    worker checkoutWorker
        options:
            task_queue: "checkout"
```

---

## Nexus Call Syntax

### Basic Call

```twf
nexus PaymentsEndpoint PaymentsService.ProcessPayment(order.payment) -> result
```

Three identifiers: `Endpoint Service.Operation(args)` — endpoint name, then service and operation separated by a dot.

### With Options

```twf
nexus PaymentsEndpoint PaymentsService.ProcessPayment(payment) -> result
    options:
        schedule_to_close_timeout: 5m
```

Options: `schedule_to_close_timeout`, `retry_policy`, `priority`.

---

## Execution Modes

Nexus calls support the same three execution modes as child workflows:

| Mode | Syntax | Behavior |
|------|--------|----------|
| **Synchronous** | `nexus Ep Svc.Op(args) -> result` | Caller blocks until operation completes |
| **Async (promise)** | `promise p <- nexus Ep Svc.Op(args)` | Caller continues, awaits promise later |
| **Fire-and-forget** | `detach nexus Ep Svc.Op(args)` | Caller continues, never waits |

### Synchronous (Default)

```twf
workflow Caller(order: Order) -> (Result):
    nexus PaymentsEndpoint PaymentsService.ProcessPayment(order.payment) -> result
    close complete(Result{paymentId: result.id})
```

### Asynchronous (Promise)

```twf
workflow Caller(data: Data) -> (Result):
    promise handle <- nexus PaymentsEndpoint PaymentsService.ProcessPayment(data.payment)
    activity DoOtherWork(data) -> localResult
    await handle -> paymentResult
    close complete(Result{localResult, paymentResult})
```

### Fire-and-Forget (Detach)

```twf
workflow Caller(order: Order) -> (Result):
    detach nexus NotificationsEndpoint NotificationsService.SendConfirmation(order.customer)
    close complete(Result{status: "initiated"})
```

---

## Await Patterns

### Await Nexus

```twf
await nexus PaymentsEndpoint PaymentsService.GetStatus(id) -> status
```

### Await One with Nexus

Race a nexus call against a timeout:

```twf
workflow Caller(data: Data) -> (Result):
    await one:
        nexus PaymentsEndpoint PaymentsService.ProcessPayment(data) -> result:
            close complete(Result{success: true, data: result})
        timer(5m):
            activity AlertTimeout(data)
            close fail(Result{success: false, error: "timeout"})
```

---

## Resolution

The resolver validates all nexus references:

### Errors

| Condition | Error |
|-----------|-------|
| Duplicate `nexus service` name | `duplicate nexus service definition: X` |
| Duplicate endpoint name across namespaces | `duplicate nexus endpoint name "X"` |
| Endpoint not found (endpoints exist) | `undefined nexus endpoint: X` |
| Service not found (services exist) | `undefined nexus service: X` |
| Operation not found on service | `nexus service X has no operation Y` |
| `detach nexus ... -> result` | `detach nexus call cannot have a result` |
| Async op references missing workflow | `async operation Y references undefined workflow: Z` |
| Worker refs missing service | `worker W references undefined nexus service: X` |
| Endpoint missing `task_queue` | `nexus endpoint X missing required task_queue option` |
| Endpoint task queue has no worker with service | `no worker on that queue has service S` |

### Warnings

| Condition | Warning |
|-----------|---------|
| Service not on any worker (namespaces exist) | `nexus service X is not referenced by any worker` |
| Endpoint not found (no endpoints defined) | `unresolved nexus endpoint: X (may be external)` |
| Service not found (no services defined) | `unresolved nexus service: X (may be external)` |

---

## Anti-Patterns

### Nexus for Same-Namespace Calls

Nexus adds routing and authorization overhead that is only justified across namespace boundaries. Calling a service in the same namespace should use a child workflow instead.

```twf
# BAD: Nexus overhead for a call that stays inside the orders namespace
workflow OrderCheckout(order: Order) -> (OrderResult):
    nexus LocalEndpoint LocalService.Validate(order) -> result

# GOOD: Child workflow — same namespace, same team, no boundary to cross
workflow OrderCheckout(order: Order) -> (OrderResult):
    workflow ValidateOrder(order) -> result
```

### Missing Timeout

```twf
# BAD: No deadline
workflow A():
    nexus Endpoint Svc.SlowOperation(data) -> result

# GOOD: Explicit deadline via await one
workflow A():
    await one:
        nexus Endpoint Svc.SlowOperation(data) -> result:
            close complete(Result{result})
        timer(5m):
            close fail(Result{error: "timeout"})
```
