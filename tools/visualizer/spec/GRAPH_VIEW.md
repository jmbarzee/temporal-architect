# Graph View

A second view for the Visualizer. The existing tree view shows definitions in isolation. This graph view shows **how definitions relate to each other** — which namespaces depend on which, how workers compose, and where workflows call across boundaries.

What the view does with the graph — layout, controls, filtering, interaction, chrome — is the engine's, in force-graph's [SPEC.md](https://github.com/jmbarzee/force-graph/blob/main/SPEC.md). This file specs what this host decides.

---

## User Goals

This view serves goals 6–9 (system architecture questions) from [PRODUCT.md](./PRODUCT.md) § User Goals.

---

## Data Flow: Two Views, Two Commands

The visualizer's two views consume different parser outputs:

| View | Primary input | Secondary input |
|---|---|---|
| **Tree view** | `twf parse` (AST + diagnostics) | — |
| **Graph view** | `twf graph` (resolved deployment graph) | AST for the source-file axis, the chip counts and the findings bars |

The graph view is a **renderer over the parser-emitted deployment graph**. The parser owns deployment expansion (one node per definition × deployment context), dispatch routing (which deployment a call lands on), and tier coarsening (worker-tier and namespace-tier projections of dispatch edges). The visualizer does not re-walk the AST for any of this. Its **host half** — the adapter in `tools/visualizer/src/adapter/` — translates the parser's nodes and edges into the library's `Graph` and declares the Temporal taxonomy; its **library half** — `@jmbarzee/force-graph`, an external package — lays that graph out, filters, highlights and draws it, and never sees the parser or the AST.

Two identities thread through the graph. `node.copyKey` groups a definition's deployment copies (§ The model). A **cross-view focus** is the library's `FocusTarget { values }` — the axis values the host knows (its kind, its file), which the destination's filter widens to admit — plus the definition's name, which the host carries beside it in a type of its own (`TreeFocus`). That name is the definition's qualified name (`billing.Charge`; the bare name when unpackaged). Into the Graph, the host focuses the node whose `copyKey` is `${kind}:${name}` (§ Packages and Qualified Identity). Into the Tree, the host resolves the clicked node by its `copyKey` to the top-level definition that owns it — the definition itself, or, for a node nested inside one (a nexus operation, a nexus endpoint), its nexus service or namespace — and the focus names that definition and widens its kind; the view scrolls to it, or, for a nested node, expands it and scrolls to and flashes the operation or endpoint row inside (the focus's `child`). A node with no owning definition is offered no "Show in Tree".

For **packaged** designs the `name` element carries a package qualifier (`workflow:billing.Charge`, `nexusOperation:billing.Svc.Op`) — see § Packages and Qualified Identity. The contract is unchanged: the kind is still everything before the **first** `:`, and the package `.` is part of the name, never a new key segment.

## Graph Data Model

### Two parallel ladders

The graph is two parallel hierarchies that cross-connect via dispatch:

| Tier             | Main ladder           | Nexus ladder           | Containment relationship  |
|------------------|-----------------------|------------------------|---------------------------|
| Container        | **Namespace**         | **NexusEndpoint**      | Endpoint → Namespace      |
| Host             | **Worker**            | **NexusService**       | Service → Worker          |
| Orchestrator     | **Workflow**          | **NexusOperation**     | Operation → Service       |
| Leaf             | **Activity**          | —                      | Activity → Worker         |

The **main ladder** is the four-rung Namespace → Worker → Workflow → Activity hierarchy that describes how Temporal organises long-running work: containers hold hosts, hosts register orchestrators, orchestrators dispatch to leaf work.

The **nexus ladder** is the parallel three-rung Endpoint → Service → Operation hierarchy that describes how nexus routing layers onto the same containers and hosts: endpoints declare a routable name inside a namespace, services attach to workers, operations belong to a service. The nexus ladder ends at the orchestrator tier — nexus operations either delegate to a backing workflow (async ops) or run an inline body that itself calls into the main ladder (sync ops). There is no nexus-side equivalent of activity.

**Cross-ladder edges come in two distinct kinds:**

- **Cross-ladder containment** binds each nexus rung to its main-ladder host. `Endpoint → Namespace` (an endpoint is declared inside a namespace). `Service → Worker` (a service is hosted on a worker). The third nexus rung `Operation → Service` is intra-nexus containment; operations don't bind cross-ladder, they bind to their declaring service.
- **Cross-ladder dispatch** connects orchestrators across the ladders. `Workflow → Operation` (a workflow makes a nexus call). `Operation → Workflow` (async operations have a backing workflow; sync operations call workflows from their body). These edges are the reason both ladders matter visually — they tell the story of how work crosses the routing surface.

### The model

A node's identity is a **value map** — `values: Record<AxisId, AxisValue>` — rather than a single type string, and every feature elects exactly one axis to read. This domain projects onto three: `temporalType` (the style axis, which the taxonomy describes value by value), `sourceFile`, and `defType` — the kind the filter chips test, a projection of the type that the adapter writes onto each node at build time so the engine reads every axis the same way. Edges carry two: `relation` (containment or dependency) and `dispatch` (the parser's call kind).

What each value of the type axis **is** — its `ladder` and `tier`, label, abbreviation, icon, fill and border per theme, size, physics (charge, core radius, the rest band on each layout axis), what its dependency edges do when it is hidden (`whenHidden`), and how it summarises (`summaryKind`) — lives with the host in `NODE_TYPE_REGISTRY` (`tools/visualizer/src/adapter/node-types.ts`), handed to the library as the ordered `styles` of its spec; whether a kind is visible by default is the registry's own `defaultVisible`, read by the kind axis's `initialSelection`. The edge types with their springs and strokes are in `src/adapter/edge-types.ts`; the filter axes with their chips beside the registry, their policies the library's defaults for an allow-list and a narrowing axis. Two hooks let the host refine what the library computes without the library naming a value: the hover box's context line and the highlight (§ Nexus Routing Association).

The two words for the hierarchy are **ladder** (main or nexus) and **tier** (container, host, orchestrator, leaf) — the registry's own fields. There is no numeric `level`/depth field on a node: the earlier encoding that flattened both ladders' tiers into one sortable number is gone, and where this document means a tier it names one. (The parser's own `tier` field on a coarsened edge — `worker` or `namespace`, the target of its coarsening — is a different word that happens to be spelled the same.)

**Per-worker duplication.** Orchestrator- and leaf-tier nodes (Workflow, Activity, NexusOperation) and the nexus host (NexusService) are emitted **per worker deployment** — an activity registered on three workers produces three distinct nodes, each parented to its respective worker. This makes the fact that a definition has multiple homes visible directly in the canvas, instead of collapsing it into a single node whose containment relationship to all-but-one of its workers is silently dropped. Duplication is performed upstream by `twf graph`; the visualizer consumes the already-duplicated nodes.

Each duplicate shares a stable `copyKey` — opaque to the engine, derived by whoever produced the graph (here the parser's `definition` field, with the parent service name folded in for operations as `Service.Op`). The library indexes it (`copyGroups(graph)`) for its copy halo ([SPEC § Copies](https://github.com/jmbarzee/force-graph/blob/main/SPEC.md#copies)); the host's group overlay reads the same index. Definitions that are not registered on any worker remain orphan singletons (one node, no parent); the host marks them with the library's dashed ring (`ring: 'dashed'`).

**Parameterized-family nodes (`templateParams`).** `namespace`, `nexusEndpoint` and worker nodes carry an optional `templateParams: string[]` wire field (`graph.Node.TemplateParams`, **omitted when empty**), naming a parameterized family's template parameters:

- on a namespace or endpoint node, the parameters in the node's name — `["org"]` for `fabric-shard-{org}`;
- on a worker node (`worker:<w>/namespace:<ns>`), its instance parameters, one worker queue per value — `["sandboxId"]` for task queue `sandbox-{sandboxId}`.

Its sole role in the view is presentation: the **cardinality badge** (§ Node Appearance). It does **not** participate in identity. A namespace or endpoint family's `id` and `definitionKey` carry the full templated name (`namespace:fabric-shard-{org}`, `nexusEndpoint:fabric-shard-{org}-BootstrapShard`), and a worker family's carry no parameter at all, so cross-view selection, `duplicateGroups`, and the bare, flat-global identity of `namespace` and `nexusEndpoint` (§ Packages and Qualified Identity) are unaffected.

### Packages and Qualified Identity

A [`package`](../../../skills/temporal-architect-design/topics/packages.md) is the DSL's compile-time symbol grouping — a directory of `.twf` files whose symbols resolve together. When a design uses packages, the parser folds the owning package **into the name element** of the affected node identities. The visualizer treats this as a pure naming/grouping concern; it introduces **no new tier, node type, or containment level**.

**The qualified-ID contract:**

- For **workflow, activity, nexusService, and nexusOperation** nodes, the package rides as a leading segment of the name: `workflow:billing.Charge`, `activity:billing.ValidateOrder`, `nexusService:billing.PaymentService`, `nexusOperation:billing.PaymentService.Charge` (package **and** service both fold into the operation's name).
- **NexusEndpoint, Worker, and Namespace** nodes keep **bare** identity — no package qualifier. Endpoints are flat-global (a cluster-global registry), and workers/namespaces are deployment topology, not package-scoped symbols.
- The **default (clause-less) package is elided**, so an unpackaged design's node IDs are **byte-identical** to before packages existed. This is what keeps the feature purely additive for the visualizer: only designs that actually declare packages see qualified names.
- `splitDefinitionKey` only splits off the kind (everything before the **first** `:`); the rest of an id is opaque. A node's **label** comes from its fields: the package's declared name from the graph's `packages` table and the node's bare `name` (`billing.Charge`), with the package identity appended in parentheses when two packages share a declared name; an operation shows its op alone (the last `.` segment of `name`, a parse of `name`, never of the id). A node without `name` — a saved graph from an older twf — falls back to its definition key's name element, which already carries the package.

**Where the package comes from.** Each packaged workflow, activity, and nexus-service AST definition carries a `qualifiedName` (`billing.Charge`) — the same string as the name element of its node ID — beside a `name` that stays bare. The field is absent for an unpackaged definition and for workers and namespaces (whose identity is bare); a nexus operation's graph name is `${qualifiedName ?? name}.${op.name}` of its service. The host never rebuilds the qualification rule: one helper on its AST façade, `qualifiedNameOf(def)` (`qualifiedName ?? name`), is the only reader, and both the AST-side `sourceFile`/hover lookup (§ Graph Construction) and the cross-view focus key on it — focus from the Tree finds the graph node whose `copyKey` (its definition key) is `${type}:${qualifiedNameOf(def)}`, never by display name. The file-level `package` clause cannot serve this join — a merged multi-package tree has no single file package. For the grouping lens, the visualizer reads a node's package **from its qualified node-ID name** (the leading `pkg.` segment before the final one or two name parts).

### Package Grouping Lens

Package membership is a **grouping lens**, parallel to the existing source-file axis (the per-file filter chip; today "package" ≈ that chip). Because a node's package is recoverable from its qualified `definitionKey`, the visualizer can group, badge, or filter nodes by package **without any new wire data** — the same way `duplicateGroups` is derived from `definitionKey`. Unpackaged designs collapse to a single implicit group (no qualifiers, nothing to show), so the lens is inert for them.

Adopting the qualified IDs and surfacing the lens in the shipped host (`@temporal-architect/visualizer`, consumed by `temporal-architect-dist`) is a coordinated cross-repo follow-up; this spec fixes the contract the host adopts.

Reading the table top-to-bottom on the main ladder is **organisation → hosting → orchestration → leaf work**:

- **Namespace** — the deployment container.
- **Worker** runs code.
- **Workflow** orchestrates a long-running execution.
- **Activity** is the leaf of the call graph — work happens here, no further calls fan out.

Reading the nexus ladder is **routing → API surface → callable handle**:

- **NexusEndpoint** — a routing alias declared inside a namespace. Endpoints bind a `(namespace, task_queue)` pair to a name that nexus call sites can reach. They have no outgoing dispatch — they're pure addressing.
- **NexusService** — a callable API surface, hosted on a worker. The service is a peer of the worker that hosts it (neither contains the other in any deeper sense beyond hosting).
- **NexusOperation** — the per-operation handle a service exposes; for async ops it delegates to a backing workflow on the main ladder, for sync ops it runs an inline body that calls into the main ladder.

Visually the canvas uses hierarchical Y-band gravity to stack the tiers vertically — containers at the top, leaves at the bottom — so the main ladder reads top-to-bottom as a layered diagram. The nexus ladder's rungs share Y bands with their main-ladder peers where possible (Operation with Workflow, Service with Worker), so cross-ladder edges read as roughly horizontal hops.

Walking parents from any node terminates at a Namespace. From a workflow the walk goes Workflow → Worker → Namespace. From an operation the walk goes Operation → Service → Worker → Namespace (the operation reaches the main ladder via its hosting service). From an endpoint the walk goes Endpoint → Namespace directly (endpoints live one cross-ladder hop from the container tier).

### Fundamental Edges

**Containment edges** come from registration / nesting:

1. **Workflow / Activity → Worker** ("registered on") — A workflow or activity is registered on a specific worker.
2. **NexusService → Worker** ("hosted on") — A host-tier peer containment edge. The service is hosted on the worker, not below it: both are hosts.
3. **NexusOperation → NexusService** ("member of") — An operation belongs to its declaring service (an orchestrator-tier child of its host-tier service).
4. **Worker → Namespace** ("member of") — A worker is instantiated within a specific namespace.
5. **NexusEndpoint → Namespace** ("declared in") — An endpoint is declared inside a specific namespace.

**Dependency edges** come from call sites in workflow and sync-operation bodies, plus the implicit "operation delegates to backing workflow" relationship of an async operation. They are first-class semantic relationships and are drawn between the orchestrators and leaves themselves, regardless of whether caller and callee share a Worker — co-location on a worker says nothing about whether one calls the other, so containment cannot stand in for a call edge.

Activities are **leaves of the call graph** — they do not emit dependency edges. Activities cannot call other activities or workflows; these are not Temporal primitives. Dependency edges only originate from workflows and nexus sync operations.

1. **Workflow → Workflow** ("calls") — A workflow calls or awaits another workflow.
2. **Workflow → Activity** ("calls") — A workflow calls an activity.
3. **Workflow → NexusOperation** ("calls") — A call site `nexus Endpoint Service.Operation(args)` is an edge from the calling workflow to the operation node. The endpoint is preserved as edge metadata for hover info.
4. **NexusOperation → Workflow / Activity / NexusOperation** ("calls"), for sync operations — the body of a sync operation is walked just like a workflow body, with the operation as the caller.
5. **NexusOperation → Workflow** ("delegates to"), for async operations — an async operation is implemented by a backing workflow; this edge is emitted from the operation declaration, not from any specific call site.

Putting operations on the call path (caller → operation → callee) lets the user see who reaches each operation, what it routes to, and which service owns it, in a single subgraph. The shape (3 connections from each operation: parent service, callers, callee) is the user-visible payoff for promoting operations from edge metadata to first-class nodes.

Multiple call sites between the same pair (caller, callee) of the same kind collapse into a single dependency edge — the graph answers "does X reach Y, and how?", not "how many times". The fold is this host's, in its adapter (`build.ts`); a call and a signal between the same two workflows stay two edges. When the same caller reaches an operation through more than one endpoint, the surviving edge keeps the first call site's endpoint as hover metadata.

Separately, the parser emits a **NexusOperation → NexusEndpoint** composition edge (`kind: "nexusRoute"`) for each endpoint that fronts an operation — matched upstream on shared `(namespace, queue)`. This is structural topology, not an observed dispatch: it carries no routing metadata, is excluded from coarsening, and renders as a containment-style edge. It is the source of truth for the endpoint↔operation relationship; the visualizer reads it instead of re-deriving the association from node `(namespace, queue)` fields.

### Derived Edges (Graph Coarsening)

Dependency edges between hosts and between containers are **derived** by projecting the orchestrator- and leaf-tier dependency edges upward through containment:

1. **Worker → Worker** ("depends on") — Exists when anything hosted on Worker A depends on anything hosted on Worker B. Discard self-loops.
2. **Namespace → Namespace** ("depends on") — Exists when any Worker in Namespace A depends on any Worker in Namespace B. Discard self-loops.

### Graph Construction

The deployment graph is constructed **upstream** by `twf graph` (see `tools/lsp/parser/graph/`). The host consumes the resulting JSON and translates each piece into the library's `Graph` (`buildGraph`, in the adapter). Construction is a single pass over the parser payload:

1. **Translate nodes.** For each `parserGraph.nodes[i]`, emit a node with `id` (the parser's composite deployment ID), `name`, a **value map** — `temporalType` from the parser's `definition` kind, `defType` (the kind the filter chips test, a projection of the type), `sourceFile` from the AST definition's `site.file` — `parentId` (looked up from the parser's containment edges; the same fact as the containment edge, written once by the host), `copyKey` (= `parserGraph.nodes[i].definition`), `ring: 'dashed'` when the parser marks the node orphan, one `× {param}` badge per entry of the parser's `templateParams`, and a `payload` of hover metadata (queue, hosting worker) the library carries opaquely. The AST is consulted only for `sourceFile`; everything structural comes from the parser. The AST lookup for `sourceFile` is keyed on the parser's `definition` field: workflow, activity, and nexus-service entries on `${kind}:${qualifiedNameOf(def)}`, operations on `nexusOperation:${qualifiedNameOf(service)}.${op.name}`, workers, namespaces, and endpoints on their bare names — so a packaged node gets its `sourceFile`, and its file chip, like any other (§ Packages and Qualified Identity).
2. **Translate edges.** For each `parserGraph.edges[i]`, emit an edge whose `relation` field is `containment` for `kind: "containment"` and for `kind: "nexusRoute"` (the endpoint↔operation composition) and `dependency` for the dispatch kinds, carrying one axis value, `dispatch` — the parser's kind itself (`activityCall`, `workflowCall`, `nexusCall`, `asyncBacking`, `signalSend`), which is what lets a signal send spring differently from a workflow call. An edge's **type** — its spring and its stroke — is classified once, on the style values of its original endpoints: by the declared edge types — their pairs, their orientation, and the signal-send type's `match` on `dispatch` (a signal send and a workflow call both run workflow → workflow and resolve apart by it) — with the host's `edgeTypeFor` as the taxonomy's `classifyEdge` for what the declarations cannot express: handed the declared answer, it keeps it — except that a signal send is the signal-send type on any pair — and gives a pair the table does not declare the broadest type of the tier it touches. `nexusCall` edges carry `routing.nexusEndpoint` in their `payload` — host metadata the library never reads — so the host's highlight hook can follow an endpoint's routes; the stroke of a spliced caller-to-backing edge is its resolved type's (a workflow dependency), not the nexus palette's. `nexusRoute` edges are not in the parser's containment set, so they never reassign an operation's `parentId` (which stays its owning service).
3. **Translate coarsened edges.** For each `parserGraph.coarsenedEdges[i]`, emit a worker-to-worker or namespace-to-namespace dependency edge (the parser's `tier` field names the target of its coarsening, `worker` or `namespace` — not the registry's tier). No projection logic runs in the visualizer — the parser has already aggregated dispatch edges by `(from, to, tier)` and discarded self-loops.

Per-worker duplication, dispatch routing, cross-namespace coarsening, and orphan detection are all properties of the parser graph. The host never re-derives them.

### Orphan Definitions

The containment hierarchy assumes every orchestrator- and leaf-tier node belongs to a Worker and every Worker belongs to a Namespace. But the DSL allows definitions without assignments — a workflow not registered on any worker, a worker not placed in any namespace.

**Treatment:** Orphan definitions appear in the graph as uncontained nodes, marked by the library's dashed ring (`ring: 'dashed'`). They participate in dependency edges normally.

**Type filtering behavior:**
- Orphan workers (no namespace) are visible when the Workers chip is on.
- Orphan orchestrators and leaves (no worker) are visible when their kind's chip is on. NexusOperation nodes inherit orphan status from their parent service: if the service is orphan, the operations are too.
- Orphans follow the same toggle rules as any other node — they're shown or hidden by their type, not by containment.

---

## Edge Graduation

Graduation is the engine's ([README § Collapse rules](https://github.com/jmbarzee/force-graph/blob/main/README.md#collapse-rules)). This host's choices: every value `ascend`s but the operation, which `splice`s, so with operations hidden caller → operation → backing draws as caller → backing; a visible workflow's call to a hidden activity re-points to the activity's worker, a mixed-tier edge the parser's coarsening never emits; and at a coarse tier the parser's coarsened edge is the one drawn. When two graduated edges land on one pair, this host's `collapse` keeps the one carrying routing metadata, in either edge order.

---

## Visual Encoding

### Node Appearance

**Parameterized-family nodes (cardinality badge).** A node with `templateParams` (§ Graph Data Model) is drawn once, as its static counterpart is, with one `× {param}` chip per entry (`× org`, `× region` for `["org","region"]`). The chips are an **adornment**, not the name label ([PRODUCT.md](./PRODUCT.md) § Node badges); a namespace or endpoint label keeps its parameters. The workflows, activities and nexus services a family worker hosts carry no chip: the family is the worker.

*A worker instantiated more than once in a namespace* is one node: its chips are the union of its instantiations' parameters and its queue the first's, so a chip can sit beside a static queue in its context line (§ Hover).

*Deferred:* drawing a family's members (`fabric-shard-acme`, `sandbox-8f3a`, …) as their own nodes — [#258](https://github.com/jmbarzee/temporal-architect/issues/258).

---

## Interaction States

### Hover

The context line is the taxonomy's `contextLine` (`contextLineFor`, `src/adapter/node-types.ts`): a worker or nexus node shows where it lives and the task queue that routes to it, a workflow or activity its worker, a namespace nothing.

The hover box's button is this host's **Show in Tree** (`nodeAction`), the `focus(target)` transition ([VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § View Transitions); it is handed the node, so the host knows which copy was clicked, and lands where § Data Flow says.

### Nexus Routing Association (Hover)

The nexus family has transient hover behaviors that reveal routing relationships without persistent edges. These complement the standard transitive-dep highlight and apply automatically based on node type. They are the taxonomy's, not the library's: the host's `highlight` hook refines the library's transitive walk for an active node, and its `contextLine` hook writes the hover box's context line — the library computes the walk and the parent's name, and asks.

**Hover on a `nexusEndpoint` node:** Standard transitive-dep BFS does not apply — endpoints have no outgoing dependency edges (they are pure addressing aliases). Instead, the canvas highlights all visible `nexusCall` edges whose routing metadata names this endpoint, plus the source and target nodes of those edges. The endpoint's namespace parent is also highlighted for context. The result makes the "which calls route through this entry point?" question answerable at a glance — the fan-out shows every caller and every operation that a call through this endpoint reaches.

**Hover on a `nexusService` deployment:** The standard transitive-dep chain applies as usual. Additionally, the endpoints fronting this service's operations are added to the highlighted set (plus their namespace parent). These are reached by walking the service's operation children and following their `nexusRoute` edges to the endpoint nodes — the parser materialises the endpoint↔operation composition as a `nexusRoute` edge (matched upstream on namespace + queue), so the visualizer never re-derives the relationship from node `(namespace, queue)` fields. This surfaces "which endpoints front calls to this service?" at hover time.

Both behaviors operate over edges the parser already emits — the endpoint hover reads the `nexusEndpoint` routing metadata in a `nexusCall` edge's `payload`; the service hover reads `nexusRoute` edges. Neither consults node `(namespace, queue)` fields, which exist only as hover-tooltip display metadata.

---

## Group Overlay

The graph view can overlay a grouping of its nodes as a **non-destructive glow
highlight**, in one of two **schemes**, never both, since a node glows in one group
at a time:

- **Chunks** — the **chunk decomposition** (`twf graph chunks`), the
  topology-based grouping of definitions into independently-authorable units. It
  answers "what are the composable groups of work, and which nodes belong to
  each?" Most of this section is this scheme.
- **SDKs** — the SDK set of the worker each node deploys on (§ SDK Scheme). It
  answers "which language runs what, and where do calls cross languages?"

This is **graph-view only**; the tree view is unaffected.

v1 consumes a **precomputed** decomposition (the ranked portfolio at a host-chosen
ceiling). There is no in-view recompute — changing the analysis parameters
(ceiling, floor, strategies) is a separate, deferred capability
([#43](https://github.com/jmbarzee/temporal-architect/issues/43)).

### Data

The decomposition payload rides alongside `ast` / `parserGraph` (additive; absent
for hosts that don't supply it). Its sections' members are `definition` keys —
identical to `node.copyKey` — so membership joins onto graph nodes directly,
and the library's `copyGroups(graph)` maps each member to all its sister deployment copies.

Group membership is **not** baked into the static graph; it is derived reactively
from the decomposition plus the modal's current selection, exactly like the
hover/search highlight sets. The host turns its decomposition and the modal's
selection into groups over the whole graph (an id, the node ids covered, how
strongly to glow); the view draws and colours them
([SPEC § Group glow](https://github.com/jmbarzee/force-graph/blob/main/SPEC.md#group-glow)), and the host's legend reads the
colours back from the groups as drawn.

### Groups Modal

A collapsible floating overlay anchored **top-right, below the toolbar**
(the control panel holds bottom-right), **collapsed by default** (the toggle
reads "Groups"), mirroring the control panel's pattern. Its
header carries an **always-visible glow switch** (the control panel's sliding
switch style) — the master on/off for the overlay, shown whether the panel is
collapsed or open, so the glow can be toggled without expanding the panel. When
off, nothing glows regardless of the selection below. Beside it, when the design
declares any `@sdk`, a **Chunks | SDKs** switch picks the scheme the Groups tab
lists and the canvas glows; it opens on Chunks when there is a decomposition, else
on SDKs, and the panel shows for SDKs alone.

**Initially off, then normal.** The overlay is an opt-in feature: on load nothing
glows (the switch reads off, no chunks selected), so a freshly-loaded design isn't
blanketed in color. The **first engagement** — opening the panel *or* flipping the
switch on — **initializes** it: the glow turns on and **every chunk is enabled**, so
the user sees the whole decomposition at once. After that it behaves like ordinary
persistent state (toggling the switch or individual chunks never re-bootstraps).

The browser shows the **full partition**, not just the splittable chunks:

- **Groups** (browser) — every hard chunk is a row, heaviest first. Three distinct,
  non-overlapping controls so the user is never guessing what a widget does:
    - a **chunk checkbox** (multi-select) — whether this chunk participates in the
      glow; any subset of chunks can be on at once;
    - **option radios** (single-select) — for an **over-ceiling** chunk, which *one*
      division is active (the rank-1 division by default). Competing divisions
      partition the same nodes, so **only one is active at a time**; switching is
      client-side, no recompute. An **under-ceiling** chunk has no divisions — it is
      a **single group** (the chunk's whole member set glows as one), so its row is
      just the checkbox, with no options or sections beneath it.
    - **disclosure carets** — show/hide a row's direct children, and *only* that.
      The selected option carries a caret to show/hide its section list (open by
      default); each section with a recursive sub-division carries its own caret.
      Collapsing is **browsing only** — it never changes what glows. Non-selected
      options (and single-group chunks) own no sections, so they show no caret.

  Sections carry a thin **color bar** legend (not a box) keyed to their canvas
  glow, plus a member/complexity count (the chunk row shows the same count for its
  whole partition cell). Hovering any row **previews** its group(s) — including a
  toggled-off chunk's single group — transiently overriding the pinned selection
  (hover is exploratory); the radio **pins** the active division. A bulk "expand
  all / collapse all" is deferred
  ([#45](https://github.com/jmbarzee/temporal-architect/issues/45)).
- **Params** (read-only) — the analysis inputs that produced the grouping:
  ceiling, floor, max-depth, and the strategies considered. A visible placeholder
  for the future recompute controls.

The modal **is the legend**: a group's identity ("which group is this?") is read
from the modal (hover a section row to make it glow), not decoded from color.

### SDK Scheme

One group per distinct **SDK set** among the graph nodes' `sdks` — a worker's
`@sdk` set, carried by every node it hosts — labelled by its SDKs (`go`,
`go + python`). A multi-SDK worker's set is its own group, keeping one group per
node. Groups take palette slots in a fixed order, single-SDK sets first, then by
label, so a design's colours hold across reloads. A node with no `sdks`
(a namespace, an endpoint, an orphan, an unannotated worker and what it hosts) is
in no group and glows neutral.

The Groups tab lists one row per set (color bar, label, node count; hovering a row
emphasises its group) and, beneath them, **N cross-SDK calls**: the activity,
workflow and Nexus call and signal-send edges whose two nodes both carry `sdks`
and share none — the rule of `twf check`'s `CROSS_SDK_CALL` hint
(`graph.SDKCrossings`). While the scheme glows, the view marks those edges
(`markedEdges`). The visualizer's copy of the rule (`src/adapter/sdk.ts`) and the Go one are tested
against one fixture, `tools/lsp/parser/graph/testdata/cross_sdk.*`.

### Glow Display

The glow is the engine's ([SPEC § Group glow](https://github.com/jmbarzee/force-graph/blob/main/SPEC.md#group-glow)). The modal is the legend. Smarter colour assignment is split: this host's stable hue for the dominant shared service and the glow metric are [#44](https://github.com/jmbarzee/temporal-architect/issues/44); the engine's structural colouring is [force-graph#27](https://github.com/jmbarzee/force-graph/issues/27).

### Advisory (note)

The decomposition may carry `suggestContract` advisories (a heavily-shared hub
that is an articulation point — a candidate Nexus contract boundary). Surfacing
these in the graph (e.g. a node badge) is **deferred**; see
[#44](https://github.com/jmbarzee/temporal-architect/issues/44).

---

## Keyboard Navigation

The keys are the engine's ([SPEC § Keyboard](https://github.com/jmbarzee/force-graph/blob/main/SPEC.md#keyboard)). This host listens globally, since the pane is the whole webview: the shell passes `global` while the Graph view is the active tab and `none` while it is the hidden one, kept mounted. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Keyboard Modifier Vocabulary.
