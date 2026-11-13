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
- **Sync operations** have a body of [client statements](./05-statements.md#client-statements)
- **An operation takes one input.** A sync operation declares one parameter; an async operation's
  backing workflow takes one. Several values are wrapped in a declared type. Every SDK carries one
  input payload per operation.
- **Starts from a nexus service are client starts.** An async operation starts its backing workflow
  with that workflow's `default_options:`; a `workflow` start in a sync body goes through the
  Temporal client, so it takes `workflow_id_conflict_policy` and no `parent_close_policy` (see
  [Statement Syntax — Workflow Call](./06-statement-syntax.md#workflow-call)). Under
  `USE_EXISTING`, an async operation's caller attaches to the running workflow (server 1.27+).
- **An async operation's backing workflow needs an `id_scheme:`.** Its start request may be
  retried, so the workflow ID must derive from the operation's input; a backing workflow with no scheme is
  `NEXUS_RUN_WITHOUT_ID_SCHEME` (warning).

The service IDENT is the Nexus service name and each operation IDENT its operation name, which caller and handler match byte for byte.

**Example:**
```
nexus service OrderService:
	async PlaceOrder workflow ProcessOrder
	sync GetStatus(orderId: string) -> (Status):
		workflow LookupStatus(orderId) -> status
		close complete(status)
```

## Nexus Qualification Table

With [packages](./14-packages-and-imports.md), the three nexus reference kinds qualify differently,
faithfully to Temporal's registries:

| Kind | Scope | Qualification |
|------|-------|---------------|
| **Endpoint** | Flat-global (cluster-global endpoint registry) | **Never qualified.** Endpoints share one global namespace; a cross-package duplicate endpoint name stays an error. |
| **Service** | Package-scoped | **Qualified cross-package** by package leaf name (or import alias): `nexus Ep pkg.Svc.Op`. Bare within the same package. |
| **Operation** | Member of its service | **Never independently qualified.** The operation is selected off the (possibly qualified) service by the trailing `.Op`. A worker registers whole services, so a trailing `.Op` in a worker `nexus service` entry is never valid (`WORKER_REGISTERS_OPERATION`). |

So in `nexus OrderEndpoint orders.OrderService.PlaceOrder(order)`, `OrderEndpoint` is the
flat-global endpoint (unqualified), `orders.OrderService` is the package-qualified service, and
`PlaceOrder` is the operation member. The package qualifier on the service resolves against the
imported package that declares it; an unresolved (external) import makes the qualified service
resolve as external.

### Templated endpoint references

The endpoint reference in a `nexus` call is a [`deploy_name`](./08-tokens-and-keywords.md), so it
may carry hyphens and `{param}` template parameters to reference a per-tenant endpoint family:
`nexus fabric-shard-{org}-BootstrapShard svc.Op(args)` (see
[Parameterized namespaces and endpoints](./03-workers-and-namespaces.md#parameterized-namespaces-and-endpoints)).

The **qualification table above is unchanged**: endpoints remain flat-global and are **never
package-qualified**, templated or not. A templated reference joins its definition by the **full
templated name string** through the existing flat-global endpoint registry — the `{org}` parameter is part
of the name, matched by spelling. A reference whose full name matches no defined endpoint (including a
static reference to a templated endpoint, or a mismatched parameter spelling) is the existing
undefined-endpoint hard error; no new cross-file machinery is introduced, since cross-file endpoint
resolution already spans the flat-global registry.

## Endpoint exposure and access

An endpoint has no service field: callers name the service on every call, and Temporal routes the
request to the endpoint's `(namespace, task_queue)`. So an endpoint **exposes every service** that a
worker polling its target registers. One endpoint can front several services (a router queue), and
`nexus Ep SvcB.Op()` is valid through any endpoint whose queue hosts `SvcB`. Workers sharing that
queue must agree on their services (see the coherence rule in
[Workers and Namespaces — Resolution](./03-workers-and-namespaces.md#resolution)), so the set an
endpoint exposes is well defined.

Several endpoints may target one queue; Temporal allows it (a rename cutover keeps an old and a new
name side by side). Each then exposes the same services, and since an access policy is per endpoint,
endpoints sharing a queue **do not separate access** to its services. To give a service its own
endpoint, or its own access boundary, put it on its own task queue.

An endpoint's [`allowed_caller_namespaces`](./03-workers-and-namespaces.md#endpoint-options) lists
the namespaces a call through it may originate in. A call's origin namespaces are those hosting the
calling workflow. Each origin the list omits raises `NEXUS_CALLER_NOT_ALLOWED` at the call site. The check needs only the endpoint and the
caller: it runs whether or not the called service resolves, so a call into an external service is
checked too.

## Resolution

The resolver validates nexus service definitions:
- Duplicate nexus service names produce errors
- An operation name declared twice in one service is `DUPLICATE_NEXUS_OPERATION` on the later declaration; the first is the operation
- Async operations referencing undefined workflows produce errors
- Sync operation bodies are resolved like workflow bodies
