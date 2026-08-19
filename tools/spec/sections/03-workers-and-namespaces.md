# Worker and Namespace Definitions

## Worker Definitions

Workers are reusable type sets that group workflows and activities:

```
worker_def ::= 'worker' IDENT ':' NEWLINE
               INDENT
               worker_entry*
               DEDENT

worker_entry ::= 'workflow' IDENT NEWLINE
               | 'activity' IDENT NEWLINE
               | 'nexus' 'service' IDENT NEWLINE
```

Worker names use lowerCamelCase convention. Workers contain workflow, activity, and nexus service references — deployment configuration (task_queue, etc.) is specified when the worker is instantiated in a namespace block.

Each registration entry's referenced name is a [`qualified_ref`](./14-packages-and-imports.md): it
may carry an optional `pkg.` package qualifier (`workflow orders.ProcessOrder`,
`activity billing.ChargeCard`, `nexus service orders.OrderService`) to register a symbol declared
in another package. The qualifier is bare for same-package symbols; a qualified registration resolves against the
imported package that owns the symbol, and an unresolved (external) import makes qualified
registrations resolve as external.

**Example:**
```
worker orderTypes:
    workflow ProcessOrder
    workflow CancelOrder
    activity ChargePayment
    activity SendNotification
    nexus service OrderService
```

## Namespace Definitions

> **`namespace` is not `package`.** `namespace` is the Temporal **deployment** keyword described
> below — it instantiates workers and endpoints into a deployment topology and has real runtime
> meaning. The [`package`](./14-packages-and-imports.md) keyword is unrelated: it is a compile-time,
> directory-scoped grouping of symbol *names* with **no runtime meaning**. Declaring or importing a
> package changes nothing about namespaces or deployment.

Namespaces instantiate workers with deployment options, defining the deployment topology:

```
namespace_def ::= 'namespace' deploy_name ':' NEWLINE
                  INDENT
                  namespace_entry*
                  DEDENT

namespace_entry ::= 'worker' IDENT NEWLINE [options_line]
                  | 'nexus' 'endpoint' deploy_name NEWLINE [options_line]
```

The namespace name and the nexus endpoint name are [`deploy_name`s](./08-tokens-and-keywords.md) —
they name runtime deployment strings, so they admit hyphens and `{param}` template holes (see
*Parameterized namespaces and endpoints* below). The instantiated `worker` reference stays a plain
`IDENT`: it is a code symbol, not a deployment string.

Each worker instantiation inside a namespace requires a `task_queue` option. Nexus endpoint instantiations also require a `task_queue` option for routing.

**Example:**
```
namespace orders:
    worker orderTypes
        options:
            task_queue: "orderProcessing"
            max_concurrent_activity_executions: 50
    nexus endpoint OrderEndpoint
        options:
            task_queue: "orderProcessing"
```

The same worker type set can be instantiated in multiple namespaces with different options:

```
namespace staging:
    worker orderTypes
        options:
            task_queue: "staging-orders"
```

## Parameterized namespaces and endpoints

Real Temporal systems template `namespace` and `nexus endpoint` names per tenant — a
`fabric-shard-{org}` namespace with a matching `fabric-shard-{org}-BootstrapShard` endpoint family,
created dynamically at runtime. TWF models a family inline: a `{param}` template hole inside a
[`deploy_name`](./08-tokens-and-keywords.md) marks the axis the family varies over.

```
namespace fabric-shard-{org}:
    worker shardTypes
        options:
            task_queue: "fabric-shard-{org}-bootstrap"
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "fabric-shard-{org}-bootstrap"
```

The semantics are **design-altitude**, not runtime string substitution:

- **`{param}` is a cardinality/correlation annotation, not a variable.** Nothing binds `{org}` to a
  concrete value. A `{org}` in a caller's identifier means "the org of this execution"; it annotates
  that the construct is a per-tenant *family* rather than a single static deployment.
- **Token-equality is identity.** There is no declaration site. Every `{org}` in a file denotes the
  same dimension, correlated by the token spelling alone. A declared axis primitive (which would add
  typo/undefined-reference detection and correlation-by-definition) was considered and deferred to
  **[#129](https://github.com/jmbarzee/temporal-architect/issues/129)**; inline templating is what
  this surface ships.
- **Reach: identifiers and string option values.** `{param}` is legal both in the namespace/endpoint
  `deploy_name` and inside `STRING` option values (`task_queue: "fabric-shard-{org}-bootstrap"`). A
  per-tenant namespace realistically needs a per-tenant task queue, so the hole must reach into the
  string; a hole in a string denotes the same dimension as the identically-named hole in the
  enclosing identifier.

A namespace or endpoint with no `{param}` holes is an ordinary static deployment and is unchanged.
See [Resolution](#resolution) below for the rules that keep a family coherent.

## Shared Workers: Joint Ownership

One physical worker can host the workflows, activities, and nexus services of **many
independently-owned domains**. This works because a `worker`'s registration entries take a
[`qualified_ref`](./14-packages-and-imports.md) (see *Worker Definitions* above): each entry may
carry a `pkg.` qualifier that names a symbol declared in another package.

```
worker sharedTypes:
    workflow orders.ProcessOrder
    activity billing.ChargeCard
    nexus service orders.OrderService
```

The natural home for such a worker is a dedicated **topology package** — a file that `import`s each
domain and declares the shared worker (and the `namespace` that instantiates it) once, registering
every domain's types through qualified refs:

```
package deploy

import "github.com/acme/orders"
import "github.com/acme/billing"

worker sharedTypes:
    workflow orders.ProcessOrder
    activity billing.ChargeCard
    nexus service orders.OrderService

namespace production:
    worker sharedTypes
        options:
            task_queue: "shared"
```

Two consequences follow:

- **Domain files need not declare a `worker` or `namespace`.** A domain package can define only its
  workflows, activities, and nexus services; deployment topology can live entirely in the
  topology-owner file. Recall that `namespace` is a **deployment** construct and `package` is a
  compile-time symbol grouping with no runtime meaning — see the *`namespace` is not `package`* note
  above and [Packages and Imports](./14-packages-and-imports.md). A worker/namespace declared in the
  topology package draws its registered types across those package boundaries; it does not require a
  matching worker or namespace in each domain.
- **A shared worker is a single-vantage deployment fact.** The topology package is the one place
  that owns the shared worker process and task queue. Ownership is central, not distributed across
  the domains that contribute types to it.

### Validator interplay

Coverage diagnostics are judged on the **resolved `(package, name)`** of each registration, so
qualified registrations onto an instantiated worker count as *genuine* coverage:

- A domain workflow/activity/nexus service registered by qualified ref onto the shared worker is
  **covered** — it does not raise `UNCOVERED_WORKFLOW`, `UNCOVERED_ACTIVITY`, or
  `UNCOVERED_NEXUS_SERVICE`, and no placeholder worker is needed to silence such warnings.
- The shared worker, being instantiated in the topology package's namespace, is not
  `UNINSTANTIATED_WORKER`.
- A type that **nobody** registers still warns — the coverage signal is preserved, not suppressed.

Separately, coverage and call-routing diagnostics only run for an analysis that has a `namespace`
(see [Resolution and Errors](./11-resolution-and-errors.md)): a symbols-only slice with no
`namespace` produces no coverage/routing diagnostics of its own. This is existing behavior, not a
suppression affordance — there is no "mark external to silence coverage" construct, and none is
introduced here.

## Worker Options

Worker instantiation options (all snake_case). This set is the **union/superset of SDK worker
options**, excluding per-language one-offs. Keys are accepted **permissively, with no per-language
validation** — an option that a particular SDK lacks does not gate its inclusion here. Express
*strategy/intent* at design altitude (e.g. `versioning: build_id`), not exhaustive numeric ops tuning.

| Key | Type |
|-----|------|
| `task_queue` | string (required) |
| `worker_activity_rate_limit` | number |
| `task_queue_activity_rate_limit` | number |
| `worker_local_activity_rate_limit` | number |
| `max_concurrent_activity_executions` | number |
| `max_concurrent_workflow_task_executions` | number |
| `max_concurrent_local_activity_executions` | number |
| `max_concurrent_nexus_task_executions` | number |
| `max_concurrent_workflow_task_pollers` | number |
| `max_concurrent_activity_task_pollers` | number |
| `max_concurrent_nexus_task_pollers` | number |
| `max_cached_workflows` | number |
| `sticky_schedule_to_start_timeout` | duration |
| `heartbeat_throttle_interval` | duration |
| `worker_identity` | string |
| `worker_shutdown_timeout` | duration |
| `local_activity_only_mode` | bool |
| `enable_sessions` | bool |
| `max_concurrent_session_executions` | number |
| `versioning` | enum (`none`, `build_id`, `deployment`) |

## Endpoint Options

Nexus endpoint instantiation options:

| Key | Type |
|-----|------|
| `task_queue` | string (required) |

## Resolution

The resolver validates workers, namespaces, and nexus definitions:
- Worker references to undefined workflows, activities, or nexus services produce errors
- Duplicate worker, namespace, or nexus service names produce errors
- Duplicate nexus endpoint names across namespaces produce errors
- Namespace references to undefined workers produce errors
- Worker instantiations missing `task_queue` option produce errors
- Nexus endpoint instantiations missing `task_queue` option produce errors
- Workers on the same task queue (within a namespace) with different type sets produce errors
- Workers on the same task queue with identical type sets produce warnings (redundant)
- Nexus endpoint routing to a task queue where no worker registers the service produces errors
- Defined workflows/activities not on any instantiated worker produce warnings (when namespaces exist)
- Defined nexus services not referenced by any worker produce warnings (when namespaces exist)
- Defined workers not instantiated in any namespace produce warnings (when namespaces exist)

### Parameterized family resolution

When a namespace or endpoint name carries `{param}` template holes (see
[Parameterized namespaces and endpoints](#parameterized-namespaces-and-endpoints)), the resolver
applies these additional rules:

- **Cardinality.** A node's **param set** is the set of *distinct* `{tokens}` in its identifier
  (`fabric-shard-{org}` → `{org}`; `{region}-{org}` → `{region}, {org}`). This is the family's
  cardinality — carried downstream as `templateParams` on the wire node and rendered as a `× org`
  cardinality badge. A static node has an empty param set.
- **Endpoint param superset (error).** An endpoint's param set must be a **superset** of its owning
  namespace's. Otherwise the endpoint's flat-global name is shared across the whole family — a static
  `BootstrapShard` endpoint inside `fabric-shard-{org}` would resolve to one global name for every
  org, colliding. This raises `ENDPOINT_PARAM_NOT_SUPERSET`.
- **Bound string params (error).** A `{param}` used inside a `STRING` option value must be **bound**
  by the enclosing namespace/endpoint identifier template — or, for an endpoint option, by its owning
  namespace's template. An unbound hole (`task_queue: "q-{shard}"` where no enclosing identifier
  declares `{shard}`) raises `UNBOUND_TEMPLATE_PARAM`.
- **Templated endpoint reference binding.** A templated endpoint reference in a `nexus` call resolves
  through the existing flat-global endpoint registry by its **full templated name string** (holes
  matched by spelling), exactly as a static endpoint reference does. A reference whose full name
  matches no defined endpoint — including a static reference to a templated endpoint, or a
  mismatched hole spelling — is the existing undefined-endpoint hard error. No new cross-file
  resolution machinery is introduced.
