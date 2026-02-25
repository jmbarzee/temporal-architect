# nexus

## DSL

```twf
nexus PaymentsEndpoint PaymentsService.ProcessPayment(order.payment) -> paymentResult
```

## Go

```go
c := workflow.NewNexusClient("PaymentsEndpoint", "PaymentsService")
var paymentResult PaymentResult
fut := c.ExecuteOperation(ctx, "ProcessPayment", order.Payment, workflow.NexusOperationOptions{})
if err := fut.Get(ctx, &paymentResult); err != nil {
    return Result{}, err
}
```

## Notes

- `workflow.NewNexusClient(endpoint, service)` creates a typed client scoped to one endpoint + service pair
- `ExecuteOperation(ctx, operationName, input, options)` starts the operation and returns a `NexusOperationFuture`
- The calling pattern mirrors child workflows — execute and `.Get()`
- For nexus options (timeouts), see [options.md](./options.md)
- For fire-and-forget nexus: see [detach.md](./detach.md)
- For nexus service definitions and handler registration: see [nexus-service-def.md](./nexus-service-def.md)
- Prefer referencing operation name constants from the service contract (see [nexus-service-def.md](./nexus-service-def.md#naming-contract)) rather than bare strings — keeps caller and handler in sync

## When to use Nexus vs child workflow

- **Use Nexus when:** crossing namespace boundaries (child workflows are same-namespace only in Temporal Cloud), isolating service boundaries (caller only knows endpoint name + operation — not namespace, task queue, retry policy, or workflow ID constraints), enabling polyglot interop (caller and handler can use different SDKs/languages), or enforcing blast-radius isolation between teams
- **Use child workflows when:** within a single namespace and team, partitioning event history, representing a resource with a unique workflow ID, or executing periodic logic via Continue-As-New
- Nexus adds Endpoint configuration overhead — if you don't need cross-namespace or service isolation, child workflows are simpler
- Nexus works within a single namespace too — you can start with Nexus and later split into separate namespaces with configuration changes only
