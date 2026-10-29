# Graph View

A second view for the Visualizer. The existing tree view shows definitions in isolation. This graph view shows **how definitions relate to each other** — which namespaces depend on which, how workers compose, and where workflows call across boundaries.

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

The graph view is a **renderer over the parser-emitted deployment graph**. The parser owns deployment expansion (one node per definition × deployment context), dispatch routing (which deployment a call lands on), and tier coarsening (worker-tier and namespace-tier projections of dispatch edges). The visualizer does not re-walk the AST for any of this. Its **host half** — the adapter in `tools/visualizer/src/adapter/` — translates the parser's nodes and edges into the library's `Graph` and declares the Temporal taxonomy; its **library half** — `@temporal-architect/graph-view`, in `tools/graph-view/` — lays that graph out, filters, highlights and draws it, and never sees the parser or the AST (R38, D62).

Two identities thread through the graph. `node.copyKey` (the parser's `definition` field — `${kind}:${name}`) groups a definition's deployment copies: the library indexes it (`copyGroups(graph)`), and hovering one copy halos every sister (§ Duplicate Highlighting). A **cross-view focus** is the library's `FocusTarget { name, values }` (D59): the host names the definition and the axis values it knows (its kind, its file), the graph centres on the first node matching all of them, and the sisters show through the duplicate halo. A packaged definition's qualified node name (`billing.Charge`) does not match the AST's bare name, so a focus on it misses — [#184](https://github.com/jmbarzee/temporal-architect/issues/184).

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

A node's identity is a **dimension map** — `dimensions: Record<DimensionId, DimensionValue>` — rather than a single type string, and every feature elects exactly one axis to read. This domain projects onto three: `temporalType` (the style axis, which the taxonomy describes value by value), `sourceFile`, and `defType` — the kind the filter chips test, a projection of the type that the adapter writes onto each node at build time so the engine reads every axis the same way. Edges carry two (R5): `relation` (containment or dependency) and `dispatch` (the parser's call kind).

What each value of the type axis **is** — its `ladder` and `tier`, label, icon, fill and border per theme, size, physics (charge, core radius, the rest band on each layout axis), what its dependency edges do when it is hidden (`whenHidden`), whether it is visible by default, and how it summarises (`summaryKind`) — lives with the host in `NODE_TYPE_REGISTRY` (`tools/visualizer/src/adapter/node-types.ts`), with the abbreviations beside it (handed to the library as `OntologySpec.abbreviations`); the edge types with their springs and strokes in `src/adapter/edge-types.ts`; the filter axes with their chips and policies beside them. The *shapes* they fill in are the library's (`OntologySpec`, `NodeTypeDefinition`, `EdgeTypeDefinition`, `DimensionDescriptor`), and `createOntology(spec)` refuses an incoherent one at construction. The library imports none of this: it reaches its domain through the injected `Ontology`, and the physics params are keyed by the chosen axis's bucket ids (push) and by spring-category ids (pull) — the host's declared ids on the type axis, pair ids elsewhere. Two hooks let the host refine what the library computes without the library naming a value: the hover box's context line and the highlight (§ Nexus Routing Association).

The two words for the hierarchy are **ladder** (main or nexus) and **tier** (container, host, orchestrator, leaf) — the registry's own fields. There is no numeric `level`/depth field on a node: the earlier encoding that flattened both ladders' tiers into one sortable number is gone, and where this document means a tier it names one. (The parser's own `tier` field on a coarsened edge — `worker` or `namespace`, the target of its coarsening — is a different word that happens to be spelled the same.)

**Per-worker duplication.** Orchestrator- and leaf-tier nodes (Workflow, Activity, NexusOperation) and the nexus host (NexusService) are emitted **per worker deployment** — an activity registered on three workers produces three distinct nodes, each parented to its respective worker. This makes the fact that a definition has multiple homes visible directly in the canvas, instead of collapsing it into a single node whose containment relationship to all-but-one of its workers is silently dropped. Duplication is performed upstream by `twf graph`; the visualizer consumes the already-duplicated nodes.

Each duplicate shares a stable `copyKey` — opaque to the engine, derived by whoever produced the graph (here the parser's `definition` field, with the parent service name folded in for operations as `Service.Op`). The library derives the index (`copyGroups(graph)`: key → every node id sharing it) once per graph and uses it during hover/select to keep sister copies visually grouped (see § Interaction States: Duplicate Highlighting); the host's group overlay reads the same index. Definitions that are not registered on any worker remain orphan singletons (one node, no parent); the host marks them with the library's dashed ring (`ring: 'dashed'`).

**Parameterized-family nodes (`templateParams`).** The container-tier nodes `namespace` and `nexusEndpoint` carry an optional `templateParams: string[]` wire field (`graph.Node.TemplateParams`, JSON key `templateParams`, **omitted when empty**). It names the template holes of a parameterized family — e.g. `["org"]` for `fabric-shard-{org}`. Its sole role in the view is presentation: it drives the **collapsed representative + cardinality badge** rendering (§ Visual Encoding → Node Appearance). It does **not** participate in identity. A parameterized family's `id` and `definitionKey` still carry the complete templated name string with holes (e.g. `namespace:fabric-shard-{org}`, `nexusEndpoint:fabric-shard-{org}-BootstrapShard`), so cross-view selection, `duplicateGroups`, and the bare/flat-global identity of `namespace` and `nexusEndpoint` (§ Packages and Qualified Identity — these node types keep bare, flat-global identity) are all unaffected by the presence of holes. Because the field is omitted when empty, static `namespace`/`nexusEndpoint` nodes carry **byte-identical** wire to before this feature existed and render exactly as they do today (no badge, no collapse); the feature is purely additive.

### Packages and Qualified Identity

A [`package`](../../../skills/temporal-architect-design/topics/packages.md) is the DSL's compile-time symbol grouping — a directory of `.twf` files whose symbols resolve together. When a design uses packages, the parser folds the owning package **into the name element** of the affected node identities. The visualizer treats this as a pure naming/grouping concern; it introduces **no new tier, node type, or containment level**.

**The qualified-ID contract:**

- For **workflow, activity, nexusService, and nexusOperation** nodes, the package rides as a leading segment of the name: `workflow:billing.Charge`, `activity:billing.ValidateOrder`, `nexusService:billing.PaymentService`, `nexusOperation:billing.PaymentService.Charge` (package **and** service both fold into the operation's name).
- **NexusEndpoint, Worker, and Namespace** nodes keep **bare** identity — no package qualifier. Endpoints are flat-global (a cluster-global registry), and workers/namespaces are deployment topology, not package-scoped symbols.
- The **default (clause-less) package is elided**, so an unpackaged design's node IDs are **byte-identical** to before packages existed. This is what keeps the feature purely additive for the visualizer: only designs that actually declare packages see qualified names.
- `splitDefinitionKey` still splits on the **first** `:` — the package `.` lives entirely within the name element and is never mistaken for a kind/name boundary. Existing operation display (`displayNameFor` takes the last `.` segment) already yields the bare operation name `Charge` from `billing.PaymentService.Charge`; main-ladder labels render the qualified name (`billing.Charge`) as-is — the package **is** part of the name.

**Where the package comes from.** There is no separate per-definition `package` field on the wire: `ast/json.go` does not serialize it, and each definition's AST `name` stays bare. The visualizer therefore reads a node's package **from its qualified node-ID name** (the leading `pkg.` segment before the final one or two name parts), not from an AST field. The file-level `package` clause is available on the merged AST (`FileJSON.package`) to reconcile the AST-side `sourceFile`/hover lookup — whose keys are built from bare definition names — against the parser's qualified node IDs.

### Package Grouping Lens

Package membership is a **grouping lens**, parallel to the existing source-file dimension (the per-file filter chip; today "package" ≈ that chip). Because a node's package is recoverable from its qualified `definitionKey`, the visualizer can group, badge, or filter nodes by package **without any new wire data** — the same way `duplicateGroups` is derived from `definitionKey`. Unpackaged designs collapse to a single implicit group (no qualifiers, nothing to show), so the lens is inert for them.

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

Multiple call sites between the same pair (caller, callee) of the same kind collapse into a single dependency edge — the graph answers "does X reach Y, and how?", not "how many times". The fold is this host's, in its adapter (`build.ts`), not the library's: the library draws every edge it is given, and two edges between one pair are two facts, so a call and a signal between the same two workflows both show (D66). When the same caller reaches an operation through more than one endpoint, the surviving edge keeps the first call site's endpoint as hover metadata.

Separately, the parser emits a **NexusOperation → NexusEndpoint** composition edge (`kind: "nexusRoute"`) for each endpoint that fronts an operation — matched upstream on shared `(namespace, queue)`. This is structural topology, not an observed dispatch: it carries no routing metadata, is excluded from coarsening, and renders as a containment-style edge. It is the source of truth for the endpoint↔operation relationship; the visualizer reads it instead of re-deriving the association from node `(namespace, queue)` fields.

### Derived Edges (Graph Coarsening)

Dependency edges between hosts and between containers are **derived** by projecting the orchestrator- and leaf-tier dependency edges upward through containment:

1. **Worker → Worker** ("depends on") — Exists when anything hosted on Worker A depends on anything hosted on Worker B. Discard self-loops.
2. **Namespace → Namespace** ("depends on") — Exists when any Worker in Namespace A depends on any Worker in Namespace B. Discard self-loops.

### Graph Construction

The deployment graph is constructed **upstream** by `twf graph` (see `tools/lsp/parser/graph/`). The host consumes the resulting JSON and translates each piece into the library's `Graph` (`buildGraph`, in the adapter). Construction is a single pass over the parser payload:

1. **Translate nodes.** For each `parserGraph.nodes[i]`, emit a node with `id` (the parser's composite deployment ID), `name`, a **dimension map** — `temporalType` from the parser's `definition` kind, `defType` (the kind the filter chips test, a projection of the type), `sourceFile` from the AST — `parentId` (looked up from the parser's containment edges; the same fact as the containment edge, written once by the host), `copyKey` (= `parserGraph.nodes[i].definition`), `ring: 'dashed'` when the parser marks the node orphan, one `× {param}` badge per entry of the parser's `templateParams`, and a `payload` of hover metadata (queue, hosting worker) the library carries opaquely. The AST is consulted only for `sourceFile`; everything structural comes from the parser. For packaged designs the `definitionKey` name is package-qualified (§ Packages and Qualified Identity); the AST lookup for `sourceFile` is keyed on kind and bare name, so a qualified node currently gets no `sourceFile` — the reconciliation through the file's `package` clause is unbuilt ([#184](https://github.com/jmbarzee/temporal-architect/issues/184)).
2. **Translate edges.** For each `parserGraph.edges[i]`, emit an edge carrying two dimensions (R5): `relation` — `containment` for `kind: "containment"` and for `kind: "nexusRoute"` (the endpoint↔operation composition), `dependency` for the dispatch kinds — and `dispatch`, the parser's kind itself (`activityCall`, `workflowCall`, `nexusCall`, `asyncBacking`, `signalSend`), which is what lets a signal send spring differently from a workflow call. An edge's **type** — its spring and its stroke — is resolved on the type axis by the host's ordered edge rules (`edgeTypeFor`: the values at its two ends and the `dispatch`, so a signal send and a workflow call resolve apart). On any other push/pull axis the library's **pair rule** classifies springs instead — one category per unordered bucket pair per relation — and reads no dispatch (D49). `nexusCall` edges carry `routing.nexusEndpoint` in their `payload` — host metadata the library never reads — so the host's highlight hook can follow an endpoint's routes; the stroke of a spliced caller-to-backing edge is its resolved type's (a workflow dependency), not the nexus palette's (D57). `nexusRoute` edges are not in the parser's containment set, so they never reassign an operation's `parentId` (which stays its owning service).
3. **Translate coarsened edges.** For each `parserGraph.coarsenedEdges[i]`, emit a worker-to-worker or namespace-to-namespace dependency edge (the parser's `tier` field names the target of its coarsening, `worker` or `namespace` — not the registry's tier). No projection logic runs in the visualizer — the parser has already aggregated dispatch edges by `(from, to, tier)` and discarded self-loops.
4. **The copy index is the library's.** `copyGroups(graph)` indexes every node by its `copyKey`; the view builds it once per graph for the duplicate-highlight interaction (see § Interaction States: Duplicate Highlighting), and the host calls the same function for its group overlay. Nothing is supplied twice (D67).

Per-worker duplication, dispatch routing, cross-namespace coarsening, and orphan detection are all properties of the parser graph. The host never re-derives them, and the library never sees them: it reads nodes by their dimensions and edges by their relation.

### Orphan Definitions

The containment hierarchy assumes every orchestrator- and leaf-tier node belongs to a Worker and every Worker belongs to a Namespace. But the DSL allows definitions without assignments — a workflow not registered on any worker, a worker not placed in any namespace.

**Treatment:** Orphan definitions appear in the graph as uncontained nodes, marked by a dashed ring around the node body (drawn at detail zoom levels). They participate in dependency edges normally.

**Type filtering behavior:**
- Orphan workers (no namespace) are visible when the Workers chip is on.
- Orphan orchestrators and leaves (no worker) are visible when their kind's chip is on. NexusOperation nodes inherit orphan status from their parent service: if the service is orphan, the operations are too.
- Orphans follow the same toggle rules as any other node — they're shown or hidden by their type, not by containment.

**Seeding:** Orphan nodes have no parent to seed from, so a reveal leaves them where the initial seeding put them — in their own tier's band, like every other node (§ Simulation Lifecycle).

**Data:** Orphan status is the parser's (`orphan` on the node); the host turns it into the library's dashed ring (`ring: 'dashed'` on the graph node), which the canvas draws without knowing what it marks.

---

## Layout: Force-Directed Simulation

The graph is rendered using a **force-directed layout** (also called a force simulation or spring-electrical model). Nodes are positioned by a continuous physics simulation where forces push and pull until the system reaches equilibrium.

### Force Types

| Force             | Applies To       | Behavior                                                                 |
|-------------------|------------------|--------------------------------------------------------------------------|
| **Charge (repulsion)** | Every node pair | Nodes repel each other, preventing overlap. Follows an inverse-square falloff (like electrostatic charge). |
| **Link (attraction)**  | Connected node pairs | Edges act as springs pulling connected nodes toward a target distance.    |
| **Gravity** | All nodes | Cohesion/anchoring, as three forces (see § Gravity below): **Band** (two layout axes, X and Y, each with per-bucket rest bands — the hierarchy on Y, the horizontal window on X), **Topological** (root-ness inward pull), and **Center** (radial pull to the origin, the baseline when neither of the others acts). Band and Topological are interpreted through the Radial switch on the Y axis. |

Each force has a **strength** parameter that controls its magnitude. These strengths are the primary tuning knobs for the layout.

### Gravity: three forces, two axes, one switch

A force-directed graph is a free-floating cloud by default — held together but not held *anywhere*. Gravity supplies cohesion and structure as **three independent forces**:

- **Band** — two layout axes, X and Y, the same kind of thing (T22): each keys on a dimensional mapping — every bucket of which has a rest band on the axis — or on a **computed scalar** (R8), whose point on the axis is the node's score read across a span. A node inside its band feels nothing; outside, it is pulled back with force `strength × dᵉˣᵖ` where `d` is the distance past the nearest band edge (`exp = 1` is the linear/Hooke spring, shared by both axes); a scalar's rest is a point, so its pull is always on, and no pull carries a node past its rest in one tick. On the default mapping (the type axis) the Y bands carry the hierarchy and every type's X band is the one horizontal window, so the horizontal spread is bounded without structure. Bands are stored *relatively* and re-centred on the **median** of the band centres **present** over the whole graph, on each axis — one layout frame, computed when the parameters change and shared by seeding, the force and the overlay (D54) — so editing or toggling them doesn't shift the whole graph, and a filter toggle moves nothing; nodes are seeded in that frame, so the first tick relocates nothing. A strength of zero switches an axis off; a node with no value on an axis sits at that axis's centre.
- **Topological** — a single-sided inward pull whose strength scales with a node's **downstream reach** — the built-in Reach scalar: how many call-levels deep its subtree runs, propagated up containment and linearly normalized —: orchestrators atop deep call chains are drawn toward the focal point, leaves are left to charge. Reach is naturally tiered rather than combinatorially heavy-tailed, so no log compression is needed. Out-degree was considered as a secondary or blended signal and rejected: it is too local and too noisy to stand in for root-ness — a node with many immediate children but shallow subtrees is not an orchestrator. Depth is **propagated up the containment hierarchy** (a worker/service/namespace is scored at least as deep as anything it hosts) so the pull never drags a deep workflow above its own container — keeping it aligned with, rather than fighting, the bands. Origin-relative, so it is independent of the bands.
- **Center** — a radial pull toward the world origin. It is the unexplained baseline: active only when nothing else anchors — no band axis acting (in radial only Y counts) and Topological off or at zero strength — keeping the graph cohesive and anchored. (Not surfaced as a control.)

Band and Topological are interpreted through the **Radial** switch on the Y axis (R27):

- **Off (cartesian)** — Y bands are vertical windows, X bands horizontal ones; Topological's focal point is the top.
- **On (radial)** — the Y axis's buckets map to distance from the origin (smallest band centre innermost; on a scalar axis, the span's low end innermost), X is ignored, and Topological's focal point is the centre. Charge distributes nodes around each ring; there is no angular force.

Because the shaping forces re-centre on (or pull toward) the origin, the layout's centre of mass stays in frame and the canvas needs no per-tick re-centering — and switching forces or modes doesn't lurch the layout.

### Force Parameters

The simulation exposes **one charge strength + one core radius per bucket of the push/pull axis** (per node type on the default axis) and **one spring (stiffness + rest length) per spring category**, plus shape controls and dynamics that govern how those forces behave.

**Charge strengths** (one per bucket; the declared defaults below are per node type — negative values, repulsion):
- Namespace, NexusEndpoint, Worker, NexusService, Workflow, NexusOperation, Activity

**Core radii** (one per bucket — the charge softening, expressed as a length). A pair of nodes softens its charge by the squared average of the two endpoints' effective core radii (`rEff = coreRadiusMultiplier × coreRadius`), added to `d²`. A larger core radius spreads a type's repulsion over a wider, gentler plateau near the centre instead of a sharp spike. This is the per-type successor to the old single global softening; each value declares its own (`physics.coreRadius`, from 20 for an activity to 85 for a namespace) until the user tunes it.

These are tuned on the 2D charge map (see § Control Panel → PUSH), not a stack of sliders; the map plots every node type on shared charge × core-radius axes so their relative repulsion strength and reach are directly comparable.

**Spring strengths** (one stiffness + rest length per edge category — positive, attraction). Each nexus relationship is its own first-class category rather than folding into a main-ladder neighbour, and the workflow/operation dependency is split by direction:
- Containment: `NS↔Wk`, `Wk↔Wf`, `Wk↔Act`, `Wk↔Nx`, `Nx↔Op`, `Ep↔NS`, `Ep↔Op`
- Dependency: `NS↔NS`, `Wk↔Wk`, `Wf↔Wf`, `Wf→Sig` (a fire-and-forget signal send), `Wf↔Act`, `Wf→Op` (a workflow makes a nexus call), `Op→Wf` (an operation delegates to / calls a workflow), `Op↔Act`

These are tuned on the 2D spring map (see § Control Panel → PULL), not a stack of sliders; the map plots every category on shared length × stiffness axes so their relative values are directly comparable.

**Shape controls** modify the force curves:
- Master multipliers (all presented as their map's "scale all" axis sliders): `push` and `coreRadiusMultiplier` on the charge map, `pull`/`dist` on the spring map
- Exponents control falloff shape (charge exponent, link exponent)
- Core radii (one per bucket) soften the charge at close range, preventing the singularity
- Rest lengths (one per edge category) define the spring equilibrium length

**Dynamics** control the simulation's temporal behavior:
- Friction (velocity damping per tick)
- Cooling (energy decay per tick)
- Threshold (energy level below which the simulation pauses)

The full parameter set is exposed through the Control Panel (see below), organized by the equations they appear in.

### Simulation Lifecycle

1. **Initialize** — Seed nodes in the layout frame (D54): on the X axis around the centre of their bucket's rest band; on the Y axis in the band's lower part — the centre shifted toward the bottom edge by `SEED_BIAS` (0.35 of the band's height) plus a jitter that can carry a node just past the edge — so the tiers start pre-ordered and the band force lifts rather than sorts; in radial, on the bucket's ring at a random angle. A node revealed later by a filter is seeded at its nearest visible ancestor's position, snapped into its own rest bands (§ Type Transitions).
2. **Tick** — On each animation frame, compute forces, update velocities, apply velocity damping (friction), update positions.
3. **Cool** — Over time, reduce the simulation's *alpha* (energy). As alpha approaches zero, the layout stabilizes and ticking can pause.
4. **Reheat** — When the graph structure changes (nodes added/removed, a kind revealed or hidden), reset alpha to restart the simulation.

The simulation should use **requestAnimationFrame** for rendering, decoupled from the physics tick rate if needed for performance.

---

## Type Filtering

The graph uses the **kind chips** of the shared filter bar to control which nodes are visible. Any combination is valid; there is no contiguity constraint.

### Type Toggle Control

The Kind axis's chips, as the host's descriptor declares them (`chipsFor`): **Namespaces** · **Workers** · **Nexus** · **Workflows** · **Activities** — five chips over seven kinds. The **Nexus** chip is a **group** (`FilterChip.values`) that controls three kinds together:
- **NexusEndpoint** — the routing alias (container tier, parented to their namespace)
- **NexusService** — the callable API surface (host tier, hosted on a worker)
- **NexusOperation** — the per-operation callable handle (orchestrator tier, child of its service)

Toggling the Nexus chip on turns all three on simultaneously; toggling it off hides all three and any nexus call edges that touch them. This keeps the filter bar compact. The filter state knows nothing of the grouping: it is the set of selected values on the Kind axis (`nexusEndpointDef`, `nexusServiceDef`, `nexusOperationDef`, individually), so the contract and persistence are unchanged — the chip is the descriptor's.

Default state: the values the taxonomy declares default-visible — Workers and Workflows ON; everything else OFF.

Both views render the same bar from the same descriptors, so the tree view shows the same five chips.

### Which Nodes Are Visible

A node is visible if it passes every declared filter axis; search never hides (§ Search Behavior). The policy per axis is its descriptor's, read once for both views (`passesSelection`): on the Kind axis the selection is an allow-list — the node's kind must be selected, and an empty selection hides everything (`emptyMeans: 'none'`); on the File axis an empty selection means everything, and a node with no source file is never hidden by it (`emptyMeans: 'all'`, `absentMeans: 'visible'`).

### Edge Graduation

Edges adapt to the visible set by **graduating** across hidden nodes. The rules are the taxonomy's per-value hidden-node policy (`whenHidden`, D59), applied by the library:

**Dependency edges** between two visible nodes render directly. A hidden endpoint resolves per its value's policy, **each end on its own**: `ascend` (every value but the operation) re-points that end to its nearest visible ancestor — so a visible workflow's call to a hidden activity becomes an edge from the workflow to the activity's worker (its own host, as often as not), a mixed-tier edge the parser's coarsening never emits, which the default view carries; `splice` (the operation's) follows the hidden node's own dependency edges through, so caller → operation → backing draws as caller → backing, and falls back to the ancestor walk when nothing on the far side is visible. A hidden node is passed through once per resolution, so a cycle among hidden operations terminates. Self-loops from projection are discarded. An edge whose two ends are both visible is drawn as given, with its own id, and stands for every projection that lands on its pair — so at a coarse tier the parser's coarsened edge is the one drawn, not a re-derivation of it. When two graduated edges land on one pair that no original edge connects, the taxonomy's `collapse` hook says which survives; this host's keeps the one carrying routing metadata, in either edge order (D60, D66).

**Containment edges** skip hidden intermediate tiers: a visible child attaches to its nearest visible ancestor. When Worker is hidden but Namespace and the orchestrator or leaf kinds are visible, those nodes attach directly to their grandparent Namespace via a graduated containment edge; the visual effect is that they cluster around their Namespace, as if the Worker container were transparent. A hidden child's containment edge is dropped.

This means every combination of kinds produces a coherent graph — there are no "invalid" filter states. Examples, measured on the nexus fixture (the goldens' `visibleSubgraph` rows, every edge type present with its count):

| Visible kinds | Nodes | Edges |
|---------------|-------|-------|
| NS only | Namespaces | 5 nodes, 3 edges: NS→NS deps (3) |
| NS + Workers | Namespaces, Workers | 10 nodes, 11 edges: NS→NS deps (3), Wk→Wk deps (3), Wk↔NS containment (5) |
| NS + Wf + Act | Namespaces, Workflows, Activities | 22 nodes, 35 edges: NS→NS deps (4), Wf→Act deps (8), Wf→Wf deps (6), Act↔Wk containment (9), Wf↔Wk containment (8) |
| Workers + Wf (the default) | Workers, Workflows | 13 nodes, 23 edges: Wf→Wf deps (6), Wk→Wk deps (9), Wf↔Wk containment (8) |
| Wf + Act + Op | Workflows, Activities, Operations | 21 nodes, 18 edges: Op→Act deps (1), Op→Wf deps (3), Wf→Act deps (8), Wf→Op deps (6) |
| All | Everything | 37 nodes, 60 edges: NS→NS deps (3), Op→Act deps (1), Op→Wf deps (3), Wf→Act deps (8), Wf→Op deps (6), Wk→Wk deps (3), Act↔Wk containment (9), Ep↔NS containment (3), Ep↔Op containment (4), Nx↔Wk containment (3), Op↔Nx containment (4), Wf↔Wk containment (8), Wk↔NS containment (5) |

---

## Type Transitions (Animated)

Toggling a kind on or off should feel spatial and continuous, not like a hard cut. The design below is intent: today a reveal seeds, reheats and settles (§ Revealing a Type, step 1, and the reheat policy); the fades and ramps of steps 2–4 and of § Hiding are not built — [#186](https://github.com/jmbarzee/temporal-architect/issues/186).

### The Spatial Metaphor

Type transitions are **opening and closing containers**. When you enable Worker while Namespace is visible, each namespace visually "opens" — workers emerge from the namespace node and spread into their spatial arrangement while the namespace recedes to a background anchor. When you disable Worker, workers converge back into their namespace and disappear. The same applies one tier deeper: enabling the orchestrator and leaf kinds opens workers to reveal their registered definitions.

When a middle tier is hidden (e.g., enabling workflows while Worker is off), the container metaphor skips it — the revealed nodes emerge from their grandparent Namespace via graduated containment.

This metaphor constrains the animation design:
- Children must emerge *from* their nearest visible ancestor, not appear at arbitrary positions — the spatial origin preserves the containment relationship.
- The ancestor node remains visible as a spatial anchor during and after the transition — it provides the "container" context.
- The transition preserves the user's viewport focus — if they were looking at Namespace A, new nodes from Namespace A should appear near where they're looking, not at the edge of the canvas.

The user's mental model is: "I zoomed into this thing and saw what's inside." The mechanics below implement this metaphor.

### Revealing a Type (e.g., enabling Worker while Namespace is visible)

1. **Seed positions** — Place incoming nodes at their nearest visible ancestor's position (parent if visible, grandparent if the parent is hidden), **snapped into the node's own rest bands** — a child in a lower tier band starts at that band's edge below its container, not on top of it; in radial, on its own ring at the ancestor's angle (D54). This keeps the spatial context intact. Whether an axis seeds and refits this way is its descriptor's reheat policy (`reheat`): the Kind axis does; the File axis reheats in place and keeps the user's pan and zoom.
2. **Set initial forces** —
   - Containment link strength: **maximum** (children cling to ancestor).
   - Peer dependency link strength: **zero** (children ignore peer edges initially).
   - Child charge strength: **zero** (children don't repel yet).
3. **Animate in** — Over a transition duration (~400–600 ms, eased):
   - Fade child nodes and edges from fully transparent to fully opaque.
   - Ramp child charge strength up to its target value (children begin to spread out).
   - Ramp peer link strength up to its target value (dependency edges start pulling).
   - Ramp containment link strength down toward its resting target (ancestor grip loosens).
4. **Result** — Children fan out from their ancestor, finding their own equilibrium, with dependency edges guiding the final arrangement.

### Hiding a Type (e.g., disabling Worker)

Reverse the process: fade out, collapse charge and link strengths, then remove nodes when they've converged back to their nearest visible ancestor position. If hiding a middle tier while both parent and child types remain visible, the graduated containment edges animate in as the hidden nodes fade out — the graph smoothly transitions from a three-tier to a two-tier layout.

### Force Strength Interpolation

All strength transitions should be **interpolated over time** (not snapped). Use an easing curve (e.g., ease-in-out cubic) so the simulation smoothly adjusts. The sliders in the control panel should visibly animate in sync with the force changes, providing a direct visual mapping between the controls and the layout behavior.

---

## Visual Encoding

### Node Appearance

Every node is drawn as a disc of its value's declared radius (`size.r`, the taxonomy's), with its icon inside and its name beside it — the redundant encoding is colour, icon and size together:

| Value | Radius | Icon size |
|---|---:|---:|
| Namespace, Worker, Nexus Service | 20 | 18 |
| Nexus Endpoint | 15 | 14 |
| Workflow, Nexus Operation | 11 | 12 |
| Activity | 8 | 10 |

The small discs — workflow and operation at 11, activity at 8 — are told apart by colour and icon (matching the tree view's colour system: purple for workflows, blue for activities, pink for nexus services). Fill and border are the value's declared colour in the pane's resolved theme (§ Color); the canvas is theme-aware, so a dark pane draws the dark palette.

Each node displays **only its name** as a label — all other detail (composition counts, file, connection degree, duplicate copies) lives in the hover box, not under the node. Labels use a dedicated `--color-graph-label` colour (softened — slate-700 in light themes, slate-300 in dark — rather than maximum contrast, so names aren't the only bright text on the canvas) at a semibold weight and slight translucency (so edges stay visible through them). Names up to 15 characters are shown in full; longer names are truncated to 12 characters plus an ellipsis. Overlap is handled by collision-based elision — see § Visual Density.

**Zoom-responsive sizing.** Node bodies, icons, and labels are drawn in screen pixels but scale with zoom: on-screen size is `baseR × size × clamp(zoom, floor, cap)`. They shrink when zoomed out — so a zoomed-out graph reads as a clean constellation rather than a chaotic pile of full-size dots and overlapping labels — and are capped when zoomed in so they never dominate the canvas. The three knobs (`size`, `grow cap`, `shrink floor`) are **user-tunable** from the Controls panel (Misc → Node scaling, see § Control Panel) — e.g. lowering the grow cap makes nodes start shrinking at a lower zoom.

**Parameterized-family nodes (cardinality badge).** A `namespace` or `nexusEndpoint` node whose wire carries a non-empty `templateParams: string[]` — a parameterized family such as `fabric-shard-{org}` — renders as a **single collapsed representative node**: the same shape, size, and colour as its static counterpart (rounded rectangle / large for a namespace; the endpoint container treatment for a `nexusEndpoint`), adorned with a **cardinality badge**. The badge is derived **only** from `templateParams`: one `× {param}` chip per entry — `× org` for `["org"]`; `× org` and `× region` for `["org","region"]` — so the chip count equals the array length and each chip label is the bare param name. A family with two holes shows two chips. The badge is a node **adornment**, sitting alongside the orphan ring (see [PRODUCT.md](./PRODUCT.md) § Node badges, and § Orphan Definitions here), **not** the node's name label: the label continues to show the full name string with holes included, subject to the same 15/12-character elision (§ Node Appearance). The hover tooltip's context line for these node types (§ Interaction States → Context line format) is unchanged in structure — the parameterized nature is already legible from the badge and the templated name.

*Static fallback.* When `templateParams` is absent (the field is omitted when empty), a `namespace`/`nexusEndpoint` node gets **no badge and no collapse treatment** — byte-identical wire, identical rendering to today. The feature is purely additive.

*Deferred — ghost-node depth.* Per-instance ghost-node / expansion depth — showing a family's individual members (`fabric-shard-acme`, `fabric-shard-globex`, …) as their own nodes — is out of scope this cycle; a family renders as the collapsed representative + badge only. Deferred to [#129](https://github.com/jmbarzee/temporal-architect/issues/129).

### Edge Appearance

| Edge Type                        | Line Style   | Direction Indicator |
|----------------------------------|--------------|---------------------|
| Dependency between peers (→)     | Solid        | Arrowhead           |
| Nexus dependency (→ via nexus)   | Solid, distinct color | Arrowhead    |
| Containment (child ↔ container)  | Dashed       | None (undirected)   |

Every edge is stroked by its **resolved edge type** — the same classification that picks its spring — through the stroke the taxonomy declares for that type (`EdgeTypeDefinition.style`: colour per theme, alpha, dash, width). There is one classifier (D57): a spliced caller-to-backing edge, whose operation is filtered out, draws as the workflow dependency its type says it is.

**Arrowheads are visible at rest.** Direction encoding is essential for answering "what depends on what?" (Q7) without hovering. Arrowheads point from the dependent node toward the dependency (A → B means "A depends on B"). They are drawn at a fixed screen size (8 px), so they stay legible at any zoom without dominating close up. Containment edges have no arrowhead (the relationship is symmetric membership).

Edge opacity and thickness can be secondary signals — thicker or more opaque for higher-traffic connections if multiplicity data is available in the future.

Nexus edges carry metadata (endpoint, service, operation) shown on hover. Hovering a nexus edge can highlight all edges sharing the same nexus scope (endpoint, service, or operation) to reveal shared routing. What a hidden node does to the dependency edges touching it is the taxonomy's per-value policy (`whenHidden`, D59): `ascend` re-points the edge to the nearest visible ancestor; `splice` — the operation's — follows the hidden node's own dependency edges through, so caller → operation → backing draws as caller → backing; when two graduated edges land on one pair this host's `collapse` keeps the one carrying metadata, in either order, and an original edge between the two visible nodes stands for both (D60, D66).

### Color

See [PRODUCT.md](./PRODUCT.md) § Visual Identity for the shared color palette. **The colour scheme is the taxonomy's** (D57): every style value declares its fill and border in both themes (`color.light`, `color.dark`) beside its size, and every edge type declares its stroke per theme — one injected object carries palette and sizes, so a host swapping schemes swaps both (R10, R11, R15). The canvas draws in the pane's **resolved theme**: the user's choice from the **colour-scheme button** (bottom-centre: Auto / Light / Dark, persisted with the pane's other state, R21), or for Auto the host's — an ancestor's `.vscode-dark` or `data-theme`, else the OS preference — observed for change. An explicit choice sets `data-theme` on the pane, so the pane can be dark in a light host and light in a dark one. The pane carries `--node-<suffix>` and `--node-<suffix>-border` for every style value inline, in that theme (its own namespace — the chrome's tokens are `--color-*`, and a value id may be anything a host names; two ids that kebab-case to one name, or to none, are refused at construction); tokens, typed rows and filter-chip tints read them (a chip borrows a style value's colour as it borrows its icon, `FilterChip.tint`, and mixes its hover and active backgrounds from it at a per-theme percentage). Group-glow colours are the library's own cycling palette, not per value. Edges do not inherit their source node's colour; their stroke is their type's.

### Node Summaries

Structural summaries communicate a node's role at a glance, but to keep the canvas uncluttered they live in the **hover box**, not as a second label under the node. See [PRODUCT.md](./PRODUCT.md) § Glanceable summaries for the design principle.

| Value (`summaryKind`) | Summary | Example | Where shown |
|---|---|---|---|
| Namespace, Worker, Nexus Service (`children`) | Contained children, counted per style value in the taxonomy's order and named by its abbreviation | `1 Ep · 5 Wk`, `3 Wf · 1 Act`, `2 Op` | Hover box (composition line) |
| Workflow, Activity, Nexus Operation (`degree`) | Dependency degree (in/out) | `→3 ←2` | Hover box (connections row) |
| Nexus Endpoint (`none`) | — | — | — |

**Presentation:**
- Composition counts (`children`) appear as a dedicated line in the hover tooltip, the values counted in the taxonomy's order and named by its abbreviations; dependency degree (`degree`) is already represented by the tooltip's connections row, so it is not duplicated. The dispatch is the taxonomy's (D58).
- Counts reflect only the currently visible children/edges — with no orchestrator or leaf kind visible, a Worker shows no registration count — consistent with filter-as-source-of-truth.

---

## Viewport Controls

The graph lives on an infinite 2D canvas. Standard viewport interactions:

| Interaction       | Action                      |
|-------------------|-----------------------------|
| **Scroll / pinch** | Geometric zoom in/out (range ~0.1×–40×; the high ceiling lets dense clusters spread far enough apart to reveal every node's label) |
| **Click-drag on background** | Pan the viewport  |
| **Click-drag on a node**     | Drag the node; pin its position while dragging, release to unpin |
| **Double-click a node**      | Center and zoom to fit the node and its immediate neighbors (graph-native; not used for cross-view navigation) |

Dragging a node should **reheat** the simulation locally so nearby nodes can adjust.

### Fit-to-View

A button (or automatic behavior on level change) that adjusts the viewport to frame all currently visible nodes with padding.

---

## Overlay Layout

The Graph view renders the **shared filter bar** (which includes the error/warning bars at its bottom — see VIEW_FRAMEWORK.md § Error Handling) as a **floating overlay layer** at the top of the canvas. The graph canvas itself fills the full viewport behind it. The graph's own state and quick controls do not sit in this overlay; they float in the **bottom corners** (§ Bottom Controls), keeping the top overlay to just the filter bar.

```
┌──────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────────┐ │
│ │ file chips  [pin] │ type chips  [pin] │ [search]      │ │  ← overlay
│ │ ▶ 2 errors (collapsed)   ▶ 1 warning (collapsed)      │ │     (translucent,
│ └──────────────────────────────────────────────────────┘ │      with backdrop)
│              ▲                                           │
│        ┌─────┴─────┐                                     │  ← canvas
│        │ Worker A  │  ←──┐                               │     (fills full
│        └─────┬─────┘     │                               │      viewport)
│              ▼           │                               │
│        ┌───────────┐   ┌─┴─────────┐                     │
│        │ Workflow  │──▶│ Activity  │                     │
│        └───────────┘   └───────────┘                     │
│ 12 nodes, 8 edges    [Fit][Play] 60fps          [Controls]│  ← bottom row
└──────────────────────────────────────────────────────────┘
```

### Why an Overlay

Two reasons:

1. **More canvas real estate.** The graph is a spatial workspace; every pixel of vertical space matters. Stacking three bars eats ~120px of viewport height for what is essentially configuration UI.
2. **Bleed-under is an affordance.** When the user zooms in, graph content extends visibly under the edges of the overlay. This serves as a passive cue that there's more content out there — invite to pan or zoom out. It also matches the convention of spatial editors (Figma, Sketch, design tools) where toolbars float over an infinite canvas.

### Visual Treatment

- The overlay has a semi-transparent backdrop (matched to the surface color of the rest of the visualizer, with backdrop blur where available) so canvas content underneath remains visible but the controls stay legible.
- The error/warning bars are collapsed by default, so the overlay is normally just the filter chips. When a bar is expanded, its body scrolls internally (it never grows unbounded), and the overlay is capped so it can't cover the whole canvas.
- Interaction over the overlay does not pan or zoom the canvas — mouse events on overlay controls are consumed by the controls.
- The overlay does not occlude the bottom of the viewport. The Control Panel (§ Control Panel) anchors to its existing position (bottom-right), and the bottom controls (§ Bottom Controls) sit alongside it.

### Bottom Controls

The graph's own state and quick controls float at the bottom of the canvas, out of the way of the top filter overlay:

- **Node / edge count** (bottom-left) — `N nodes, M edges` (counts the currently visible/graduated set). Informational; updates reactively with filters. Shifts right when the keyboard-shortcuts panel (bottom-left) is open so the two don't overlap.
- **Fit / Scheme / Play-Pause / fps** (bottom-center) — a single centred cluster: **Fit** frames the viewport to all visible nodes (`F`); the **colour-scheme button** cycles Auto → Light → Dark (R21, § Color); **Play / Pause** toggles simulation ticking (`Space`); and the live `fps` reads out while the simulation runs.

(There is no manual Reheat button; reheating is automatic.) **Show in Tree** is no longer a toolbar control — it lives in the node hover tooltip (§ Interaction States: Hover).

---

## Control Panel

A collapsible overlay containing force parameters, simulation controls, and a force field visualization toggle. It serves two purposes: **tuning** (let users shape the layout) and **transparency** (make the physics legible by organizing controls around the equations that govern them).

### Organization

The panel is collapsed by default (progressive disclosure); the collapsed toggle reads **Controls** (the panel covers more than forces). When expanded, controls are split across three **tabs** — PUSH/PULL, GRAVITY, MISC — with exactly one section shown at a time. The first two are force tabs; MISC groups the non-force controls (simulation dynamics + render-time node scaling). The tab strip sits at the top of the panel body; the section area is sized to the tallest tab so switching tabs never resizes the panel. Each force section displays the physics equation it governs as a monospace header, then the controls for every parameter that appears in that equation. Sections carry no decorative per-force colour; node-type colour is reserved for the per-type/per-edge controls where it carries meaning.

**PUSH/PULL**

The two pair forces share one tab. At its top, above the sub-tabs so it stays visible whichever force is being edited, an **axis** dropdown names the dimension both forces key on: push charges are per bucket of that axis, pull springs per pair of buckets — the tokens shown being those the visible set holds (R35, below), while the dropdown's counts measure the whole graph. The default is the type axis (`temporalType`), where the host's hand-tuned spring table applies; any filter axis the graph carries (files, kinds) is offered too, bucketed by the values present. Below it, **Push** and **Pull** are sub-tabs styled like Gravity's Band/Topological — accent-underlined, bodies stacked in one cell so switching never resizes the panel — but without the on/off switches, since neither force has an off. Each body is its equation, its 2D map, and its force-curve read-out.

**What a control offers is what the visible set holds** (R35, D59): a push token per bucket some *visible* node falls in, a pull token per spring category some edge the simulation springs falls in — an original edge with both ends visible, since a graduated edge is drawn but never sprung — and on each layout axis a column per bucket some visible node falls in — toggling a chip off removes its tokens and columns, and a bucket's tuning is kept, unshown, for when it returns. The axis dropdowns alone measure the whole graph: an axis's usability does not flip with a filter.

**The token ceiling.** An axis is offered only while its control surface stays usable: at most **24** push tokens (one per bucket) and 24 pull tokens (one per spring category some edge of the graph falls in). The dropdown shows each axis's cost beside its name — `File (3 · 8)` — and lists one that exceeds the ceiling disabled, with the count that disqualified it. Switching axes starts both forces from the declared (or typical) physics on the new buckets — a tuning keyed by one axis has no reading on another. When the graph changes, an axis bucketed by the values present is rebuilt for the new values with the tuning kept where its values survive; if the graph grows past the ceiling on the chosen axis, or the axis vanishes, the forces fall back to the type axis.

**PUSH** (all node pairs)

    F = charge / (d² + r²)^exp

The equation is simplified for glanceability: `r` is the (effective) core radius and the global `push` multiplier is folded into the y "scale all" slider rather than shown as a separate term — so the per-type charge control reads as an extension of the global control on the same axis. The exponent acts on the squared distance `(d² + r²)` directly (no `/2`), so `exp = 1` is inverse-square; the default `0.7` is a gentler, longer-range falloff. Its slider is deliberately narrow (`[0.5, 1.0]`) because that band holds the layout's useful range.

Each bucket of the chosen axis has two values — a repulsion **charge** (negative) and a **core radius** (`r`, the charge softening as a length). On the default axis a bucket is a node type and starts from its declared physics; on any other axis it starts from the host's *typical* declared physics (the mean over every type). Rather than a stack of paired sliders, they are tuned on a **2D charge map**, mirroring the Pull sub-tab's spring map:

- **Axes:** y = charge magnitude `[0, 1000]` (charge is stored negative but plotted as magnitude), x = core radius `[0, 100]`, labelled but unnumbered. One **token** per bucket of the chosen axis — per node type on the default axis — positioned at its `(core radius, charge)`. Ordering is emergent from value.
- **Token encoding:** a solid dot (no split, since a charge belongs to a single bucket) coloured by the node type on the default axis and in one neutral tone on any other, until a palette for arbitrary axes exists; a solid outline.
- **Direct manipulation:** dragging a token sets that bucket's charge and core radius together; the drag routes through the shared live-reheat so the layout responds immediately. Tokens that coincide — every bucket on a freshly chosen axis starts from one default — are drawn fanned out on a small ring around the shared point; only the drawn position moves, a drag still writes the token's own value.
- **Globals along the axes:** the two global multipliers sit on the axes they scale — a vertical `push` ("scale all charge") slider up the y-axis, a horizontal `coreRadiusMultiplier` ("scale all core radius") slider along the x-axis.

Below the map, a read-only **charge-falloff visualization** (a boxed plot with `force` and `distance` axis labels) plots each type's repulsion falloff `charge / (d² + r²)^exp` against distance — all-positive, with the baseline at the bottom of the frame and the core radius marked on the distance axis. All curves are drawn faint; hovering a token on the map brightens its curve and dims the rest (and vice versa). The one global shape parameter, `exp` (charge exponent), is controlled by a slider beneath the plot.

The charge field rings (see § Force Field Visualization) are hover-driven, not a persistent toggle: they appear while the Push body is hovered, narrowing to a single bucket while its token is hovered.

**PULL**

    F = α × stiffness × Δ^exp / d
    Δ = d − length

`Δ^exp` is a signed power (the sign of `Δ` is preserved) — the explicit `sign(Δ)·|Δ|^exp` is collapsed to one term for glanceability. The equation is shown with a single per-edge value each (`stiffness`, `length`) rather than splitting them into a global multiplier and a per-edge factor. The globals still exist (see below) but are presented as "scale all" knobs, not as separate equation terms — so the per-edge control reads as an extension of the global control on the same axis.

Each edge category has two values: a spring **stiffness** (`k`) and a rest **length** (`rest`). Rather than a stack of paired sliders, they are tuned on a **2D spring map**:

- **Axes:** x = length, y = stiffness, labelled but unnumbered (no per-tick values or origin marker — the axis labels and gridline box are enough to orient). One **token** per spring category some edge of the current graph falls in, positioned at its `(length, stiffness)`; a declared category no edge uses is not shown. Ordering is emergent from value — there is no hand-curated row order. A small padding keeps tokens at the extremes inside the box.
- **Token encoding:** a split dot, left half coloured by the source bucket and right half by the target bucket (the node types' colours on the default axis; one neutral tone on any other, until a palette for arbitrary axes exists); a dashed outline for containment edges and a solid outline for dependency edges (mirroring the canvas edge styling).
- **Direct manipulation:** dragging a token sets that category's stiffness and length together; the drag routes through the shared live-reheat so the layout responds immediately.
- **Globals along the axes:** the two global multipliers sit on the axes they scale — a vertical `stiffness` "scale all" slider up the y-axis, a horizontal `length` "scale all" slider along the x-axis.

Below the map, a read-only **force-curve visualization** (a boxed plot with `force` and `distance` axis labels) plots each spring's displacement response (`stiffness · Δ^exp`) around its rest length — the zero crossing (the length) sits low so the readable tension side gets most of the height; the slope is the stiffness, and the curvature is `exp`. All curves are drawn faint; hovering a token on the map brightens its curve and dims the rest (and vice versa). The one global shape parameter, `exp`, is controlled by a slider beneath the plot, where its effect on curve shape is visible.

On the type axis the categories are the host's declared table: containment `NS↔Wk`, `Wk↔Wf`, `Wk↔Act`, `Wk↔Nx`, `Nx↔Op`, `Ep↔NS`, `Ep↔Op`; dependency `NS↔NS`, `Wk↔Wk`, `Wf↔Wf`, `Wf→Sig`, `Wf↔Act`, `Wf→Op`, `Op→Wf`, `Op↔Act`. On any other axis they are the pair rule's: one category per unordered bucket pair per relation, each starting from one default spring. The nexus edges (`Ep↔NS`, `Ep↔Op`, `Wf→Op`, `Op→Wf`, `Op↔Act`) are first-class spring categories rather than folding into their main-ladder neighbours, so each nexus relationship is tunable on its own. The workflow/operation dependency is **directional** — `Wf→Op` (a workflow makes a nexus call) and `Op→Wf` (an operation delegates to a backing workflow, or a sync-op body calls one) are separate springs because they serve different purposes. (An endpoint fronts an operation, so `Ep↔Op` is its own containment spring distinct from the service's `Nx↔Op`. Operation→operation calls are not modelled as a distinct relationship — they fold into `Wf→Op`. `Wf→Sig` is workflow→workflow like `Wf↔Wf`, so the endpoint node types cannot separate them — the parser's edge kind does. It is deliberately weaker and longer: a signal send couples two workflows without binding them, since the sender never waits on the receiver's handler.)

When a token is being tuned, the canvas highlights only that edge category — drawn as a coloured border (a tension-coloured casing with the edge's own colour on top) so the edge's identity colour stays clear, rather than recolouring every edge.

**GRAVITY**

Three **sub-tabs** — **X Axis**, **Y Axis**, **Topological** — styled like the main force tabs (underline tabs) but marked as a sub-level by an accent-coloured underline. The Y Axis sub-tab carries the **Radial** switch (R27: how radial mode is entered — Y's buckets become rings, X is ignored and its body says so); the Topological sub-tab carries its on/off switch. Switches are independent of selection — toggling does not change which body is shown — so the state stays legible while you tune another body. All bodies are stacked in one grid cell (only the active one visible), so switching sub-tabs never resizes the panel. Center gravity is the unexplained baseline (active when both axes' strengths are zero and Topological is off) and has no control.

- **X Axis / Y Axis** — the same surface for both (R26): equation `F = strength × dᵉˣᵖ` (`d` = distance outside the rest band; zero inside); an **axis** dropdown naming the dimension the axis keys on (R28 — a mapping whose bucket count fits the 24-token ceiling, or a **computed scalar**: one number per node in [0, 1] from node metadata and graph structure; the built-ins are **reach**, **degree** and **depth**, and a host may declare more); an **axis plot** with one column per bucket (R30), the bucket's rest band drawn as a stripe with two draggable handles over it, the bucket's abbreviation above and its full name on hover (hovering a column highlights it and dims the rest, and drives the canvas stripe/ring highlight on that axis); the axis's own **strength** slider in the left gutter (R32 — only the shown axis's); and beneath the plot the read-only **force-response curve** for that axis (R33 — distance → force, normalized to the stronger axis so the two tabs' curves are comparable) with the **exp** slider beneath it (the band falloff exponent, shared by both axes: `1` linear/Hooke, higher = softer just outside the band and stiffer far out). Switching an axis's mapping starts its bands from the taxonomy's declared bands on the new buckets; on a non-type axis every bucket starts from the host's typical declared band and draws in one neutral tone until a palette for arbitrary axes exists. On a scalar axis the equation reads `d = |p − p₀ − s·(p₁ − p₀)|` (R29: the node's distance from the point its score `s` maps to between where 0 rests, `p₀`, and where 1 rests, `p₁`), and the column plot gives way to a **gradient** from the 0 end to the 1 end (R31) whose two ends are the handles — dragging them past each other flips the axis. A new scalar axis starts on the declared bands' extent, read like a chart: 1 at the top, 1 at the right — and the plots read the same way, the X plot as a rotated chart with a larger x higher, so 1 sits at the top of either plot. The span is stored only once the user drags an end; until then it follows the taxonomy. The PUSH/PULL axis stays mappings-only — push and pull need buckets.
- **Topological** — equation `F = strength × depthᵉˣᵖ × d` (`d` = distance to the focal point). A read-only **depth→pull curve** with labelled axes (x = depth, y = pull), then two sliders **beneath** the curve: **strength**, and **exp** (the contrast exponent that shapes `depth^exp` — `1` is linear, higher sharpens the tiering; named `exp` to match the Push/Pull exponent sliders). Focal point is the top in Cartesian, the centre in Radial; leaves (depth 0) stay put.

The active body's tools stay shown but dim when its force does nothing: an axis at zero strength, the X axis in radial, Topological with its switch off. No numbers on the controls (consistent with Push/Pull). The axis strength sliders are capped tight (the defaults sit mid-range); the Topological strength range is extended for headroom.

**MISC**

The MISC tab holds two labelled sub-sections — *Dynamics* and *Node scaling* — separated by a hairline divider. Neither is a force; they are grouped here to keep the three force tabs purely about the layout physics.

*Dynamics* — how the simulation cools and damps over time:

    v ×= friction
    α −= cooling, stop at threshold

- `friction` — velocity damping per tick (higher = more friction)
- `cooling` — energy lost per tick (higher = settles faster)
- `threshold` — energy level below which simulation pauses

*Node scaling* — render-time control of how big nodes (and their labels) are drawn. On-screen size is `baseR × size × clamp(zoom, floor, cap)`:

    size = base × clamp(zoom, floor, cap)

- `size` — overall node + label size multiplier (1 = registry default)
- `grow cap` — the zoom level past which nodes stop growing; **lower it to make nodes start shrinking sooner as you zoom out** (the fix for "nodes are too big when zoomed out")
- `shrink floor` — the smallest nodes may get when zoomed all the way out

Node scaling is a pure-render concern: editing it redraws the canvas but does **not** reheat the simulation (unlike force controls, which auto-reheat). Defaults are `size 0.6`, `grow cap 1.65`, `shrink floor 0.4`.

The equation-oriented grouping means each section is self-contained: the formula shows what the parameters do, the controls let you change them. A user who understands the equation can predict a control's effect; a user who doesn't can still experiment and see results.

### Simulation Controls

Simulation controls live in the bottom-centre cluster (see § Bottom Controls), not the control panel: **Play / Pause** toggles ticking. There is no manual Reheat control and no Reset button — reheating happens automatically on structural and parameter changes (§ Design Decisions). The control panel itself holds only the force-shaping controls.

### Design Decisions

**Parameter changes auto-reheat.** Tuning is a live feedback loop: changing any force parameter nudges the simulation warm so its effect is immediately visible, with no separate "press Play" step. A single shared mechanism re-energises the layout on every control edit, so every present and future control (sliders, the spring-map tokens, dual-range bands) inherits the behaviour. Freezing a layout is a separate, explicit action (Pause, or letting the simulation cool once edits stop).

**Controls are live.** Editing any control immediately affects the running simulation. Each control shows its current value.

**Equation as a card.** Each section's governing equation renders in an unassuming bordered/tinted card above the controls, so it reads as a distinct band rather than floating text.

**Formula-hover pops the matching control.** Hovering a value token in an equation (e.g. `stiffness`, `length`, `exp`, `charge`, `strength`) emphasizes the corresponding **global** slider (the axis "scale all", `exp`, or `strength` knobs — not the per-token plot positions) with an accent halo, so the link between a symbol and its knob is discoverable at a glance. (Replaces the old `?` help popover, which has been removed.)

**Adaptive curve gridlines.** The force-response curves (the Graph) draw light value-anchored vertical gridlines at a "nice" step. Because the curves' x-domain grows/shrinks as parameters change, the gridlines visibly re-space (the step jumps to keep ~6 divisions), signalling that the scale changed.

Named presets (e.g. "Tight clusters", "Spread out") that animate sliders to known-good values are deferred — [#51](https://github.com/jmbarzee/temporal-architect/issues/51).

---

## Force Field Visualization

Hovering a force-control section (or an individual token) in the control panel reveals a visual overlay on the canvas that makes the invisible forces visible. This embodies the *Make the Invisible Visible* design principle. The overlays are **hover-driven** — there is no persistent toggle; they fade as soon as the pointer leaves the control.

### What's Drawn

While a section is hovered, the canvas renders the matching overlay layer (drawn before nodes, after edges):

**Charge field rings** — Concentric circle outlines around each node showing where the charge force drops below a fixed set of *absolute* thresholds. Ring radius is derived from the equation `force(d) = pushMul × |q| / (d² + r²)^exp`, solved for `d` at each threshold, where `r` is the node type's effective core radius (`coreRadiusMultiplier × coreRadius`); rings whose threshold is unreachable for a node's charge (i.e. the threshold exceeds the node's peak force) are simply not drawn. Stronger charges therefore produce visibly larger rings — and a node type with too small a charge to reach the inner threshold renders only its outer rings, which is itself a useful signal that the type is under-charged. Only the ring **outlines** are drawn (no filled disc), so overlapping fields don't stack into a solid colour that washes out the canvas. Ring colour matches the node's type colour at low opacity.

**Spring tension coloring** — Edges colored by their current tension state, drawn from the app palette so the highlight reads as part of the visualizer: teal (`--color-timer`) near rest length, amber (`--color-warning`) when stretched, blue (`--color-activity`) when compressed. When a specific spring is being tuned on the map (a token hovered or dragged), only that edge category is highlighted, drawn as a coloured **border** that preserves the edge's own identity colour rather than recolouring it; otherwise (hovering the PULL section as a whole) all edges are coloured by tension.

**Gravity band overlay** — Shown while the Gravity section is hovered and an axis has strength. The overlay is the frame's, over the **whole** graph (D54): a stripe or ring for every bucket some node of the graph falls in — the set the force re-centres on — while the panel's columns are the visible set's (R35); buckets sharing a band draw one stripe. In **cartesian**, a horizontal stripe in each Y bucket's colour marks its rest band and a vertical stripe each X bucket's, both median-centred to match the force. In **radial**, a concentric ring in each Y bucket's colour marks its target radius about the origin. Hovering a column in an axis plot highlights that bucket's stripe or ring on that axis and dims the rest.

### When It's On

The overlays are **hover-driven**: they appear only while the corresponding control section (or token) is hovered and fade as soon as the pointer leaves. This keeps the default reading experience uncluttered — the overlays add visual density and are a tuning aid, surfaced exactly when the user is touching the control they explain — while updating live each frame for as long as the hover persists.

---

## Control-Canvas Feedback Loop

The control panel and canvas are linked: hovering a control section activates the corresponding force visualization on the canvas. This creates a direct mapping between the abstract parameter the user is adjusting and its physical effect on the layout, and it is the *only* way the overlays are shown — there is no persistent toggle.

### Section Hover

| Hovered Section | Canvas Response |
|-----------------|-----------------|
| **PUSH** | Charge field rings appear around all visible nodes |
| **PULL** | Edges show tension colouring (teal/amber/blue). Hovering or dragging a spring-map token narrows this to just that edge category, drawn as a border. |
| **GRAVITY** | Band rest regions appear — a stripe per band some node of the *whole* graph falls in on each acting axis (the overlay is the frame's, over the whole graph, D54; the panel's columns are the visible set's, R35) (cartesian) or concentric rings (radial); a scalar axis shows as one gradient stripe from its 0 end to its 1 end, and in radial a scalar Y draws no rings (every node has its own). Hovering an axis-plot column narrows the highlight to that bucket on that axis. |
| **MISC** | No canvas force-field response — Dynamics is temporal, not spatial, and Node scaling redraws node sizes directly rather than previewing a force field |

When the user stops hovering, the visualization fades.

### Per-Type Charge Highlighting

Within the Push body, hovering an individual charge-map token (one per bucket of the chosen axis that some visible node falls in) highlights only that bucket's field rings and dims the others, and brightens that bucket's curve in the falloff plot. This lets the user see the reach and strength of one type's charge force in isolation — useful for understanding why nodes of different types settle at different distances.

### Per-Bucket Band Highlighting

Within the GRAVITY section, hovering a bucket's column in an axis plot highlights only that bucket's stripe (cartesian, on that axis) or ring (radial) on the canvas at full opacity and dims the rest; a bucket that is drawn nowhere — no visible node falls in it — dims nothing. This makes it easy to see exactly where one bucket's rest band sits relative to the others while you're dragging its handles.

### Principle

This feedback loop embodies two design principles:
- **Make the Invisible Visible** — forces are abstract numbers; the canvas shows their spatial consequence
- **Tight Feedback Loops** — the user touches a control and immediately sees what it governs, before changing its value

---

## Errors Header

The graph view surfaces parse errors and warnings using the shared error handling pattern — the two severity bars (red errors, yellow warnings, collapsed by default) at the bottom of the shared filter bar. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Error Handling. The bars render within the floating overlay (see § Overlay Layout), beneath the filter chips, each with its own scrollable body. The canvas still renders whatever valid nodes and edges exist in the partial AST.

---

## Search and Filtering

The graph view uses the unified filter bar shared with the tree view (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Unified Filter Bar). Each declared filter axis (File, Kind) is per-view and reconciled on every view switch; the search query is globally shared.

The graph adds one graph-specific behavior: **edge graduation** (see § Type Filtering above). When a type is toggled off, edges graduate across hidden layers rather than simply disappearing. This means the graph always shows a coherent structure regardless of which types are visible.

### Search Behavior

Search is **non-destructive**: it never removes nodes from the visible set. Instead, when a query is active:

- **Matching nodes** (visible AND name contains the query) render at full opacity.
- **Non-matching visible nodes** dim to 20% opacity. Their edges dim correspondingly.

No ring, halo, or other decorative highlight is used to mark matches — full-vs-dim opacity is the entire visual treatment. (Ring decoration is reserved for other uses.)

### Search and Hidden Matches

Search matches against **all** nodes, including those excluded by structural filters. The results split:

- **Visible matches** — nodes that match the search AND pass the current type and file filters. Rendered at full opacity in the graph.
- **Hidden matches** — nodes that match the search but are excluded by structural filters (a kind whose chip is off, a file not selected). Not rendered in the graph.

Hidden match counts appear as **badge overlays** on the filter controls that are hiding them:
- If 3 matching workflows are hidden because the Workflows chip is off, that chip shows a badge: "3".
- If 2 matching nodes are hidden because their source file is filtered out, the corresponding file chip shows a badge: "2".

In the graph a hidden match is counted on the first declared axis it fails — its kind's chip if the kind is off, else its file's — and the search control also carries the total (`+N`). This lets the user discover that matches exist, understand *why* they're hidden, and decide whether to adjust filters to reveal them. Search informs but never overrides filters.

### Selecting a Search Result

Clicking a visible search match centers the viewport on it and selects it (triggering the dependency highlight from the Interaction States spec).

---

## Interaction States

### Hover: Dependency Highlighting

Hovering a node highlights its **transitive dependency chain**, not just immediate neighbors. The direction of traversal is controlled by a modifier key:

**Default hover (downstream):** Highlight the hovered node and all nodes it **transitively depends on** — follow outgoing dependency edges through the full call chain. This answers: "what does this node need?"

**Modifier+hover (upstream):** Hold a modifier key (e.g., Shift) while hovering to reverse direction. Highlight the hovered node and all nodes that **transitively depend on it** — follow incoming dependency edges through the full caller chain. This answers: "what breaks if I change this?" (blast radius).

In both modes:
- The hovered node and all highlighted nodes are shown at full opacity.
- All edges along the traversal path are highlighted (arrowheads reinforced at full opacity).
- All other nodes and edges dim (opacity 20%; 50% while the group glow is on).
- Show a **hover info tooltip** anchored near the hovered node containing:
  1. Node name with its value's icon, the context line (the host's hook — format varies by type, see below), and the source file.
  2. **Composition counts** (values whose `summaryKind` is `children` — namespace, worker, nexus service): the contained values counted in the taxonomy's order and abbreviated (e.g. `1 Ep · 5 Wk`, `3 Wf · 1 Act`, `2 Op`). This is the structural summary that used to render as an under-node badge (§ Node Summaries). A parameterized family carries its cardinality line here too (§ Node Appearance).
  3. **Duplicate-copies line** (only when the definition has more than one visible copy): `copy N of M`, where M is the number of sister copies currently visible. Makes the per-worker duplication explicit and tells the user the cross-canvas highlight on the other copies is intentional.
  4. Immediate connection counts: N outgoing ("depends on"), M incoming ("depended on by").
  5. Direction indicator: "dependencies" (default hover) or "dependents" (Shift held). Makes the Shift modifier's effect discoverable.
  6. The host's **cross-view button** — in this host "Show in Tree", which invokes the `focus(target)` view transition to the Tree view (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § View Transitions); the label and the action are the host's (`crossView`). This is the graph's sole "Show in Tree" affordance. It is offered on every node, an endpoint or operation included, though those have no tree block of their own ([#183](https://github.com/jmbarzee/temporal-architect/issues/183)).

The tooltip is **interactive**: it stays open while the pointer is over it (a short grace period bridges the gap as the pointer travels from the node onto the tooltip) so the Show in Tree button is clickable. Moving the pointer off both the node and the tooltip dismisses it.

**Context line format** — the second line of the tooltip shows the node's parent context in a format suited to each type's deployment role:

| Node type | Context line format | Example |
|---|---|---|
| Namespace | *(no context — top-level)* | — |
| NexusEndpoint | `namespace · queue` | `ecommerce · payment-queue` |
| Worker | parent namespace name | `ecommerce` |
| NexusService | `worker · queue` | `paymentWorker · nexus-queue` |
| Workflow | parent worker name | `paymentWorker` |
| NexusOperation | `service · worker · queue` | `PaymentService · paymentWorker · nexus-queue` |
| Activity | parent worker name | `paymentWorker` |

The `<parent context> · <task queue>` pattern for nexus types surfaces the two most useful addressing identifiers — where does it live, and what queue routes calls to it — without requiring the user to hover sub-nodes or read the sidebar.

### Nexus Routing Association (Hover)

The nexus family has transient hover behaviors that reveal routing relationships without persistent edges. These complement the standard transitive-dep highlight and apply automatically based on node type. They are the taxonomy's, not the library's (D59): the host's `highlight` hook refines the library's transitive walk for an active node, and its `contextLine` hook writes the hover box's context line — the library computes the walk and the parent's name, and asks.

**Hover on a `nexusEndpoint` node:** Standard transitive-dep BFS does not apply — endpoints have no outgoing dependency edges (they are pure addressing aliases). Instead, the canvas highlights all visible `nexusCall` edges whose routing metadata names this endpoint, plus the source and target nodes of those edges. The endpoint's namespace parent is also highlighted for context. The result makes the "which calls route through this entry point?" question answerable at a glance — the fan-out shows every caller and every operation that a call through this endpoint reaches.

**Hover on a `nexusService` deployment:** The standard transitive-dep chain applies as usual. Additionally, the endpoints fronting this service's operations are added to the highlighted set (plus their namespace parent). These are reached by walking the service's operation children and following their `nexusRoute` edges to the endpoint nodes — the parser materialises the endpoint↔operation composition as a `nexusRoute` edge (matched upstream on namespace + queue), so the visualizer never re-derives the relationship from node `(namespace, queue)` fields. This surfaces "which endpoints front calls to this service?" at hover time.

Both behaviors operate over edges the parser already emits — the endpoint hover reads the `nexusEndpoint` routing metadata in a `nexusCall` edge's `payload`; the service hover reads `nexusRoute` edges. Neither consults node `(namespace, queue)` fields, which exist only as hover-tooltip display metadata.

### Duplicate Highlighting

When the hovered or selected node belongs to a **duplicate group** (a definition that's been duplicated across multiple workers — see § The model, *Per-worker duplication*), every visible sister copy is drawn with a coloured **duplicate halo**. The sisters are not added to the highlighted set: one not on the dependency chain dims with the rest, and the halo is what marks it. Hovering any one copy of an activity registered on three workers halos all three. This is what links the duplicates visually — they have no edges between each other, and the halo says "these are the same thing in different homes".

Sister copies are haloed only when they pass the current filters. A copy that's been hidden by the user's filters does not pop back into visibility on hover; the hover interaction extends what's already on screen, it doesn't override the filter.

The transitive chain follows only **visible edges** — including graduated edges when intermediate types are hidden. If only Namespace is enabled, the chain follows Namespace → Namespace derived edges. If Namespace and Workflow are enabled (Workers hidden), the chain follows graduated containment and the workflows' dependency edges. This is consistent with filter-as-source-of-truth: the user sees relationships between what's visible, not inferred relationships from hidden data.

### Selection

Deferred. See [#48](https://github.com/jmbarzee/temporal-architect/issues/48) (Node Selection + Info Panel). The hover info tooltip (§ Hover: Dependency Highlighting) serves the immediate identity and connection discoverability need without requiring persistent selection state.

### Info Panel

Deferred alongside selection. See [#48](https://github.com/jmbarzee/temporal-architect/issues/48) (Node Selection + Info Panel).

### Multi-Select

Deferred — [#50](https://github.com/jmbarzee/temporal-architect/issues/50). Lasso or modifier+click to select multiple nodes. Useful for "what connects these two namespaces?" queries. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Keyboard Modifier Vocabulary for modifier key assignments — multi-select should use Ctrl/Meta+click (not Shift, which is reserved for dependency direction).

### Hotkey Discoverability

The graph view uses modifier keys for interaction variants (e.g., Shift+hover for upstream dependencies). These need to be discoverable:
- Tooltip hint on first hover (e.g., "Hold Shift to show dependents").
- A keyboard shortcut reference accessible from the control panel or a `?` button.
- Modifier state reflected in the UI — when Shift is held, a subtle indicator appears (e.g., the cursor changes, or a small label like "upstream" appears near the hovered node).

---

## Decomposition Group Overlay

The graph view can overlay the **chunk decomposition** (`twf graph chunks`) — the
topology-based grouping of definitions into independently-authorable units — as a
**non-destructive glow highlight**. It answers "what are the composable groups of
work, and which nodes belong to each?" This is **graph-view only**; the tree view
is unaffected.

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
hover/search highlight sets. The split is the host's and the view's: the host
turns its decomposition and the modal's selection into groups over the whole
graph (an id, the node ids covered, how strongly to glow), and the view restricts
each to the visible set, drops the empty, and colours what is left in order — so
the palette cycles over the groups shown, and the host's legend reads the colours
back from the groups as drawn. The glow only ever covers nodes that pass the
current type/file filters (the visible set) — filter-as-source-of-truth (§ Search
and Filtering). A group's hidden members do not pop into view; the glow extends
what is already on screen.

### Groups Modal

A collapsible floating overlay anchored **top-right, below the toolbar**
(the Control Panel holds bottom-right), **collapsed by default** (the toggle
reads "Groups"), mirroring the Control Panel's pattern (§ Control Panel). Its
header carries an **always-visible glow switch** (the Control Panel's sliding
switch style) — the master on/off for the overlay, shown whether the panel is
collapsed or open, so the glow can be toggled without expanding the panel. When
off, nothing glows regardless of the selection below.

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

### Glow Display

The active and hovered groups render as a **soft glow behind all other canvas
content** (drawn before edges and nodes, so it never occludes them):

- Each visible **member node** gets a radial-gradient halo in its group's color,
  fading to transparent so adjacent members fuse into a continuous blob with no
  hard boundary.
- An **edge** glows when **both** of its endpoints are in the same group (the same
  rule as the dependency-highlight edge set).
- A **focused** group — the modal-hovered/overridden group, or the group
  containing the node currently **hovered or selected on the canvas** — both
  **brightens and swells**: its halo radius and edge-corridor width grow with the
  focus strength, so it visibly lifts out of the field rather than just getting a
  little brighter.
- **Node-focus strengthening** is the direct counter to "tons of groups": with
  many faint groups shown at once, sweeping the pointer over the graph surfaces one
  group at a time, so the user can read which group any node belongs to in place —
  no round-trip to the modal legend. It composes with (takes the max of) the
  modal-hover strengthening, and rides the same hover/selection state as the
  dependency highlight, so a single hover both lights a node's dependencies and
  surfaces its group.

**Color** is a small cycling palette assigned per shown group. Because only the
**currently-expanded depth's** sibling groups glow at once (progressive disclosure
of color, driven by the modal's expand state), the simultaneous count stays bounded
by the branching factor rather than the total leaf count, so a small palette
suffices. Smarter assignment — structural-adjacency map-coloring (there is no 2D
boundary, so "adjacent" is defined by shared edges / the dependency DAG, not
geography) and a stable semantic hue for the dominant shared service — is deferred
([#44](https://github.com/jmbarzee/temporal-architect/issues/44)), as is encoding
a metric (Ec / size) in the glow radius.

The glow is **non-destructive** and stacks beneath the existing focus/context
lenses (search dim, hover dependency highlight); it never changes which nodes are
visible. While the glow is active the focus/context **dim floor is softened**
(un-highlighted nodes fade less than the no-glow default) — the glow already
pulls the eye to the grouped nodes, so the full dim would render the rest
illegible; the un-grouped context stays readable without losing the hover/search
focus effect when no glow is shown.

### Advisory (note)

The decomposition may carry `suggestContract` advisories (a heavily-shared hub
that is an articulation point — a candidate Nexus contract boundary). Surfacing
these in the graph (e.g. a node badge) is **deferred**; see
[#44](https://github.com/jmbarzee/temporal-architect/issues/44).

---

## Performance Considerations

See [PRODUCT.md](./PRODUCT.md) § Density management for the cross-cutting principle.

### Computational

- **Node count** — For typical TWF projects, expect tens to low hundreds of nodes. A naive O(n²) charge calculation is acceptable at this scale. If needed later, apply a **Barnes-Hut approximation** (quadtree-based) to reduce to O(n log n).
- **Rendering** — Canvas-based rendering (2D context) is used. The simulation logic is renderer-agnostic.
- **Offscreen culling** — Only render nodes and edges within (or near) the visible viewport. The simulation still runs for all nodes.

### Visual Density

At high node counts, the graph risks becoming a hairball. Strategies to manage this, applied progressively as density increases:

- **Label elision** — Two complementary mechanisms keep labels readable: (1) below a low zoom threshold, name labels are hidden entirely (only the colour-coded shapes remain), reappearing on hover or when zoomed in; (2) at all other zooms, each label is placed only if its box overlaps neither an already-drawn label **nor any node body** this frame, so dense clusters thin out their labels instead of overprinting nodes or each other. The hovered/selected node always wins, and the choice is greedy in (stable) node order so it doesn't flicker once the layout settles. Because labels hide rather than shrink, zooming in (up to 40×) spreads nodes apart and progressively reveals more labels. (There is no longer a secondary summary badge under the node — composition counts moved to the hover box, § Node Summaries.)
- **Zoom-responsive node sizing** — Node bodies and labels scale down (clamped) as the user zooms out, so a zoomed-out graph reads as a clean constellation instead of a chaotic field of overlapping full-size dots. See § Visual Encoding → Node Appearance.
- **Edge bundling** — When many edges connect the same pair of workers or namespaces at coarser zoom levels, the derived edge already compresses them to one. With the orchestrator and leaf kinds visible and many edges between the same two worker groups, consider visual bundling (routing edges through shared paths) or opacity reduction for parallel edges.
- **Kind chips as density control** — The kind filter is the primary density management tool. The default view (Workers and Workflows only) shows a moderate-density graph. Users opt into density by enabling additional kinds. This is density management through progressive disclosure rather than algorithmic simplification.
- **Zoom-dependent detail** — Node rendering can reduce detail at distant zoom: drop icons, simplify shapes to dots, reduce border thickness. The node remains clickable and hoverable at all zoom levels.

---

## Live Reload

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Live Reload for the shared reload behavior (identity matching, state preservation, transition indicator). Graph-view-specific reload details are documented there.

---

## Keyboard Navigation

The graph view supports keyboard navigation for node selection, viewport control, and interaction states.

**Scope.** Where the keys listen is the host's choice, through the view's `keyboard` prop (D66). On the pane (the library's default), the pane is focusable, the keys below act while it or its canvas has focus, Tab cycles nodes only while the pane itself is focused, and Escape with nothing left to close returns focus to the host — so a host page keeps Tab and Space for its own controls. Globally — this host's choice, since the pane is the whole webview — the window listens while the Graph view is the active tab. In either scope a control keeps its own keys: Space on a button activates the button, not the simulation, and Tab from a control moves focus.

### Key Bindings

| Key | Action |
|-----|--------|
| **Tab** | Cycle focus to the next visible node, in the visible set's order (hierarchy-then-alphabetical ordering, and Tab out of the canvas, are [#182](https://github.com/jmbarzee/temporal-architect/issues/182)) |
| **Shift+Tab** | Cycle focus to the previous node |
| **Enter** | Select the focused node (same as click — triggers dependency highlight) |
| **Escape** | Deselect all. Close any open panel or popover. |
| **Arrow keys** | Pan the viewport |
| **+** / **-** | Zoom in / out |
| **F** | Fit-to-view (frame all visible nodes) |
| **/** | Open the search bar and focus its input (Ctrl+F opens search in the Tree only — #182) |
| **Space** | Toggle simulation play/pause |
| **?** | Toggle keyboard shortcut reference panel |

### Focus Indicator

The currently focused node has a visible focus ring (distinct from hover highlight and selection highlight). The tooltip does not yet follow keyboard focus (#182).

### Modifier Keys

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Keyboard Modifier Vocabulary for modifier key semantics. The Shift modifier for upstream dependency highlighting (see § Interaction States) also works with keyboard focus — holding Shift while a node is focused reverses the transitive highlight direction.

### Accessibility

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Accessibility for the shared accessibility approach (ARIA roles, focus indicators). Graph nodes are not DOM elements: the pane keeps a virtual focus index over the canvas, and an accessible-name layer announcing a node's kind and name is deferred (#182).


## Cross-View Navigation

The graph view participates in the visualizer's cross-view navigation system. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) for view switching, "Show in Tree" actions, shared filter vocabulary, and other shared behaviors.

---

## Design Principles

- **Direct Manipulation** — Prefer controls that let users interact with the thing itself, not a proxy.
- **Make the Invisible Visible** — Forces are invisible; make their effects visible (field rings, spring tension, balance indicators).
- **Spatial Encoding** — Use physical layout to communicate structure; position beats labels.
- **Tight Feedback Loops** — Changes should be immediately visible; the display and the thing being displayed should be one.
- **Progressive Disclosure** — Show the essential, reveal the detailed on demand.
