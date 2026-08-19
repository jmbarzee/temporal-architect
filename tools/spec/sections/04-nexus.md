# Nexus Service Definitions

Nexus services define typed operation groups for cross-namespace communication:

```
nexus_service_def ::= 'nexus' 'service' IDENT ':' NEWLINE
                      INDENT nexus_operation* DEDENT

nexus_operation ::= async_operation | sync_operation

async_operation ::= 'async' IDENT 'workflow' qualified_ref NEWLINE

sync_operation  ::= 'sync' IDENT params '->' return_type ':' NEWLINE
                    INDENT statement* DEDENT
```

- `service` is a soft keyword (IDENT checked contextually after `nexus`)
- `sync` and `async` are hard keyword tokens
- **Async operations** delegate to a named workflow (one-liner, no body). The backing-workflow name
  is a [`qualified_ref`](./14-packages-and-imports.md) — it may carry an optional `pkg.` package
  qualifier when the workflow lives in another package.
- **Sync operations** have a body using the workflow statement set (activities, queries, control flow, close)

**Example:**
```
nexus service OrderService:
    async PlaceOrder workflow ProcessOrder
    sync GetStatus(orderId: string) -> (Status):
        activity FetchStatus(orderId) -> status
        close complete(status)
```

## Nexus Qualification Table

With [packages](./14-packages-and-imports.md), the three nexus reference kinds qualify differently,
faithfully to Temporal's registries:

| Kind | Scope | Qualification |
|------|-------|---------------|
| **Endpoint** | Flat-global (cluster-global endpoint registry) | **Never qualified.** Endpoints share one global namespace; a cross-package duplicate endpoint name stays an error. |
| **Service** | Package-scoped | **Qualified cross-package** by package leaf name (or import alias): `nexus Ep pkg.Svc.Op`. Bare within the same package. |
| **Operation** | Member of its service | **Never independently qualified.** The operation is selected off the (possibly qualified) service by the trailing `.Op`. |

So in `nexus OrderEndpoint orders.OrderService.PlaceOrder(order)`, `OrderEndpoint` is the
flat-global endpoint (unqualified), `orders.OrderService` is the package-qualified service, and
`PlaceOrder` is the operation member. The package qualifier on the service resolves against the
imported package that declares it; an unresolved (external) import makes the qualified service
resolve as external.

## Resolution

The resolver validates nexus service definitions:
- Duplicate nexus service names produce errors
- Async operations referencing undefined workflows produce errors
- Sync operation bodies are resolved like workflow bodies
