# Cross-Workflow Signals

Mechanisms by which one running workflow sends a signal to another. The *receive* side — signal handler declarations, `await signal`, signal cases in `await one`, and `promise <- signal` — is covered in [Workflow Definitions](./01-workflows.md) and [Statement Syntax](./06-statement-syntax.md). This section covers the *send* side; its grammar is in [Statement Syntax — Signal Send](./06-statement-syntax.md#signal-send).

The head of a send is a **workflow type** or a **handle**. A type head requires an address on the indented lines below it (`TYPE_NEEDS_ID`); a handle takes none (`HANDLE_TAKES_NO_ID`). A bare head that names an in-scope workflow-bound promise is a handle, even when a workflow type shares its name; any other bare head is a type.

| Head | Addressing | Resolution |
|---|---|---|
| handle — `signal ship.Shipped(t)` | The child the sender started and holds (`promise ship <- workflow ShipItem(...)`) | The handle must be a workflow-bound promise; its workflow must declare the signal. |
| type — `signal ShipItem.Shipped(t)` + `id:` | Any instance, by workflow ID (optionally pinned to a run) | The type resolves like a workflow call (qualifier allowed) and must declare the signal. |

## Handle head

A workflow can signal a child it started and still holds a handle to. The handle is a workflow-bound promise (`promise handle <- workflow X(args)`).

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

A workflow-bound promise can be used two ways on the same handle — as an awaitable (`await pay -> payment`) and as a signal target (`signal pay.OrderShipped(shipmentId)`). Sending a signal to a handle does not consume or affect a later `await` on it.

## Type head

Any other target — a workflow the sender did not start, or no longer holds — is named by its type and addressed by workflow ID:

```twf
signal ShipItem.Shipped(event.tracking)
    id: "ship-{event.orderId}-{event.sku}"   # constructed: mirrors the scheme
signal RateLimiter.Tick()
    id: "rate-limiter"                       # constant: mirrors the scheme
signal ShipItem.Shipped("recovered")
    id: wid                                  # learned: one name holding the whole ID
    run_id: rid                              # optional, pins the run
signal Coordinator.Progress(doc.id)
    id: parent                               # the parent execution
signal orders.ShipItem.Shipped(t)            # qualified head
    id: "ship-{o}-{i}"
```

`id:` takes exactly one of three forms:

- **Constructed** — a quoted literal that mirrors the target type's [`id_scheme:`](./01-workflows.md#id-scheme), with the sender's own names in the holes. Fixed text and hole count are checked against the scheme (`ID_MIRROR_MISMATCH`); a literal against a type with no scheme is `NO_ID_SCHEME`. A constant scheme is mirrored by the same constant.
- **Learned** — one path naming a variable that holds the whole ID.
- **`parent`** — the sender's parent execution. It claims the parent is of the head's type; the type must start the sender as a child somewhere in the model (`NOT_A_PARENT`), and every other in-model starter of the sender should declare the signal too (`STARTER_LACKS_SIGNAL`).

**A bare name is the whole ID.** `id: key` under a scheme `"transfer-{req.key}"` sends to `key`, not `transfer-key`. This is not detectable.

`run_id:` is optional and always a name — a run ID is observed, never designed. It follows only a constructed or learned `id:`, never `id: parent`. Absent means the current run.

**The head is a claim, not the address.** Temporal delivers by ID alone. The type names the scheme the literal is checked against, lets the handler be checked, and draws the graph edge — which is why every ID send names a type.

## Fire-and-forget

Signal send is a statement only — there is no `await` or `promise` form, and it is not an `await one` case. A signal carries no return value, so there is nothing to bind, and the only thing a sender could wait on is *send acceptance* (the server accepting the send / the child having started) — never the receiver's handler running. Modeling that would invite the misreading "the target processed my signal."

The one scenario where an asynchronous send helps is raw throughput (not blocking the sender on dispatch), but it carries a strong tradeoff: the sender loses the ability to (1) learn that the target workflow did not exist and (2) handle delivery failures locally. That tradeoff is rarely justified, so the DSL keeps signal send to the single fire-and-forget statement form.
