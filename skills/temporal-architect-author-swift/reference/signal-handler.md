# signal handler

```twf
workflow OrderWorkflow(orderId: string) -> (OrderResult):
	signal PaymentReceived(transactionId: string, amount: decimal):
		status = "payment_received"
		lastTransactionId = transactionId
```

```swift
@Workflow
struct OrderWorkflow {
    struct Payment: Codable, Sendable {
        var transactionId: String
        var amount: Decimal
    }

    var status = ""
    var lastTransactionId = ""
    // Only if the design waits on PaymentReceived.
    var paymentsReceived = Arrivals<Payment>()

    @WorkflowSignal
    mutating func paymentReceived(input: Payment) {
        status = "payment_received"
        lastTransactionId = input.transactionId
        paymentsReceived.add(input)
    }
    // ... run(context:input:)
}
```

- A `@WorkflowSignal` `mutating func` that returns nothing and takes exactly one `input`, with an optional `context: WorkflowContext<Self>` before it (`Temporal/Macros/WorkflowMacro.swift:87`, `TemporalMacros/WorkflowSignalMacro.swift:45-71`); its wire name is the method's, capitalized ([SKILL.md](../SKILL.md#wire-names)). Several `.twf` params are one `Codable, Sendable` struct, read through its fields; none is `input: Void`.
- `input: Void` decodes from exactly one payload: a send with zero payloads is logged and dropped (`Temporal/Converters/PayloadConverter.swift:73-78`, `Temporal/Worker/Workflow/WorkflowInstance.swift:534-545`). Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../../temporal-architect/reference/cross-sdk.md).
- The handler mutates the workflow's stored `var`s: the macro runs it on a copy whose state boxes it shares with `run` (`TemporalMacros/WorkflowSignalMacro.swift:96-108`).
- The handler runs every arrival's body, whether or not anything waits, then adds the arrival to the signal's `Arrivals` ([await-signal.md](./await-signal.md)). A body that blocks (a timer, an activity) takes `context:`, is `async throws`, and adds after its last blocking call: the arrival is pending only once the handler returns. A signal nothing waits on needs no `Arrivals`.

## Handler options

```twf
signal Cancel():
	options:
		unfinished_policy: abandon
		description: "Cancels the subscription"
	cancelled = true
```

```swift
@WorkflowSignal(description: "Cancels the subscription", unfinishedPolicy: .abandon)
mutating func cancel(input: Void) {
    cancelled = true
}
```

- `@WorkflowSignal` and `@WorkflowUpdate` take the same two arguments (`Temporal/Macros/WorkflowMacro.swift:87,185-190`).
- `unfinished_policy: abandon` → `.abandon`; `warn_and_abandon` → `.warnAndAbandon`, the default, which may be left unset (`Temporal/Worker/Workflow/HandlerUnfinishedPolicy.swift:35,41`).
- `description` is UI/CLI text with no runtime behavior.
