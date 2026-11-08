# nexus call

```twf
nexus BillingEndpoint BillingService.ChargePayment(order.payment) -> paymentResult
```

```haskell
out <-
  executeNexusOperation
    (makeNexusClient "BillingEndpoint" "BillingService")
    "ChargePayment"
    defaultScheduleNexusOperationOptions
    (encodeJSON order.payment)
paymentResult <- either error pure (decodeJSON out)
```

- `makeNexusClient endpoint service` scopes a client to one endpoint + service (`Workflow/Types.hs:437-446`); `executeNexusOperation client "Op" options input` starts the operation and waits its result (`Workflow.hs:588-597`). Every name is a string ([SKILL.md](../SKILL.md#wire-names)).
- **The call is untyped**: the input and the result are raw `Payload`s, so encode with `encodeJSON` and decode with `decodeJSON` (`Payload.hs:173-182`) at every call; a helper per caller, as the corpus's `callNexus`, keeps them in one place. `either error pure` fails the run on a result that does not decode.
- **An operation takes one input**, the call's one `Payload` (`Workflow.hs:535-541`): an operation's several values travel as one declared record, per spec 04.
- A failed operation throws `NexusOperationFailed` from the call; a cancelled or timed-out one `NexusOperationCancelled` or `NexusOperationTimedOut` (`Workflow.hs:572-577`).
- A qualified service, `nexus Ep orders.OrderService.PlaceOrder(...)`, keeps the service's name, `"OrderService"`: the package qualifier picks the input and result types from that package's module tree, not the string.
- Bound to a promise, the call is `startNexusOperation`, whose `Task` is waited with `wait`. Options: [options.md](./options.md#nexus-operation-options). Fire-and-forget: [detach.md](./detach.md).
