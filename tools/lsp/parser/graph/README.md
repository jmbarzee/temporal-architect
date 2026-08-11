# graph

Builds the **resolved deployment graph** from a parsed + resolved AST — the model
behind `twf graph`. Nodes are runtime deployments (a definition × instantiation
context); edges are confirmed dispatches between them. The whole front door is
`Extract(file *ast.File) *Graph`.

> **The graph emits the resolved runtime graph. The AST is sufficient for any
> structural query that doesn't follow references across boundaries.**

`Extract` requires an AST that has already been through `resolver.Resolve` —
call-site references are read through their `Resolved` fields, and endpoint →
namespace bindings through the resolver-populated `NamespaceEndpoint`. It is a
plain Go library function: in-process consumers (`parser/decompose`, the
validator, the LSP server, the `twf graph` / `twf graph chunks` / MCP commands)
call it directly; no JSON round-trip is required. `parser/observe` reuses the
same node/edge types verbatim as the wire contract for graphs reconstructed from
live Temporal history.

## Theory of responsibility

- **Nodes are deployments** — a (definition × worker × namespace × queue) tuple
  representing one runtime instance of a runnable, identified by a composite
  stable key.
- **Edges are resolved dispatches** — a confirmed connection between two
  deployment nodes, produced from a specific call site in the source.

Because a dispatch edge is resolved from one call site to the deployments that
actually poll the matching queue, there is no fan-out step where wrong edges
could be drawn: a Cartesian blow-up between all callers and all copies of a
callee is **structurally impossible**, not filtered out. The graph contains the
dispatch routes and nothing else.

This maps to the two views a renderer wants:

| View | Data source |
|---|---|
| **Tree** | `twf parse` (AST) — definitions, hierarchical |
| **Graph** | `twf graph` (this package) — deployments + dispatches |

## Design principles

1. **One source of truth per *fact*.** Definition *content* (params, body, type
   info) lives in the AST. Nodes reference it by stable key and never restate it.
2. **Membership is an edge, not a field.** Worker / namespace containment is
   expressed by `containment` edges — the single source of truth — and is not
   denormalized onto workflow / activity / endpoint / operation nodes. The
   endpoint↔operation relationship is likewise an edge (`nexusRoute`), not a
   downstream field match.
3. **The output is render-ready.** Aggregations (coarsened tier edges) and
   cross-cutting relationships (`nexusRoute`) are emitted here, not derived in
   consumers. A renderer renders and routes clicks; it does not compute graph
   structure.
4. **Composite stable keys.** Node IDs are path-style strings using `/`. The same
   key shape works for parent lookup, persistence, and edge endpoints.
5. **Edge kinds discriminate semantics.** Coarsened edges live in a separate
   top-level array because their shape differs (`tier` + `weight` instead of
   `line` + `routing`).
6. **Multi-graph at the producer.** Two call sites dispatching to the same target
   produce two edges (distinct `line`). Consumers dedup for display if they want
   to.

## Node identity

The leftmost segment is the **definition key** (the AST anchor); subsequent
segments are deployment context. Orphan nodes carry an explicit `/orphan` suffix
so the orphan state is readable from the ID alone — useful when an ID surfaces in
an error message or a persisted reference without the surrounding `Node`.

| Kind | ID form |
|---|---|
| Namespace | `namespace:<name>` |
| Worker (deployed) | `worker:<name>/namespace:<ns>` |
| Worker (orphan) | `worker:<name>/orphan` |
| Workflow (deployed) | `workflow:<name>/worker:<worker>/namespace:<ns>` |
| Workflow (orphan) | `workflow:<name>/orphan` |
| Activity (deployed) | `activity:<name>/worker:<worker>/namespace:<ns>` |
| Activity (orphan) | `activity:<name>/orphan` |
| NexusService (deployed) | `nexusService:<name>/worker:<worker>/namespace:<ns>` |
| NexusService (orphan) | `nexusService:<name>/orphan` |
| NexusOperation (deployed) | `nexusOperation:<service>.<op>/worker:<worker>/namespace:<ns>` |
| NexusOperation (orphan) | `nexusOperation:<service>.<op>/orphan` |
| NexusEndpoint | `nexusEndpoint:<name>/namespace:<ns>` |

`/orphan` is a *tag* (no value), distinguishing it from deployment-context
segments, which use `key:value` form. The `orphan: true` field is redundant with
the suffix and retained only for ergonomic JSON consumption.

`DefKey` / `NamespaceID` / `WorkerID` / `EndpointID` / `HostedID` and the `Kind*`
constants are exported so external builders (the sampler's history importer)
produce byte-identical IDs without duplicating the string shapes.

**Endpoints** have no top-level definition in the AST — they exist only as
`NamespaceDef.Endpoints[]` entries. The synthetic definition key
`nexusEndpoint:<name>` is used for consistency; consumers needing endpoint detail
(queue, source position) look the name up in the namespace's `Endpoints[]`. There
is no orphan endpoint — an endpoint without a containing namespace can't be
parsed.

### Node field semantics

- `id` (string, required) — composite stable key per the table above.
- `definition` (string, required) — AST anchor; same form as the leftmost segment
  of `id`.
- `worker` (string, optional) — definition key of the hosting worker. Present on
  `nexusService` and `nexusOperation` nodes only.
- `namespace` (string, optional) — definition key of the deployment namespace.
  Present on `nexusService` nodes only.
- `queue` (string, optional) — the task queue this deployment polls (workers) or
  is fronted on (nexus tier). Present on worker, `nexusEndpoint`,
  `nexusService`, and `nexusOperation` nodes. Queue has no edge equivalent and is
  intrinsic to a deployment, so it stays on the node — but purely as **display
  metadata**; nothing downstream derives structure from it.
- `orphan` (bool, optional) — `true` when the definition exists in the AST but
  has no deployment. Implies no deployment-context fields at all. Omitted when
  false.

Workflow and activity deployment nodes therefore carry **only** `id` and
`definition`. Their worker and namespace are the containment chain; read the
edges.

## Edge kinds

| Kind | Meaning |
|---|---|
| `containment` | child → parent (structural) |
| `activityCall` | resolved activity dispatch from a caller deployment |
| `workflowCall` | resolved child / detached workflow dispatch |
| `nexusCall` | resolved nexus operation dispatch through an endpoint |
| `asyncBacking` | async nexus operation → its backing workflow |
| `signalSend` | cross-workflow signal delivery to an already-started child |
| `nexusRoute` | operation deployment → each endpoint deployment fronting it (structural) |

`containment` and `nexusRoute` are topology; the rest are dispatch.

### Edge field semantics

- `from`, `to` (string, required) — node IDs.
- `kind` (enum, required) — one of the table above.
- `line` (int, required) — source line of the syntactic element that produced the
  edge. For dispatch, the call site. For containment, the child's registration /
  declaration line. For `nexusRoute`, the endpoint's declaration line.
- `routing` (object, optional) — present **only** on dispatch edges; the
  diagnostic *cause* of the edge:
  - `explicit` (string, optional) — the `task_queue:` literal the user wrote on
    the call site (activity / workflow only). Absent when the call was implicit.
  - `nexusEndpoint` (string, optional) — `nexusCall` only; the endpoint
    deployment node ID. Cross-namespace nexus calls land here naturally, since
    the endpoint node ID encodes its namespace.

`asyncBacking` and `signalSend` carry a **present-but-empty** routing block
(`{}`): present signals "this is a dispatch, implicit, no override"; absent
(`containment`, `nexusRoute`) signals "not a dispatch at all".

The dispatch edge's *effect* — which deployment received the call — is encoded by
the `to` node ID. `routing` describes the *cause* only, for tooltips, codegen
diagnostics, and validator messages.

## Containment edges

One edge per (child, parent) deployment pair:

| Child kind | Parent |
|---|---|
| Worker deployment | Namespace |
| NexusEndpoint deployment | Namespace |
| Workflow deployment | Worker deployment |
| Activity deployment | Worker deployment |
| NexusService deployment | Worker deployment |
| NexusOperation deployment | NexusService deployment (same worker, same namespace) |

Orphan nodes have no containment edges.

A nexus operation's parent is the **service**, not the endpoint. The endpoint's
role is routing, captured separately (see [Nexus routes](#nexus-routes)).

The `line` is the child's own source line: the `NamespaceWorker` /
`NamespaceEndpoint` line for the first two rows, the operation's declaration line
for the last, and — for hosted definitions — the *worker's registration line for
that definition*, which is more precise than the definition's declaration line
and reflects where the containment relationship was authored.

## Resolution rules

### Dispatch edges

Produced by walking bodies: every workflow body plus its signal / query / update
handler bodies, and every synchronous nexus operation body (the operation
deployment is the caller). Async targets hanging off `await` / `promise` /
`await one case` are visited through the AST walker's `WithAsyncTargets` option,
so the resolution logic stays in one place. The walk runs **once per caller
deployment**, and emits one edge per (caller deployment, matching callee
deployment) pair.

- **`activityCall` / `workflowCall` with explicit `task_queue:`** — matching
  callee deployments are those in the **caller's namespace** whose `queue` equals
  the literal. `routing.explicit` carries the literal.
- **`activityCall` / `workflowCall` implicit** — the call inherits the caller
  deployment's own queue; matching callee deployments are those in the caller's
  namespace on that queue. A definition hosted on two workers is walked twice, so
  each copy resolves against its own queue.
- **`nexusCall`** — the endpoint's `(namespace, queue)` is the dispatch contract.
  Matching operation deployments are those whose hosting service deployment has
  `namespace == endpoint.namespace` and `queue == endpoint.queue`.
  `routing.nexusEndpoint` carries the endpoint deployment node ID. An `options:`
  block on a nexus call site does not participate — the endpoint wins, and
  `routing.explicit` is never set on a `nexusCall`.
- **`asyncBacking`** — from the operation deployment to workflow deployments on
  the same namespace *and* the same queue as the operation: when the operation
  runs, Temporal starts the backing workflow on that task queue.
- **`signalSend`** — **not** queue-routed. A signal is delivered to a specific
  running child the sender already started, not dispatched by queue matching, so
  it fans out to every deployment of the target workflow in the caller's
  namespace. The target is reached through the resolved handle promise.

When no callee deployment matches, no edge is emitted and a
`DISPATCH_NO_REACHABLE_DEPLOYMENT` warning is added (deduplicated by
`(code, from, line)`, so one call site walked once per caller-deployment copy
reports once). When the caller deployment has no queue at all, the call is
dropped silently — the validator already reports the missing `task_queue`, and
double-reporting helps nobody.

A call site whose reference didn't resolve (typo'd activity, unresolved signal
handle, …) yields an `unresolved[]` entry instead of an edge — one per caller
deployment, so unresolved async-backing targets fan out the same way real edges
would.

### Coarsened edges

Top-level `coarsenedEdges[]`: dispatch edges projected up to a higher containment
tier and aggregated. Consumers use them to render condensed views.

- `from`, `to` (string, required) — node IDs at the aggregation tier (worker
  deployment IDs for `tier: "worker"`, namespace IDs for `tier: "namespace"`).
- `tier` (enum, required) — `"worker"` or `"namespace"`.
- `weight` (int, required) — count of underlying dispatch edges aggregated,
  summed per `(from, to, tier)`.

Tier IDs come from **parent lookup over the already-emitted containment edges**
(walking upward to the first ancestor of the wanted kind), keeping containment
the single source of truth for membership. Orphan nodes have no containment
parent and never appear.

**Self-loops are dropped.** A call between two definitions hosted on the same
worker yields no worker-tier edge; a call within one namespace yields no
namespace-tier edge.

`containment` and `nexusRoute` are structural and do not contribute.
`asyncBacking` and `signalSend` *do* — they are dispatch, and they cross
deployments whenever the target lives on another worker. Namespace and endpoint
nodes never appear as dispatch endpoints, so they never appear in the coarsened
output either.

### Node enumeration rules

For each AST definition:

- **Namespace** — one node per namespace.
- **Worker** — one node per `NamespaceDef.Workers[i]` (each instantiation is one
  deployment). Declared but never instantiated → one orphan node.
- **Workflow / Activity / NexusService** — one node per (registration × worker
  deployment). Registered on no instantiated worker → one orphan node.
- **NexusOperation** — one node per (operation × its parent service's
  deployment), inheriting the service's worker and queue. Orphan when the service
  is orphan.
- **NexusEndpoint** — one node per `NamespaceDef.Endpoints[i]`. Always
  namespace-deployed by construction; no orphan case.

Nodes are deduplicated by ID. The same definition under two namespace
instantiations legitimately produces two distinct IDs and is not a duplicate.

## Nexus routes

An endpoint definition is agnostic of services — it is a namespace-scoped routing
alias to a task queue. But *which operations a given endpoint fronts* is a fact
about deployment placement, and consumers should not have to re-derive it by
matching node `(namespace, queue)` fields. So the parser emits it:

**`nexusRoute`: operation deployment → every endpoint deployment whose
`(namespace, queue)` matches the operation's.** Direction mirrors the call path's
tail (caller → operation, operation fronted by endpoint). It is topology, not an
observed dispatch: it carries no `routing` and is excluded from coarsening.

**No `endpoint → service` edge is emitted.** The relationship "endpoint X happens
to front service Y" is an inference from queue and namespace coincidence, not a
semantic fact about the program, and drawing it at the service grain implies a
direct connection that doesn't exist. Actual routing happens at call sites, where
`nexusCall` edges carry `routing.nexusEndpoint`.

## What's NOT emitted

- **No registrations / instantiations / endpoint queues as separate sections.**
  Each is implicit in the node set and the containment edges. Consumers needing
  the raw declarations read `twf parse`.
- **No raw AST data.** Definition content — params, body, type info — lives in
  `twf parse`. Join by definition key when you need it.
- **No denormalized membership on workflow / activity / endpoint / operation
  nodes.** Read the containment edges.
- **No `endpoint → service` edges** (above).
- **No deduplication of parallel dispatch edges.** Two call sites to the same
  target are two edges.

## Determinism and wire shape

`finalize` sorts every output slice and populates `Summary`, so successive runs
against the same AST produce byte-identical JSON. All arrays are non-nil, so an
empty graph serializes as `[]`, never `null`. `Extract(nil)` returns an empty
graph rather than panicking, so the CLI can call it before checking for parse
errors.

`Finalize(*Graph)` is exported for builders that assemble a `Graph` directly
without going through `Extract` — the sampler's history importer, via
`parser/observe` — so coarsening and ordering have one implementation.

## Pipeline

```
Extract(file)                 graph.go        nil-safe front door
   │
indexAST(file)                nodes.go        definitions by name; one workerDeployment per
   │                                          (worker × namespace); endpoints by name
enumerateNodes(idx)           nodes.go        one node per deployment, orphans included
   │
emitContainment(idx)          containment.go  child → parent edges (membership source of truth)
   │
emitDispatchEdges(idx)        routing.go      body walk → call-site → callee deployment resolution
   │
emitNexusRoutes(idx)          nexus_routes.go operation → fronting endpoint edges
   │
emitCoarsenedEdges()          coarsen.go      tier projection over containment-derived parents
   │
finalize()                    graph.go        stable sort + summary counts
```

Order matters: nodes must exist before edges reference them by ID, and coarsening
reads the containment edges.

## File map

| File | Responsibility |
|---|---|
| `graph.go` | the public model (the wire contract), ID builders, `Extract`, `Finalize` |
| `nodes.go` | the AST index and deployment-node enumeration |
| `containment.go` | containment edges |
| `routing.go` | body walk and dispatch-edge resolution |
| `nexus_routes.go` | `nexusRoute` composition edges |
| `coarsen.go` | tier projection and the containment-derived parent index |
