# Cross-Workflow Signals

Mechanisms by which one running workflow sends a signal to another. The *receive* side — signal handler declarations, `await signal`, signal cases in `await one`, and `promise <- signal` — is covered in [Workflow Definitions](./01-workflows.md) and [Statement Syntax](./06-statement-syntax.md). This section covers the *send* side.

## Handle-bound send

A workflow can signal a child it started and still holds a handle to. The handle is a workflow-bound promise (`promise handle <- workflow X(args)`); the dot-qualified name selects a signal the target workflow declares.

| Form | Addressing | Resolution |
|---|---|---|
| `signal handle.Name(args)` | A workflow-bound promise (`promise handle <- workflow X(args)`) | The handle must be workflow-typed; the target workflow must declare `signal Name`. |

```twf
workflow OrderSaga(order: Order) -> (SagaResult):
    promise pay <- workflow ProcessPayment(order)
    promise ship <- workflow ShipOrder(order)

    # Notify the payment workflow that the order has shipped
    signal pay.OrderShipped(shipmentId)

    # Wait for both children to finish
    await all:
        await pay -> payment
        await ship -> shipment
    close complete(SagaResult{payment, shipment})
```

Maps to `ChildWorkflowFuture.SignalChildWorkflow`.

## Fire-and-forget

Signal send is a statement only — there is no `await` or `promise` form, and it is not an `await one` case. A signal carries no return value, so there is nothing to bind, and the only thing a sender could wait on is *send acceptance* (the server accepting the send / the child having started) — never the receiver's handler running. Modeling that would invite the misreading "the target processed my signal."

The one scenario where an asynchronous send helps is raw throughput (not blocking the sender on dispatch), but it carries a strong tradeoff: the sender loses the ability to (1) learn that the target workflow did not exist and (2) handle delivery failures locally. That tradeoff is rarely justified, so the DSL keeps signal send to the single fire-and-forget statement form.

## The handle serves two roles

A workflow-bound promise can be used two ways on the same handle:

- as an awaitable — `await pay -> payment` waits for the child's result;
- as a signal target — `signal pay.OrderShipped(shipmentId)` sends it a signal.

Both are valid on the same promise; sending a signal to a handle does not consume or affect a later `await` on it.

This section documents only what the DSL provides. It does not enumerate absent capabilities — addressing a workflow you did not start, or sending cross-workflow queries or updates — consistent with how the spec treats every other unimplemented Temporal feature.
