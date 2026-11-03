# Nexus: Cross-Namespace Communication

> **Example:** [`nexus.twf`](./nexus.twf)

Nexus lets a workflow in one namespace call an operation in another, behind a typed service contract.

## When to Use Nexus

| Use Nexus | Use a Child Workflow Instead |
|-----------|---------------------------|
| Cross-namespace calls | Same namespace |
| Cross-team boundaries | Same team |
| Different security contexts | Same security context |
| Service abstraction needed | Direct coupling acceptable |
| Multi-tenant architectures | Single-tenant |

Nexus adds routing and authorization overhead that only a namespace boundary justifies; a same-namespace call is a child workflow. Nexus is also not a reason to add namespaces — the default count is one ([namespaces.md](../reference/namespaces.md)).

## Constructs

| Component | TWF Construct | Notes |
|-----------|--------------|-------|
| **Nexus Service** | `nexus service Name:` | Top-level; holds operations |
| **Async Operation** | `async OpName workflow WorkflowName` | One-liner; delegates to a named workflow, which needs an `id_scheme:` (the start may be retried) |
| **Sync Operation** | `sync OpName(params) -> (Type):` | Inline body, workflow statement set |
| **Service Registration** | `nexus service Name` (in `worker`) | The worker that serves it — always the whole service (`Svc.Op` is `WORKER_REGISTERS_OPERATION`); operations that deploy apart are separate services |
| **Nexus Endpoint** | `nexus endpoint Name` (in `namespace`) | Requires a static `task_queue`; a worker on that queue **in the endpoint's namespace** must register the service. Optional `allowed_caller_namespaces: [...]` |
| **Nexus Call** | `nexus Endpoint Service.Op(args)` | Endpoint, then `Service.Op` |

**Deployment:** the endpoint lives in the **target** namespace, next to the worker that serves the service; the caller namespace hosts only the calling workflows and references the endpoint by name.

**Exposure:** an endpoint exposes **every** service registered on its queue — callers name the service per call. One service per endpoint therefore means one queue per endpoint. Several endpoints on one queue are allowed, but they expose the same services and do not separate access to them.

**Access policy:** declare `allowed_caller_namespaces: ["orders", "billing"]` on every cross-team endpoint. A call from a namespace not listed — **including the endpoint's own** — is `NEXUS_CALLER_NOT_ALLOWED`. Absent means no policy is modelled; `[]` allows no caller. Entries are `.twf` namespace names (not Cloud IDs), matched by spelling: `tenant-{org}` admits the `tenant-{org}` family. When the endpoint's or its namespace's name has the same `{org}`, each member admits its own tenant; otherwise the entry admits every tenant. Temporal Cloud enforces the list; self-hosted has no built-in allowlist.

## Execution Modes

The same modes as child workflows:

| Mode | Syntax | Behavior |
|------|--------|----------|
| **Synchronous** | `nexus Ep Svc.Op(args) -> result` | Blocks until the operation completes (also `await nexus …`) |
| **Async (promise)** | `promise p <- nexus Ep Svc.Op(args)` | Continues; `await p -> result` later |
| **Fire-and-forget** | `detach nexus Ep Svc.Op(args)` | Never waits; a `-> result` is a parse error |

**Give every nexus call a deadline** — `schedule_to_close_timeout`, or an `await one` race against a `timer` (`NexusWithTimeout` in the example).

> If the timer wins, the operation keeps running in the target namespace. To void it on timeout, model a compensating nexus op or activity.

## Fronting a worker family

An endpoint targets one static queue, so a `{param}` in its `task_queue` is `ENDPOINT_TASK_QUEUE_TEMPLATED`, and a [per-instance family](./task-queues.md#per-instance-worker-families) that registers a service is unreachable (`INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE`). Put the service on a static queue in the family's namespace and give it an **async** operation whose workflow calls the family. Activities cannot cross namespaces, so that workflow runs there. A caller in another namespace reaches a family the same way.

A **sync** handler that routes on has no workflow context and a ~10s deadline, and Nexus retries a start that misses it, so its action must be idempotent: a signal whose handler is idempotent, an Update whose ID derives from the Nexus request ID, or (experimental, Go `client.ExecuteActivity`) a standalone activity on the family queue whose activity ID derives from the request ID. Prefer the async operation.

## Resolution

Diagnostics: [common-errors.md](../reference/common-errors.md). Cross-package services: [packages.md](./packages.md#nexus-across-packages). Templated endpoints: [namespaces.md](../reference/namespaces.md#parameterized-namespaces-and-endpoints).
