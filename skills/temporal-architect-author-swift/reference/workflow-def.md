# workflow definition

```twf
workflow ProcessOrder(order: Order) -> (Result):
	close complete(Result{status: "done"})
```

```swift
@Workflow
struct ProcessOrder {
    mutating func run(context: WorkflowContext<Self>, input: Order) async throws -> Result {
        Result(status: "done")
    }
}
```

An `@Workflow` struct named as the `.twf` names it, `name:` unset ([SKILL.md](../SKILL.md#wire-names)), with one `mutating func run(context:input:)` (`Temporal/Worker/Workflow/WorkflowDefinition.swift:98`). It takes **exactly one** `input`: one `.twf` param is that param's type; several are one `Codable, Sendable` struct, by convention the workflow's nested `Input`, whose fields are the params as named; none is `input: Void`. No DSL return type → no return clause; `-> (A, B)` → one struct ([types.md](./types.md)). Workflow state is the struct's stored `var`s, and an `init(input:)` that sets them from the input is optional (DocC [`Developing-Workflows.md` § Initialize state](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Developing-Workflows.md#initialize-state)).

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
```

```swift
@Workflow
struct ShipItem {
    struct Input: Codable, Sendable {
        var order: Order
        var item: Item
    }

    mutating func run(context: WorkflowContext<Self>, input: Input) async throws -> Shipment { … }
}
```

## `id_scheme:`

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
	id_scheme: "ship-{order.id}-{item.id}"
```

```swift
// On ShipItem:
static func id(orderId: String, itemId: String) -> String {
    "ship-\(orderId)-\(itemId)"
}
```

One `static func id(…)` per scheme, on the workflow struct, taking one argument per hole; the macro reads only handler-annotated methods and instance `var`s, so it leaves statics alone (`TemporalMacros/WorkflowMacro.swift:75-93`, `TemporalMacros/WorkflowStateMacro.swift:137-139`). Every start ([workflow-call.md](./workflow-call.md)), every constructed send ([signal-send.md](./signal-send.md#type-head-by-id)), and every client start calls it; never format the ID inline.

A type that has a scheme or ID policies also gets one `static func startOptions(…)` holding its ID, task queue and `default_options:`; every client start uses it ([options.md](./options.md#workflow-id-policies)):

```twf
workflow OrderTracker(orderId: string):
	id_scheme: "tracker-{orderId}"
	default_options:
		workflow_id_conflict_policy: USE_EXISTING
```

```swift
// On OrderTracker:
static func startOptions(orderId: String) -> WorkflowOptions {
    WorkflowOptions(id: id(orderId: orderId), taskQueue: FulfillmentTypes.taskQueue, idConflictPolicy: .useExisting)
}

let handle = try await client.startWorkflow(
    type: OrderTracker.self, options: OrderTracker.startOptions(orderId: orderId), input: orderId)
```

`WorkflowOptions` is the client's (`Temporal/Client/WorkflowService/Model/Workflows/WorkflowOptions.swift:166-183`); the run's input travels in `startWorkflow` (`Temporal/Client/TemporalClient+WorkflowHandle.swift:46-50`).

## Determinism constraints

DocC [`Workflow-Concurrency.md` § Understand deterministic execution guarantees](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#understand-deterministic-execution-guarantees) and [§ Use safe APIs for deterministic execution](https://github.com/apple/swift-temporal-sdk/blob/1.5.0/Sources/Temporal/Documentation.docc/Workflows/Workflow-Concurrency.md#use-safe-apis-for-deterministic-execution): `context.sleep` and `context.randomNumberGenerator` instead of `Task.sleep` and the system generator, and `context.now` instead of `Date()` (`Temporal/Worker/Workflow/WorkflowContext.swift:183`). Changing running workflows: [versioning.md](./versioning.md).
