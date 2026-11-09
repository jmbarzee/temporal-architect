# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```swift
let pay = try await context.startChildWorkflow(ProcessPayment.self, input: order)
async let paid = pay.result()

try await pay.signalWorkflow(signalType: ProcessPayment.OrderShipped.self, input: shipmentId)

// Signaling does not consume the child
let payment = try await paid
```

- The handle is the child's `ChildWorkflowHandle`, which `startChildWorkflow` returns only once the child has started (`Temporal/Worker/Workflow/WorkflowContext.swift:860`), so a send never races the start. Keep the handle even when the child is only signaled, never awaited.
- `signalWorkflow(signalType:input:)` (`Temporal/Worker/Workflow/ChildWorkflowHandle.swift:110-118`) sends the signal definition's wire name: the struct the `@WorkflowSignal` macro nests in the target, its method's name capitalized ([SKILL.md](../SKILL.md#wire-names)), so the input is type-checked. It takes the one input: several args are the handler's input struct; none is `signalWorkflow(signalType:)` (`:134`).
- The call returns on **server acceptance — never on the child's handler running** (`Temporal/Worker/Workflow/WorkflowStateMachineStorage.swift:437-451`). Never treat it as "the child processed my signal". A failed send throws from the call, failing the sender; catch it when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one child the handle refers to.

## Type head (by ID)

```twf
signal ShipItem.Shipped(event.tracking)
	id: "ship-{event.orderId}-{event.sku}"
signal ShipItem.Shipped(stuck.tracking)
	id: stuck.workflowId
	run_id: stuck.runId
signal FulfillOrder.ItemShipped(item.id)
	id: parent
```

```swift
try await context.getExternalWorkflowHandle(ShipItem.self, id: ShipItem.id(orderId: event.orderId, itemId: event.sku))
    .signal(signalType: ShipItem.Shipped.self, input: event.tracking)

try await context.getExternalWorkflowHandle(ShipItem.self, id: stuck.workflowId, runId: stuck.runId)
    .signal(signalType: ShipItem.Shipped.self, input: stuck.tracking)

if let parent = context.info.parent {
    try await context.getExternalWorkflowHandle(FulfillOrder.self, id: parent.workflowID)
        .signal(signalType: FulfillOrder.ItemShipped.self, input: item.id)
}
```

- `context.getExternalWorkflowHandle(_:id:runId:)` (`Temporal/Worker/Workflow/WorkflowContext.swift:790-798`) returns a handle for signals and cancellation; its `signal(signalType:input:)` (`Temporal/Worker/Workflow/ExternalWorkflowHandle.swift:78-86`) follows the handle rules above.
- `id` is the target's full workflow ID: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` passes the variable as is.
- `run_id:` is `runId:`; absent, the handle targets the latest run.
- `id: parent` reads `context.info.parent`, `nil` when no workflow started this run (`Temporal/Worker/Workflow/WorkflowInfo.swift:138,208-212`); the guard skips the send — fail instead if the design has no parentless start.
- The call throws when no such execution is running; handle it as above.
