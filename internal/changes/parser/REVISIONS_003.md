# Parser: Resolved Deployment Graph (`twf graph`)

## Problem Statement

The current `tools/lsp/parser/deps/` package is a partial resolved call graph. It emits
dependency edges and worker- and namespace-level coarsening, but:

- Uses last-wins `childToWorker[name]`, collapsing multi-worker registrations.
- Ignores all options blocks, so has no concept of task-queue routing.
- Treats async-backing (nexus async operation → workflow) as implicit.
- Duplicates definition identity in its `nodes[]` array instead of referencing the AST.

This gap is felt downstream. The visualizer (`tools/visualizer/src/graph/build.ts`) reimplements
substantial program-semantics work — statement walking, edge extraction, coarsening,
worker-to-namespace inference, per-worker copy expansion — because the parser doesn't expose it.
A task-queue routing fix would add still more.

This is wrong-layer work. The resolved runtime call graph is a fact about the program; it
belongs in the parser.

**The current `twf deps` has zero in-repo consumers.** The VS Code extension and visualizer
shell out to `twf parse` and consume the raw AST. The LSP server uses the parser package
directly. No backwards-compatibility constraint applies.

## Renames (Breaking)

- Package: `tools/lsp/parser/deps/` → `tools/lsp/parser/graph/`
- CLI: `twf deps` → `twf graph`
- Public types: replaced wholesale; no API continuity.

"deps" describes only dependency extraction; the new responsibility is the resolved deployment
graph.

## Theory of Responsibility

> **The graph command emits the resolved runtime graph. The AST is sufficient for any structural
> query that doesn't follow references across boundaries.**

This is a different shape than the previous draft. Instead of edges between *definitions* with
`routing.reachable` as sidecar, `twf graph` emits a real graph:

- **Nodes are deployments** — a (definition, worker, namespace, queue) tuple representing one
  runtime instance of a runnable. Identifies are composite stable keys.
- **Edges are resolved dispatches** — a confirmed connection between two deployment nodes,
  produced from a specific call site in the source.

The Cartesian fan-out bug that motivated this work isn't filtered out in this design — it's
**structurally impossible**. There's no fan-out step where wrong edges could be drawn. The
graph contains the dispatch routes and nothing else.

This maps cleanly to the visualizer's two views:

| View | Data source |
|---|---|
| **Tree view** | `twf parse` (AST) — definitions, hierarchical |
| **Graph view** | `twf graph` (this output) — deployments + dispatches |

## Design Principles

1. **One source of truth per *fact*.** Definitions live in the AST (definition *content*: params,
   body, type info). Nodes in the graph output reference them by stable key. Definition content
   is not restated.
2. **The graph output is render-ready.** Aggregations (coarsened tier edges) and cross-cutting
   relationships (nexus-fronts edges) are emitted, not derived in consumers. The visualizer's
   job is to render and route clicks, not to compute graph structure.
3. **Composite stable keys.** Node IDs are path-style strings using `/` as separator. Same key
   shape works for parent-lookup, persistence, and edge endpoints.
4. **Nodes are deployments.** A (definition × instantiation) cross-product. Containment is
   captured by explicit containment edges (see below).
5. **Edge kinds discriminate semantic.** `containment`, `activityCall`, `workflowCall`,
   `nexusCall`, `asyncBacking`. Coarsened edges live in a separate top-level array because
   their shape differs (no `line`, has `weight`).
6. **Multi-graph at producer.** Two call sites that dispatch to the same target produce two
   dispatch edges. Visualizer dedups for display if appropriate.

## Node Identity

Composite IDs, leftmost segment is the definition, subsequent segments are deployment context.
Orphan nodes carry an explicit `/orphan` suffix so the orphan state is visible in the ID alone.

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

Definition keys (the AST anchors) are the leftmost segment alone: `workflow:OrderWorkflow`,
`worker:paymentWorker`, `nexusEndpoint:PaymentEndpoint`, etc. Same key form the visualizer
already uses internally for `definitionKey`.

**Note on `nexusEndpoint`:** Endpoints don't have a top-level definition in the AST — they exist
only as `NamespaceDef.endpoints[]` entries. The synthetic definition key
`nexusEndpoint:<name>` is used for consistency. Consumers needing endpoint detail (queue, source
position) look up the namespace's `endpoints[]` array by name. There is no orphan endpoint —
endpoints without a containing namespace can't be parsed.

**Note on `/orphan` suffix:** The suffix is a tag (no value), distinguishing it from
deployment-context segments which use `key:value` form. The node's `orphan: true` field is
redundant with the suffix and retained only for ergonomic JSON consumption.

## Output Shape

```json
{
  "summary": {
    "nodes": 21,
    "edges": 37,
    "coarsenedEdges": 4,
    "unresolved": 0,
    "diagnostics": 0
  },

  "nodes": [
    { "id": "namespace:ecommerce",
      "definition": "namespace:ecommerce" },

    { "id": "worker:orderWorker/namespace:ecommerce",
      "definition": "worker:orderWorker",
      "namespace": "namespace:ecommerce",
      "queue": "orders" },

    { "id": "workflow:OrderWorkflow/worker:orderWorker/namespace:ecommerce",
      "definition": "workflow:OrderWorkflow",
      "worker": "worker:orderWorker",
      "namespace": "namespace:ecommerce",
      "queue": "orders" },

    { "id": "activity:ChargePayment/worker:paymentWorker/namespace:ecommerce",
      "definition": "activity:ChargePayment",
      "worker": "worker:paymentWorker",
      "namespace": "namespace:ecommerce",
      "queue": "payments" },

    { "id": "activity:ChargePayment/worker:paymentWorkerSecondary/namespace:ecommerce",
      "definition": "activity:ChargePayment",
      "worker": "worker:paymentWorkerSecondary",
      "namespace": "namespace:ecommerce",
      "queue": "payments-secondary" },

    { "id": "nexusService:PaymentService/worker:paymentWorker/namespace:ecommerce",
      "definition": "nexusService:PaymentService",
      "worker": "worker:paymentWorker",
      "namespace": "namespace:ecommerce",
      "queue": "payments" },

    { "id": "nexusOperation:PaymentService.CheckPaymentStatus/worker:paymentWorker/namespace:ecommerce",
      "definition": "nexusOperation:PaymentService.CheckPaymentStatus",
      "worker": "worker:paymentWorker",
      "namespace": "namespace:ecommerce",
      "queue": "payments" },

    { "id": "nexusEndpoint:PaymentEndpoint/namespace:ecommerce",
      "definition": "nexusEndpoint:PaymentEndpoint",
      "namespace": "namespace:ecommerce",
      "queue": "payments" },

    { "id": "workflow:OrphanWorkflow/orphan",
      "definition": "workflow:OrphanWorkflow",
      "orphan": true }
  ],

  "edges": [
    // --- containment ---
    { "from": "worker:orderWorker/namespace:ecommerce",
      "to":   "namespace:ecommerce",
      "kind": "containment",
      "line": 127 },

    { "from": "nexusEndpoint:PaymentEndpoint/namespace:ecommerce",
      "to":   "namespace:ecommerce",
      "kind": "containment",
      "line": 147 },

    { "from": "workflow:OrderWorkflow/worker:orderWorker/namespace:ecommerce",
      "to":   "worker:orderWorker/namespace:ecommerce",
      "kind": "containment",
      "line": 85 },

    { "from": "nexusOperation:PaymentService.CheckPaymentStatus/worker:paymentWorker/namespace:ecommerce",
      "to":   "nexusService:PaymentService/worker:paymentWorker/namespace:ecommerce",
      "kind": "containment",
      "line": 64 },

    // --- dispatch ---
    { "from": "workflow:OrderWorkflow/worker:orderWorker/namespace:ecommerce",
      "to":   "activity:ChargePayment/worker:paymentWorker/namespace:ecommerce",
      "kind": "activityCall",
      "line": 12,
      "routing": { "explicit": "payments" } },

    { "from": "workflow:PartnerCheckout/worker:partnerWorker/namespace:partner",
      "to":   "nexusOperation:PaymentService.CheckPaymentStatus/worker:paymentWorker/namespace:ecommerce",
      "kind": "nexusCall",
      "line": 174,
      "routing": {
        "nexusEndpoint": "nexusEndpoint:PaymentEndpoint/namespace:ecommerce"
      } },

    { "from": "nexusOperation:AnalyticsService.TrackEvent/worker:analyticsWorker/namespace:ecommerce",
      "to":   "workflow:TrackEventWorkflow/worker:analyticsWorker/namespace:ecommerce",
      "kind": "asyncBacking",
      "line": 70,
      "routing": {} },

    { "from": "workflow:TrackEventWorkflow/worker:analyticsWorker/namespace:ecommerce",
      "to":   "activity:RecordEvent/worker:analyticsWorker/namespace:ecommerce",
      "kind": "activityCall",
      "line": 76,
      "routing": {} }
  ],

  "coarsenedEdges": [
    { "from":   "worker:orderWorker/namespace:ecommerce",
      "to":     "worker:paymentWorker/namespace:ecommerce",
      "tier":   "worker",
      "weight": 1 },
    { "from":   "namespace:partner",
      "to":     "namespace:ecommerce",
      "tier":   "namespace",
      "weight": 2 }
  ],

  "unresolved": [
    { "from": "workflow:Foo/worker:fooWorker/namespace:fooNs",
      "name": "Bar",
      "kind": "activityCall",
      "line": 42 }
  ],

  "diagnostics": [
    { "severity": "warning",
      "code": "DISPATCH_NO_REACHABLE_DEPLOYMENT",
      "message": "activity call routes to task_queue \"orphaned\" but no deployment polls it",
      "from": "workflow:Foo/worker:fooWorker/namespace:fooNs",
      "line": 99 }
  ]
}
```

### Node field semantics

- `id` (string, required) — composite stable key per the table above.
- `definition` (string, required) — AST anchor; same form as the leftmost segment of `id`.
- `worker` (string, optional) — definition key of the hosting worker; absent for namespace,
  worker, and orphan nodes.
- `namespace` (string, optional) — definition key of the deployment namespace; absent for
  namespace and orphan nodes.
- `queue` (string, optional) — the task queue this deployment polls (workers) or is dispatched
  to (everything hosted by a worker). Absent for namespace and orphan nodes.
- `orphan` (bool, optional) — `true` when the definition exists in the AST but isn't registered
  on any worker. Implies no deployment context fields. Omitted when not orphan.

### Edge field semantics

- `from`, `to` (string, required) — node IDs.
- `kind` (enum, required) — one of:
  - `"containment"` — child → parent (structural)
  - `"activityCall"` / `"workflowCall"` / `"nexusCall"` / `"asyncBacking"` — resolved per-deployment dispatch
- `line` (int, required) — source line of the syntactic element that produced this edge. For
  containment, the child's declaration line. For dispatch, the call site.
- `routing` (object, optional) — present only on dispatch edges. Diagnostic *cause* of the edge:
  - `explicit` (string, optional) — what the user wrote in `task_queue:` on the call site
    (activity / workflow only). Absent if the call was implicit.
  - `nexusEndpoint` (string, optional) — present for `nexusCall`; the endpoint deployment node
    ID. Cross-namespace nexus calls land here naturally since the endpoint node ID encodes its
    namespace.

The dispatch edge's *effect* (which deployment received the call) is encoded by the `to` node ID
and the node's `queue` field. The `routing` object describes the *cause* only — useful for
tooltips, codegen diagnostics, and validator messages.

### Coarsened edges

Top-level `coarsenedEdges[]` array. Aggregations of per-deployment dispatch edges at higher tier
levels. Used by the visualizer to render condensed views (worker tier, namespace tier).

- `from`, `to` (string, required) — node IDs at the aggregation tier (worker deployment node IDs
  for `tier: "worker"`, namespace node IDs for `tier: "namespace"`).
- `tier` (enum, required) — `"worker"` or `"namespace"`.
- `weight` (int, required) — count of underlying dispatch edges aggregated.

Self-loops are dropped — an edge from `worker:X` to `worker:X` (a call between two definitions
hosted on the same worker) does not appear in the coarsened list.

### Containment edges

One per (child, parent) deployment pair:

| Child kind | Parent |
|---|---|
| Worker deployment | Namespace |
| NexusEndpoint deployment | Namespace |
| Workflow deployment | Worker deployment |
| Activity deployment | Worker deployment |
| NexusService deployment | Worker deployment |
| NexusOperation deployment | NexusService deployment (same worker, same namespace) |

Orphan nodes have no containment edges.

### Endpoint → service relationships are NOT emitted as edges

An endpoint definition is agnostic of services — it's a namespace-scoped routing alias to a
task queue. The relationship "endpoint X happens to route to service Y" is an inference from
queue and namespace co-incidence, not a semantic fact about the program. Drawing it as a
top-level edge implies a direct connection that doesn't exist; the actual routing happens at
call sites, where `nexusCall` edges carry `routing.nexusEndpoint` referencing the endpoint
deployment.

The visualizer is free to surface endpoint-routes-to associations at hover time (filter all
`nexusCall` edges whose `routing.nexusEndpoint` matches the hovered endpoint) without
materializing them as graph edges. See [visualizer/REVISIONS_004](../visualizer/REVISIONS_004.md).

### What's NOT emitted

- **No registrations / instantiations / endpoint queues as separate sections.** Each is implicit
  in the deployment-node fields. Consumers needing them read from `twf parse` directly.
- **No raw AST data.** Definition content (params, body, type info) lives in `twf parse`.
  Consumers join by stable key when they need it.

### Resolution rules

#### Dispatch edges

Produced by walking each runnable's body. One edge per (caller deployment, matching callee
deployment) pair.

- **`nexusCall`:** the endpoint's queue determines dispatch. Matching callee deployments are
  those of `to`'s definition whose `queue == endpoint.queue` *and*
  `namespace == endpoint.namespace`. `routing.nexusEndpoint` carries the endpoint deployment
  node ID.
- **`activityCall` / `workflowCall` with explicit `task_queue:`:** matching deployments have
  `queue == explicit`. `routing.explicit` carries the queue name.
- **`activityCall` / `workflowCall` implicit:** matching deployments have `queue` equal to any
  queue polled by *any* deployment of the caller's definition. (Caller's queue set → callee's
  matching queues.)
- **`asyncBacking`:** the operation deployment's queue. Matching workflow deployments are those
  on the same queue and namespace.

When no callee deployment matches, no edge is emitted and a `DISPATCH_NO_REACHABLE_DEPLOYMENT`
diagnostic is added.

#### Coarsened edges

Project each dispatch edge `(from, to)` up to higher-tier node IDs, dropping self-loops:

- `tier: "worker"` — replace `from` and `to` with their containing worker deployment node IDs
  (one indexed lookup per side via containment edges).
- `tier: "namespace"` — replace with namespace node IDs (two indexed lookups per side).

Aggregate by `(from, to, tier)`, summing `weight`. Containment edges do not contribute to
coarsening. AsyncBacking edges *do* contribute (they're dispatch — operation starts workflow).

### Node enumeration rules

For each AST definition:

- **Namespace:** one node per namespace.
- **Worker:** one node per `NamespaceDef.workers[i]` (each instantiation = one deployment). If
  declared but never instantiated, one orphan node.
- **Workflow / Activity / NexusService:** one node per (registration × worker deployment). If
  declared but registered on no instantiated worker, one orphan node.
- **NexusOperation:** one node per (operation × parent service's deployment). Inherits the
  service's worker / namespace / queue. Orphan if the service is orphan.
- **NexusEndpoint:** one node per `NamespaceDef.endpoints[i]`. Always namespace-deployed by
  construction — no orphan case.

## Files Touched

| File | Change |
|------|--------|
| `tools/lsp/parser/graph/` (renamed from `deps/`) | Full rewrite; new types and resolver |
| `tools/lsp/parser/graph/graph.go` | `Extract(file *ast.File) *Graph` returning the new model |
| `tools/lsp/parser/graph/nodes.go` | Deployment node construction (registration × instantiation), orphan handling |
| `tools/lsp/parser/graph/routing.go` | Per-call-site dispatch edge resolution |
| `tools/lsp/parser/graph/containment.go` | Containment edge emission |
| `tools/lsp/parser/graph/coarsen.go` | Tier projection (worker, namespace) |
| `tools/lsp/parser/graph/graph_test.go` | Fixture-based tests |
| `tools/lsp/parser/graph/testdata/task_queues.twf` | Canonical routing fixture (port from `skills/design/topics/task-queues.twf`) |
| `tools/lsp/cmd/twf/graph.go` (renamed from `deps.go`) | CLI command |
| `tools/lsp/cmd/twf/main.go` | Wire `twf graph`; remove `twf deps` |
| `tools/lsp/cmd/twf/twf.schema.json` | New schema |
| `tools/lsp/cmd/twf/README.md` | Document `twf graph` |
| Ad-hoc references | Update mentions of `twf deps` in `Makefile`, spec sections, skills |

## Open Questions

1. **Nexus call with both endpoint and call-site `task_queue:` option.** Endpoint wins (it's the
   dispatch contract). The `routing.explicit` field is suppressed for `nexusCall`; surface as a
   `DISPATCH_IGNORED_EXPLICIT_QUEUE` diagnostic so the user knows their override had no effect.

2. **Schema versioning.** First time `twf.schema.json` structurally breaks. Pick a versioning
   convention (semver-style `"$schemaVersion": "2.0.0"`? monotonic int?) and document at the
   top.

## Layering Notes

- `graph.Extract` is a Go library function. Any in-process consumer (validator, future codegen,
  LSP server) can call it directly; no JSON serialization is required for in-process use.
- The validator and graph package both walk statement bodies (for diagnostics vs. structure
  extraction respectively). They share the existing `ast.WalkStatements` walker; no
  reimplementation.
- If the validator wants to surface `DISPATCH_*` diagnostics in its unified output, it calls
  `graph.Extract` and forwards them. Trivial change; not REVISIONS-worthy on its own.

## Resolved Design Decisions

(Recording these explicitly so they're not relitigated when implementing.)

- **Visualizer is a renderer, not a brain.** Anything the visualizer needs to render is produced
  upstream — containment edges, nexusFronts edges, coarsened tier edges. The visualizer hooks
  ID links; it doesn't compute graph structure.
- **Multi-namespace workers** produce one worker deployment node per (worker, namespace), and
  one set of hosted deployments per worker deployment. Cleanly modelled by the deployment-node
  framing — no view-layer ambiguity.
- **Multi-edge at producer:** call sites that dispatch to the same target produce one edge each
  (different `line`). Visualizer dedups for display if desired.
- **Containment is emitted as edges**, not derived. Distinct `kind: "containment"`.
- **NexusOperation parent is the service**, not the endpoint. The endpoint's role is purely
  routing — captured by `routing.nexusEndpoint` on `nexusCall` edges. No endpoint→service edges
  are emitted; the relationship is an inference, not a semantic fact.
- **Orphan state is encoded in the node ID** with a `/orphan` suffix tag, in addition to the
  `orphan: true` field for ergonomic JSON consumption.
- **Coarsened edges live in a separate top-level array** because their shape differs (tier and
  weight instead of line and routing).

## Dependencies

- **[visualizer/REVISIONS_003](../visualizer/REVISIONS_003.md)** consumes this. Lands after.
- **[parser/REVISIONS_002](./REVISIONS_002.md) Group 1** (TS `ActivityCall.options` /
  `WorkflowCall.options` type fix) is independent.
- **Author-go skill** (future) will consume `twf graph` for routing-aware Go emission. The
  deployment-node shape maps directly: one Go registration call per worker deployment node, one
  Go dispatch call per outgoing edge.
