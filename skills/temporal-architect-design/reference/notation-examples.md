# TWF Notation Examples

## Basic Structure

A complete file: workflows, activities, worker registration, namespace deployment. Every called activity and workflow must be defined, so each example below carries its supporting definitions.

```twf
workflow WorkflowName(input: InputType) -> (OutputType):
    activity ActivityName(input) -> result
    workflow ChildWorkflowName(input) -> childResult
    close complete(OutputType{result, childResult})

workflow ChildWorkflowName(input: InputType) -> (ChildResult):
    activity DoWork(input) -> result
    close complete(ChildResult{result})

activity ActivityName(input: InputType) -> (Result):
    return process(input)

activity DoWork(input: InputType) -> (WorkResult):
    return work(input)

worker mainWorker:
    workflow WorkflowName
    workflow ChildWorkflowName
    activity ActivityName
    activity DoWork

namespace default:
    worker mainWorker
        options:
            task_queue: "main"
```

## Activity Body Detail

Activity bodies are free-form pseudocode (`raw_stmt`) standing in for the SDK implementation. Every activity needs at least one statement — comments alone don't count. Detail scales with how unobvious the behavior is from name and signature:

**Obvious** — minimal body:

```twf
activity SendEmail(to: string, body: string):
    send(to, body)
```

**Non-obvious** — comments describe intent, pseudocode anchors the body:

```twf
activity ExecuteToolCalls(toolCalls: ToolCalls) -> (ToolResults):
    # Look up each tool by name in the tool registry
    # Execute calls in parallel where possible
    # If a tool is not found, return an error result (don't fail the activity)
    registry.executeAll(toolCalls)
```

**Complex contract** — describe error conditions, ordering, and idempotency:

```twf
activity ReconcileInventory(warehouseId: string, expected: Inventory) -> (ReconcileResult):
    # Fetch current inventory, diff against expected, flag discrepancies
    # Must be idempotent — running twice with same input produces same flags
    # Warehouse API is rate-limited: max 10 requests/second
    warehouse.reconcile(warehouseId, expected)
```

## Control Flow

```twf
workflow ProcessOrder(order: Order) -> (Result):
    activity ValidateOrder(order) -> validated

    if (validated.priority == "high"):
        activity ExpediteOrder(order)
    else:
        activity StandardProcessing(order)

    # Sequential loop — use for when each iteration depends on order or shared state
    # For independent iterations, consider await all with parallel activities instead
    for (item in order.items):
        activity ProcessItem(item)

    # Parallel execution — use await all when tasks are independent and all results needed
    await all:
        activity ReserveInventory(order) -> inventory
        activity ProcessPayment(order) -> payment

    close complete(Result{inventory, payment})

activity ValidateOrder(order: Order) -> (ValidateResult):
    return validate(order)

activity ExpediteOrder(order: Order):
    expedite(order)

activity StandardProcessing(order: Order):
    process(order)

activity ProcessItem(item: Item) -> (ItemResult):
    return process(item)

activity ReserveInventory(order: Order) -> (Inventory):
    return reserve(order)

activity ProcessPayment(order: Order) -> (Payment):
    return charge(order)
```

## Temporal Primitives in Notation

```twf
workflow OrderFulfillment(orderId: string) -> (OrderResult):
    signal PaymentReceived(transactionId: string, amount: decimal):
        paymentStatus = "received"
        lastTransactionId = transactionId

    query GetOrderStatus() -> (OrderStatus):
        return OrderStatus{status: status, payment: paymentStatus}

    update UpdateShippingAddress(address: Address) -> (Result):
        activity ValidateAddress(address) -> validation
        if (validation.valid):
            shippingAddress = address
            return Result{success: true}
        else:
            return Result{success: false, error: validation.reason}

    activity GetOrder(orderId) -> order
    paymentStatus = "pending"
    status = "awaiting_payment"

    await timer(1h)

    # Wait for signal with timeout
    await one:
        signal PaymentReceived:
            status = "processing"
        timer(24h):
            activity CancelOrder(orderId)
            close fail(OrderResult{status: "cancelled"})

    workflow ShipOrder(order) -> shipResult

    nexus NotificationsEndpoint NotificationsService.SendNotification(order.customer, "shipped")

    close complete(OrderResult{status: "completed"})

# Supporting definitions
activity GetOrder(orderId: string) -> (Order):
    return db.get(orderId)

activity ValidateAddress(address: Address) -> (Validation):
    return validate(address)

activity CancelOrder(orderId: string):
    cancel(orderId)

workflow ShipOrder(order: Order) -> (ShipResult):
    activity CreateShipment(order) -> shipment
    close complete(ShipResult{shipment})

activity CreateShipment(order: Order) -> (Shipment):
    return ship(order)

workflow SendNotification(customer: Customer, message: string):
    activity Notify(customer, message)
    close complete

activity Notify(customer: Customer, message: string):
    send(customer, message)

nexus service NotificationsService:
    async SendNotification workflow SendNotification

worker orderFulfillmentWorker:
    workflow OrderFulfillment
    workflow ShipOrder
    workflow SendNotification
    activity GetOrder
    activity ValidateAddress
    activity CancelOrder
    activity CreateShipment
    activity Notify
    nexus service NotificationsService

namespace default:
    worker orderFulfillmentWorker
        options:
            task_queue: "orderFulfillment"
    nexus endpoint NotificationsEndpoint
        options:
            task_queue: "orderFulfillment"
```

## Async Patterns

```twf
workflow OrderPipeline(order: Order) -> (PipelineResult):
    state:
        condition paymentConfirmed

    update ConfirmPayment(txn: Transaction) -> (ConfirmResult):
        activity ValidateTxn(txn) -> validation
        if (validation.ok):
            set paymentConfirmed
            return ConfirmResult{accepted: true}
        else:
            return ConfirmResult{accepted: false, reason: validation.error}

    promise inventory <- activity CheckInventory(order)

    detach workflow AuditLog(order)

    await paymentConfirmed

    await inventory -> stock

    switch (stock.level):
        case "high":
            activity ShipStandard(order) -> shipment
        case "low":
            activity ShipFromWarehouse(order, stock.warehouseId) -> shipment
        case "none":
            close fail(PipelineResult{error: "out of stock"})

    close complete(PipelineResult{shipment})

activity ProcessLargeDataset(datasetId: string) -> (ProcessResult):
    heartbeat()
    return process(datasetId)

# Supporting definitions
activity CheckInventory(order: Order) -> (InventoryStatus):
    return inventory.check(order)

activity ValidateTxn(txn: Transaction) -> (TxnValidation):
    return payments.validate(txn)

workflow AuditLog(order: Order):
    activity RecordAudit(order)
    close complete

activity RecordAudit(order: Order):
    audit.record(order)

activity ShipStandard(order: Order) -> (Shipment):
    return shipping.standard(order)

activity ShipFromWarehouse(order: Order, warehouseId: string) -> (Shipment):
    return shipping.fromWarehouse(order, warehouseId)

worker pipelineWorker:
    workflow OrderPipeline
    workflow AuditLog
    activity CheckInventory
    activity ValidateTxn
    activity RecordAudit
    activity ShipStandard
    activity ShipFromWarehouse
    activity ProcessLargeDataset

namespace default:
    worker pipelineWorker
        options:
            task_queue: "pipeline"
```
