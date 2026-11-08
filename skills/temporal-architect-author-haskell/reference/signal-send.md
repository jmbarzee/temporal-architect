# signal send

## Handle head (a child)

```twf
promise pay <- workflow ProcessPayment(order)
signal pay.OrderShipped(shipmentId)
await pay -> payment
```

```haskell
pay <- startChildWorkflow processPayment defaultChildWorkflowOptions order
waitChildWorkflowStart pay

wait =<< signal pay orderShippedSignal shipmentId

-- Signaling does not consume the handle
payment <- wait pay
```

- `signal handle signalRef args…` (`Workflow.hs:604-611`) takes the child's `ChildWorkflowHandle` and the receiver's `KnownSignal` value, so the SDK sends its name and the codec checks the args; they are positional, one payload each. Keep the `pay` binding even when it is only signaled, never awaited.
- `startChildWorkflow` returns before the child starts: `waitChildWorkflowStart` first, so the send finds the child (`Workflow/Unsafe/Handle.hs:99-102`).
- `signal` returns a `Task ()` that resolves on **server acceptance — never on the child's handler running**. Never treat it as "the child processed my signal". `wait` it, so a failed send throws `SignalExternalWorkflowFailed` and fails the sender (`Workflow.hs:656-661`); catch it when it should not.
- A send is a statement — not an `await one:` case or `await all:` branch. Each call is one delivery to the one running child the handle refers to.

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

```haskell
shipped <- getExternalWorkflowHandle (shipItemId event.orderId event.sku) Nothing
wait =<< signal shipped shippedSignal event.tracking

stuckRun <- getExternalWorkflowHandle (WorkflowId stuck.workflowId) (Just (RunId stuck.runId))
wait =<< signal stuckRun shippedSignal stuck.tracking

i <- info
for_ i.parent \p -> do
  fulfill <- getExternalWorkflowHandle p.parentWorkflowId Nothing
  wait =<< signal fulfill itemShippedSignal item.itemId
```

- `getExternalWorkflowHandle workflowId runId` (`Workflow.hs:1572-1580`) returns a handle to signal; `signal` on it follows the handle rules above (`Workflow.hs:614-621`). The `KnownSignal` value is the receiver's, imported from its module.
- `workflowId`: a constructed `id:` calls the target's ID function ([workflow-def.md](./workflow-def.md#id_scheme)) with the sender's names; a learned `id:` wraps the variable as is.
- `runId` is `Just` the `run_id:`, or `Nothing` (the current run) when absent.
- `id: parent` reads `parent` from `info`, `Nothing` when no workflow started this run (`Workflow/Types.hs:39`, `ParentInfo`, `Common.hs:492-496`); `for_` skips the send — fail instead if the design has no parentless start.
- The wait throws when no such execution is running; handle it as above.
