# Nexus Service Definitions

Nexus services define typed operation groups for cross-namespace communication:

```
nexus_service_def ::= 'nexus' 'service' IDENT ':' NEWLINE
                      INDENT nexus_operation* DEDENT

nexus_operation ::= async_operation | sync_operation

async_operation ::= 'async' IDENT 'workflow' IDENT NEWLINE

sync_operation  ::= 'sync' IDENT params '->' return_type ':' NEWLINE
                    INDENT statement* DEDENT
```

- `service` is a soft keyword (IDENT checked contextually after `nexus`)
- `sync` and `async` are hard keyword tokens
- **Async operations** delegate to a named workflow (one-liner, no body)
- **Sync operations** have a body using the workflow statement set (activities, queries, control flow, close)

**Example:**
```
nexus service OrderService:
    async PlaceOrder workflow ProcessOrder
    sync GetStatus(orderId: string) -> (Status):
        activity FetchStatus(orderId) -> status
        close complete(status)
```

## Resolution

The resolver validates nexus service definitions:
- Duplicate nexus service names produce errors
- Async operations referencing undefined workflows produce errors
- Sync operation bodies are resolved like workflow bodies
