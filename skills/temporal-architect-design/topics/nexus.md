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
| **Async Operation** | `async OpName workflow WorkflowName` | One-liner; delegates to a named workflow |
| **Sync Operation** | `sync OpName(params) -> (Type):` | Inline body, workflow statement set |
| **Service Registration** | `nexus service Name` (in `worker`) | The worker that serves it |
| **Nexus Endpoint** | `nexus endpoint Name` (in `namespace`) | Requires `task_queue`; a worker on that queue must register the service |
| **Nexus Call** | `nexus Endpoint Service.Op(args)` | Endpoint, then `Service.Op` |

**Deployment:** the endpoint lives in the **target** namespace, next to the worker that serves the service; the caller namespace hosts only the calling workflows and references the endpoint by name.

## Execution Modes

The same modes as child workflows:

| Mode | Syntax | Behavior |
|------|--------|----------|
| **Synchronous** | `nexus Ep Svc.Op(args) -> result` | Blocks until the operation completes (also `await nexus …`) |
| **Async (promise)** | `promise p <- nexus Ep Svc.Op(args)` | Continues; `await p -> result` later |
| **Fire-and-forget** | `detach nexus Ep Svc.Op(args)` | Never waits; a `-> result` is a parse error |

**Give every nexus call a deadline** — `schedule_to_close_timeout`, or an `await one` race against a `timer` (`NexusWithTimeout` in the example).

> If the timer wins, the operation keeps running in the target namespace. To void it on timeout, model a compensating nexus op or activity.

## Resolution

Diagnostics: [common-errors.md](../reference/common-errors.md). Cross-package services: [packages.md](./packages.md#nexus-across-packages). Templated endpoints: [namespaces.md](../reference/namespaces.md#parameterized-namespaces-and-endpoints).
