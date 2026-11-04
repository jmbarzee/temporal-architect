# Worker and Namespace Definitions

## Worker Definitions

Workers are reusable type sets that group workflows and activities:

```
worker_def ::= 'worker' IDENT ':' NEWLINE
               INDENT
               worker_entry*
               DEDENT

worker_entry ::= 'workflow' qualified_ref NEWLINE
               | 'activity' qualified_ref NEWLINE
               | 'nexus' 'service' qualified_ref NEWLINE   # a trailing '.' IDENT is WORKER_REGISTERS_OPERATION
```

Worker names use lowerCamelCase convention. Workers contain workflow, activity, and nexus service references — deployment configuration (task_queue, etc.) is specified when the worker is instantiated in a namespace block.

Each registration entry's referenced name is a [`qualified_ref`](./14-packages-and-imports.md): it
may carry an optional `pkg.` package qualifier (`workflow orders.ProcessOrder`,
`activity billing.ChargeCard`, `nexus service orders.OrderService`) to register a symbol declared
in another package. The qualifier is bare for same-package symbols; a qualified registration resolves against the
imported package that owns the symbol, and an unresolved (external) import makes qualified
registrations resolve as external.

A worker registers each name once per kind: Temporal has no packages, and its SDKs key
registrations by name. Two entries of one kind with one name — the same entry repeated, or types
from different packages (`workflow orders.Run` and `workflow billing.Run`) — raise
`WORKER_DUPLICATE_TYPE_NAME` at the later entry. Drop a repeat; put same-named types on workers
polling different task queues.

A `nexus service` entry registers the **whole** service — every operation it declares. A worker
cannot register part of a service: Temporal workers register services, and Java and Python reject
a service implementation missing any of its operations. An entry that names an operation
(`nexus service Svc.OpA`, or `orders.Svc.OpA`) raises `WORKER_REGISTERS_OPERATION`; the worker
keeps the whole service. Operations that must deploy apart belong to separate services, each on
its own worker and task queue.

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
they name runtime deployment strings, so they admit hyphens and `{param}` template parameters (see
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
created dynamically at runtime. TWF models a family inline: a `{param}` template parameter inside a
[`deploy_name`](./08-tokens-and-keywords.md) marks the axis the family varies over.

```
namespace fabric-shard-{org}:
	worker shardTypes
		options:
			task_queue: "bootstrap"
	nexus endpoint fabric-shard-{org}-BootstrapShard
		options:
			task_queue: "bootstrap"
```

The semantics are **design-altitude**, not runtime string substitution:

- **`{param}` is a cardinality/correlation annotation, not a variable.** Nothing binds `{org}` to a
  concrete value. A `{org}` in a caller's identifier means "the org of this execution"; it annotates
  that the construct is a per-tenant *family* rather than a single static deployment.
- **Token-equality is identity.** There is no declaration site. Every `{org}` in a namespace or
  endpoint name denotes the same dimension, correlated by the token spelling alone. A declared axis
  primitive (which would add typo/undefined-reference detection and correlation-by-definition) was
  considered and deferred to **[#129](https://github.com/jmbarzee/temporal-architect/issues/129)**;
  inline templating is what this surface ships.
- **Reach: names only.** A name parameter never reaches an option string: a task queue is scoped to
  its namespace, so `"bootstrap"` in `fabric-shard-acme` and in `fabric-shard-globex` are already
  two queues. A `{param}` in a worker `task_queue` declares a
  [per-instance worker family](#per-instance-worker-families), an endpoint `task_queue` is static,
  and `worker_identity` is free text. An endpoint's `allowed_caller_namespaces` entries are list
  values, not option strings; a `{param}` in one correlates by spelling with a name parameter
  without binding (see [Endpoint Options](#endpoint-options)).

A namespace or endpoint with no `{param}` is an ordinary static deployment and is unchanged.
See [Resolution](#resolution) below for the rules that keep a family coherent.

## Per-instance worker families

A `{param}` in a worker instantiation's `task_queue` is an **instance parameter**. It makes the
instantiation a **per-instance worker family**: many workers, each polling its own concrete queue,
one per value. This is Temporal's worker-specific task queue pattern: a sandbox sidecar, a host, a
per-region fleet.

```
namespace aivearium:
	worker sidecar
		options:
			task_queue: "sandbox-{sandboxId}"
```

A caller names a member with its own data, matched by shape (see [Queue matching](#queue-matching)):

```
activity RunTool(task.call) -> output
	options:
		task_queue: "sandbox-{lease.sandboxId}"
		schedule_to_start_timeout: 30s
		start_to_close_timeout: 5m
```

- **An annotation, never bound.** Like a name parameter, an instance parameter marks cardinality.
- **Local to its instantiation.** Classification is per instantiation, and an instance parameter
  correlates with nothing by spelling, not even a same-spelled name parameter; matching ignores
  names, so a typo is harmless.
- **Only `task_queue` declares one.** `worker_identity` may carry any `{param}` as free text.
- **A bare parameter is legal.** `"{hostId}"` is the worker-specific pattern's natural form.
- **Well formed, or `QUEUE_TEMPLATE_MALFORMED`** (resolve error). It reports the first rule broken,
  in this order:
  1. every brace group is an IDENT name (`{}` and `{a.b}` are not);
  2. fixed text separates every two parameters;
  3. no stray or unclosed brace;
  4. the fixed text does not begin with a reserved prefix (`/_sys/`, `temporal-sys-per-ns-`);
  5. the fixed text plus one byte per parameter fits in 1000 bytes.

  A malformed placement still carries its instance parameters, and otherwise behaves like a
  placement with an empty `task_queue` that draws no `MISSING_TASK_QUEUE`: calls that needed it
  report their own routing errors.

**Hazards.** All but the last are hints: the DSL cannot tell a short-lived instance, whose vanished
poller is a lifecycle event, from a long-lived family, where it is an outage.

- `INSTANCE_QUEUE_NO_START_TIMEOUT` — an activity call that names its queue reaches a family with
  neither `schedule_to_start_timeout` nor `schedule_to_close_timeout`. A task for a vanished
  instance waits until the caller's own timeout or cancellation.
- `INSTANCE_FAMILY_HOSTS_WORKFLOW` — a family worker registers a workflow. Workflow tasks have no
  schedule-to-start timeout, so an execution whose member is gone for good stalls until its own
  timeout. Short-lived families should host workflows on a shared queue.
- `INSTANCE_FAMILY_VERSIONED` — a family with `versioning: deployment` (a version accepts at most 100
  distinct queues over its life) or `build_id` (an operator call per queue).
- `INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE` (warning) — a family worker registers a Nexus service. No
  endpoint can reach it.

**Nexus endpoints target static queues.** An endpoint targets one concrete queue in its namespace,
so a `{param}` in an endpoint `task_queue` is `ENDPOINT_TASK_QUEUE_TEMPLATED` (resolve error). To
put a family behind Nexus, use a static endpoint whose **async** operation starts a workflow on a
shared queue in the family's namespace, and have that workflow call the family. A caller in another
namespace reaches a family the same way. A sync handler has no workflow context, and Nexus retries a
start that misses its deadline, so a sync handler that routes on must be idempotent: a signal with an
idempotent handler, an Update whose ID derives from the Nexus request ID, or (experimental) a
standalone activity on the family queue whose activity ID derives from the request ID.

**Limits are per instance.** `task_queue_activity_rate_limit` caps each member's queue, not the
family.

**Authorization is per namespace.** Temporal has no per-queue permission: a family worker's
credentials reach everything in its namespace. A family beside untrusted code keeps the Temporal
worker outside the trust boundary, or lives in its own namespace behind Nexus.

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
  `UNCOVERED_SERVICE`, and no placeholder worker is needed to silence such warnings.
- The shared worker, being instantiated in the topology package's namespace, is not
  `UNINSTANTIATED_WORKER`.
- A type that **nobody** registers still warns — the coverage signal is preserved, not suppressed.
- Two domains' same-named types of one kind cannot share the worker: package qualifiers never reach
  Temporal (`WORKER_DUPLICATE_TYPE_NAME`, see *Worker Definitions* above).

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
| `allowed_caller_namespaces` | list of strings (namespace names; `{param}` allowed) |

`.twf` models endpoints with a worker target, a `(namespace, task_queue)`; Temporal's external
URL targets are not modelled.

**`allowed_caller_namespaces`** is the endpoint's caller allowlist: the namespaces a `nexus` call
through the endpoint may originate in. It is Temporal Cloud's endpoint access policy (Terraform
`allowed_caller_namespaces`, `tcld --allow-namespace`); self-hosted Temporal has no built-in
equivalent, so there it records design intent.

- **Absent:** no policy is modelled and nothing is checked.
- **`[]`:** no caller is allowed, as on Cloud by default.
- **The endpoint's own namespace is not implicit.** A call from it must be listed, as Cloud
  requires.
- **Entries are `.twf` namespace names**, not Cloud namespace IDs. An entry naming a namespace
  outside the design is accepted: callers may sit outside the analysed slice.
- **Matching is by spelling,** `{param}`s included, as for templated endpoint references. An
  entry `tenant-{org}` admits the family `tenant-{org}`, not a static `tenant-acme` and not
  `tenant-{tid}`; a concrete `tenant-acme` does not admit the family. This is a `.twf`
  modelling limit (spelling identity), not Temporal behavior.
- **A `{param}` in an entry** correlates by spelling, without binding, with a parameter of the
  endpoint's or its namespace's name: `shard-{org}-ep` with `["tenant-{org}"]` means each shard
  admits its own tenant. With no such parameter it ranges over the whole family: a static
  `platform` endpoint with `["tenant-{org}"]` admits every tenant namespace.

A call whose origin namespace is not listed raises `NEXUS_CALLER_NOT_ALLOWED`; see
[Nexus — Endpoint exposure and access](./04-nexus.md#endpoint-exposure-and-access).

## Resolution

The resolver validates workers, namespaces, and nexus definitions:
- Worker references to undefined workflows, activities, or nexus services produce errors
- Duplicate worker, namespace, or nexus service names produce errors
- Duplicate nexus endpoint names across namespaces produce errors
- Namespace references to undefined workers produce errors
- Worker instantiations missing `task_queue` option produce errors
- Nexus endpoint instantiations missing `task_queue` option produce errors
- Workers on the same task queue (same deploy key, within a namespace) with different workflow or activity sets produce errors
- Workers on the same task queue (same deploy key, within a namespace) that both register nexus services but different ones produce errors. Only a worker registering a service polls the queue's Nexus tasks, so a worker registering none is not compared on services; a poller lacking a requested service fails the call with a non-retryable `NotFound`. Like the rest of coherence, this is a steady-state claim — it ignores worker-versioning rollouts
- Workers on the same task queue (same deploy key, within a namespace) with identical workflow, activity, and service sets produce warnings (redundant)
- A worker `nexus service` entry naming an operation produces an error (`WORKER_REGISTERS_OPERATION`)
- A worker registering one name twice for a kind — the same workflow, activity, or nexus service repeated, or two from different packages — produces an error (`WORKER_DUPLICATE_TYPE_NAME`)
- A nexus call originating in a namespace its endpoint's `allowed_caller_namespaces` omits produces an error (`NEXUS_CALLER_NOT_ALLOWED`)
- Nexus endpoint routing to a task queue where no worker in the endpoint's namespace registers the service produces errors
- Defined workflows/activities not on any instantiated worker produce warnings (when namespaces exist)
- Defined nexus services not referenced by any worker produce warnings (when namespaces exist)
- Defined workers not instantiated in any namespace produce warnings (when namespaces exist)

A task queue is scoped to its namespace, so call routing and endpoint linkage match on the
(namespace, task queue) pair. Namespace identity is the deploy name; `package` has no bearing. A
call's `task_queue` — from its `options:`, else the target's [`default_options:`](./06-statement-syntax.md#definition-default-options)
— names a queue in the caller's own namespace; crossing a namespace boundary is Nexus's job. A call
naming no queue inherits the caller's. A caller on no instantiated worker gets no routing check (it
already warns as uncovered).

### Queue matching

Each side parses a queue string one of three ways:

| | Worker `task_queue` | Call site, `default_options:` |
|---|---|---|
| **opaque** — literal text | no IDENT parameter | no brace group; or a brace group that is not a dotted path, touching parameters, or a stray brace (`"q-{x.y}-{}"`) |
| **parsed** | an IDENT parameter, well formed: a family, its parameters instance parameters | every brace group a dotted path, separated by fixed text: its parameters runtime parameters |
| **error** | an IDENT parameter, malformed: `QUEUE_TEMPLATE_MALFORMED` | — |

An endpoint `task_queue` is opaque, or `ENDPOINT_TASK_QUEUE_TEMPLATED`. An error outcome matches
nothing, not even its own spelling.

Two queues **match** when their spellings are identical, or when both parse with equal fixed text
and parameters in the same positions. Parameter names never matter: `"sandbox-{lease.sandboxId}"`
matches `"sandbox-{sandboxId}"`, and a parameter-free string matches only itself. Matching is
strict: `"workers-{req.region}"` does not reach static `"workers-us"` and `"workers-eu"`; model such
a set as a family or as static calls.

A call-site queue that is exactly one runtime parameter (`"{lease.queue}"`) is **learned**: a name
the caller got at runtime, as the worker-specific pattern hands queues around. It matches any
family, and otherwise only its own spelling.

A worker queue's **deploy key** is its fixed text with an anonymous marker per parameter; an opaque
queue's key is its spelling, which never equals a family's. `"sandbox-{sandboxId}"` and
`"sandbox-{id}"` share a key; the opaque `"sandbox-{}"` shares neither's.

Each check uses one comparison:

- **Explicit routing** — the call's effective queue matches a placement. It checks that the call can
  name a polled queue, not which value it names.
- **Implicit routing and coherence** — deploy keys are equal. One key is one family, so its
  placements must register the same type set. Two bare families (`"{hostId}"`, `"{podId}"`) share a
  key; give them distinct fixed text (`"host-{hostId}"`, `"pod-{podId}"`).
- **Endpoint linkage** — spellings are equal.

Coherence cannot see two placements with different keys that could still name one queue: a static
`"sandbox-pool"` beside `"sandbox-{sandboxId}"`, for a sandbox with ID `pool`. When at least one is a
family, that draws `TASK_QUEUE_OVERLAP` (hint). A bare-parameter family is exempt: it overlaps
everything by construction.

### Parameterized family resolution

When a namespace or endpoint name carries `{param}` parameters, or a worker `task_queue` instance
parameters, the resolver applies these rules:

- **Cardinality.** A node's **param set** is the set of *distinct* `{tokens}` in its identifier
  (`fabric-shard-{org}` → `{org}`; `{region}-{org}` → `{region}, {org}`), or for a worker
  instantiation, the instance parameters in its `task_queue`. This is the family's cardinality —
  carried downstream as `templateParams` on the wire node and rendered as a `× org` cardinality
  badge. A static node has an empty param set.
- **Endpoint param superset (error).** An endpoint's param set must be a **superset** of its owning
  namespace's. Otherwise the endpoint's flat-global name is shared across the whole family — a static
  `BootstrapShard` endpoint inside `fabric-shard-{org}` would resolve to one global name for every
  org, colliding. This raises `ENDPOINT_PARAM_NOT_SUPERSET`.
- **Templated endpoint reference binding.** A templated endpoint reference in a `nexus` call resolves
  through the existing flat-global endpoint registry by its **full templated name string** (parameters
  matched by spelling), exactly as a static endpoint reference does. A reference whose full name
  matches no defined endpoint — including a static reference to a templated endpoint, or a
  mismatched parameter spelling — is the existing undefined-endpoint hard error. No new cross-file
  resolution machinery is introduced.
