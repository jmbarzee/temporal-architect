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
| **Graph view** | `twf graph` (resolved deployment graph) | AST for hover detail (sourceFile, params, body source) |

The graph view is a **renderer over the parser-emitted deployment graph**. The parser owns deployment expansion (one node per definition × deployment context), dispatch routing (which deployment a call lands on), and tier coarsening (worker-tier and namespace-tier projections of dispatch edges). The visualizer does not re-walk the AST for any of this — it translates the parser's nodes and edges into view-side shapes and hands them to the simulation.

Cross-view identity threads through `node.definitionKey` (the parser's `definition` field — `${kind}:${name}`). Selecting `OrderWorkflow` in the tree view highlights every graph node whose `definitionKey === "workflow:OrderWorkflow"`, regardless of how many deployments that definition has.

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

### Note on the current implementation

The visualizer's `GraphNode.level` field carries a numeric depth (`1 | 1.5 | 2 | 3 | 4`) that conflates the two ladders' tiers into a single sortable axis. That representation is implementation detail, retained pending a follow-up refactor (visualizer/REVISIONS_006) that moves all per-node-type metadata into a central registry and lets `nodeType` be the single axis of identity. The model described above is the authoritative one; the level numbers are a transient encoding the current code uses for sizing and Y-band lookup.

**Per-worker duplication.** L3 nodes (Workflow, Activity, NexusOperation) and L2 NexusService nodes are emitted **per worker deployment** — an activity registered on three workers produces three distinct nodes, each parented to its respective worker. This makes the fact that a definition has multiple homes visible directly in the canvas, instead of collapsing it into a single node whose containment relationship to all-but-one of its workers is silently dropped. Duplication is performed upstream by `twf graph`; the visualizer consumes the already-duplicated nodes.

Each duplicate shares a stable `definitionKey` (= the parser's `definition` field: `${nodeType}:${name}`, with the parent service name folded in for operations as `Service.Op`). The graph carries a `duplicateGroups: Map<definitionKey, Set<nodeId>>` index that the view uses during hover/select to keep sister copies visually grouped (see § Interaction States: Duplicate Highlighting). Definitions that are not registered on any worker remain orphan singletons (one node, no parent, `orphan: true`).

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
2. **NexusService → Worker** ("hosted on") — An L2-to-L2 peer containment edge. The service is hosted on the worker but isn't "below" it in the level hierarchy.
3. **NexusOperation → NexusService** ("member of") — An operation belongs to its declaring service (L3 child of an L2 parent).
4. **Worker → Namespace** ("member of") — A worker is instantiated within a specific namespace.
5. **NexusEndpoint → Namespace** ("declared in") — An endpoint is declared inside a specific namespace.

**Dependency edges** come from call sites in workflow and sync-operation bodies, plus the implicit "operation delegates to backing workflow" relationship of an async operation. They are first-class semantic relationships and are drawn at Level 3 regardless of whether caller and callee share a Worker — co-location on a worker says nothing about whether one calls the other, so containment cannot stand in for a call edge.

Activities are **leaves of the call graph** — they do not emit dependency edges. Activities cannot call other activities or workflows; these are not Temporal primitives. Dependency edges only originate from workflows and nexus sync operations.

1. **Workflow → Workflow** ("calls") — A workflow calls or awaits another workflow.
2. **Workflow → Activity** ("calls") — A workflow calls an activity.
3. **Workflow → NexusOperation** ("calls") — A call site `nexus Endpoint Service.Operation(args)` is an edge from the calling workflow to the operation node. The endpoint is preserved as edge metadata for hover info.
4. **NexusOperation → Workflow / Activity / NexusOperation** ("calls"), for sync operations — the body of a sync operation is walked just like a workflow body, with the operation as the caller.
5. **NexusOperation → Workflow** ("delegates to"), for async operations — an async operation is implemented by a backing workflow; this edge is emitted from the operation declaration, not from any specific call site.

Putting operations on the call path (caller → operation → callee) lets the user see who reaches each operation, what it routes to, and which service owns it, in a single subgraph. The shape (3 connections from each operation: parent service, callers, callee) is the user-visible payoff for promoting operations from edge metadata to first-class nodes.

Multiple call sites between the same pair (caller, callee) collapse into a single dependency edge — the graph answers "does X reach Y?", not "how many times". When the same caller reaches an operation through more than one endpoint, the surviving deduplicated edge keeps a representative endpoint as hover metadata.

### Derived Edges (Graph Coarsening)

Higher-level dependency edges are **derived** by projecting Level 3 dependency edges upward through the containment hierarchy:

1. **Worker → Worker** ("depends on") — Exists when any Level 3 node in Worker A depends on any Level 3 node in Worker B. Discard self-loops.
2. **Namespace → Namespace** ("depends on") — Exists when any Worker in Namespace A depends on any Worker in Namespace B. Discard self-loops.

### Graph Construction

The deployment graph is constructed **upstream** by `twf graph` (see `tools/lsp/parser/graph/`). The visualizer consumes the resulting JSON and translates each piece into its view counterpart. Construction inside the visualizer is a single pass over the parser payload:

1. **Translate nodes.** For each `parserGraph.nodes[i]`, emit a view node with `id` (parser's composite deployment ID), `level` (derived from the parser's `definition` kind via `nodeLevel()`), `parentId` (looked up from the parser's containment edges), and `definitionKey` (= `parserGraph.nodes[i].definition`). The AST is consulted only to fill `sourceFile` so the per-file filter chip works; everything structural comes from the parser.
2. **Translate edges.** For each `parserGraph.edges[i]`, emit a view edge. `kind: "containment"` becomes `edgeType: "containment"`; the dispatch kinds (`activityCall`, `workflowCall`, `nexusCall`, `asyncBacking`) all become `edgeType: "dependency"`. `nexusCall` edges copy `routing.nexusEndpoint` onto the view edge so the canvas can colour spliced caller-to-backing edges in the nexus palette.
3. **Translate coarsened edges.** For each `parserGraph.coarsenedEdges[i]`, emit an L2 (`tier === "worker"`) or L1 (`tier === "namespace"`) view dependency edge. No projection logic runs in the visualizer — the parser has already aggregated dispatch edges by `(from, to, tier)` and discarded self-loops.
4. **Build `duplicateGroups`.** Index every view node by its `definitionKey`; the resulting `Map<definitionKey, Set<nodeId>>` powers the duplicate-highlight interaction (see § Interaction States: Duplicate Highlighting).

Per-worker duplication, dispatch routing, cross-namespace coarsening, and orphan detection are all properties of the parser graph. The visualizer never re-derives them.

### Orphan Definitions

The containment hierarchy assumes every Level 3 node belongs to a Worker and every Worker belongs to a Namespace. But the DSL allows definitions without assignments — a workflow not registered on any worker, a worker not placed in any namespace.

**Treatment:** Orphan definitions appear in the graph as uncontained nodes, visually distinct from contained ones (e.g., positioned outside any grouping, with a subtle "unassigned" indicator such as a dashed outline or muted badge). They participate in dependency edges normally.

**Type filtering behavior:**
- Orphan workers (no namespace) are visible when the Worker type toggle is on.
- Orphan L3/L4 nodes (no worker) are visible when their specific type toggle (Wf, Act, Nxs, or Op) is on. NexusOperation nodes inherit orphan status from their parent service: if the service is orphan, the operations are too.
- Orphans follow the same toggle rules as any other node — they're shown or hidden by their type, not by containment.

**Seeding:** Orphan nodes have no parent to seed from. On initial appearance or live reload addition, seed them at the center of the viewport. The simulation's charge repulsion will push them to a natural position.

**Data:** Orphan status is derivable from the AST — a definition is orphan if no worker or namespace references it. No parser changes needed.

---

## Layout: Force-Directed Simulation

The graph is rendered using a **force-directed layout** (also called a force simulation or spring-electrical model). Nodes are positioned by a continuous physics simulation where forces push and pull until the system reaches equilibrium.

### Force Types

| Force             | Applies To       | Behavior                                                                 |
|-------------------|------------------|--------------------------------------------------------------------------|
| **Charge (repulsion)** | Every node pair | Nodes repel each other, preventing overlap. Follows an inverse-square falloff (like electrostatic charge). |
| **Link (attraction)**  | Connected node pairs | Edges act as springs pulling connected nodes toward a target distance.    |
| **Hierarchical gravity** | All nodes      | Two rest bands that hold world coordinates in place: a global X band exerts no force inside `[bandXMin, bandXMax]` and pulls nodes back to the nearest edge outside it; a per-node-type Y band does the same vertically. Both axes use bands rather than point anchors so a graph with many top-level siblings can spread out instead of stacking on `x = 0`. The Y bands stack the hierarchy top-to-bottom (NS at the top, L4 activities at the bottom). |

Each force has a **strength** parameter that controls its magnitude. These strengths are the primary tuning knobs for the layout.

### Why a hierarchical anchor instead of center-of-mass gravity

A force-directed graph is a free-floating cloud by default — it is held together but not held *anywhere*. The graph view's data has an inherent vertical hierarchy (namespace → worker → definition), and a manually-organised diagram of the same data would place namespaces and workers near the top, definitions toward the bottom. The hierarchical anchor encodes that structure in the layout itself: each node type lives in its own Y band, with no Y force inside the band and a pull toward the band's nearest edge outside it.

The anchor also fixes the practical drift problem that comes with COM-based gravity. Because the X band and the type-specific Y bands are absolute world coordinates, the simulation's centre of mass cannot wander out of frame; the canvas does not need to compensate by re-centering the viewport every tick. After the initial fit-to-view, the user's pan/zoom is the only thing that moves the camera.

### Force Parameters

The simulation exposes **one charge strength per node type** and **one spring (k + rest distance) per edge category**, plus shape controls and dynamics that govern how those forces behave.

**Charge strengths** (6, one per node type — negative values, repulsion):
- Level 1: Namespace
- Level 2: Worker
- Level 3: Workflow
- Level 3: NexusService
- Level 3: NexusOperation
- Level 4: Activity

The L3 and L4 charges share a slider range so their magnitudes are directly comparable across the bottom of the hierarchy; this lets the user see at a glance whether one definition type repels harder than its peers.

**Link strengths** (9, one per edge category — positive values, attraction). Containment edges connect a parent to one specific child type; dependency edges live within or across levels and are split by endpoint type:
- Containment: `NS↔Wk`, `Wk↔Wf`, `Wk↔Act`, `Wk↔Nx`, `Nx↔Op` (intra-L3, operation under its service)
- Dependency: `NS↔NS`, `Wk↔Wk`, `Wf↔Wf`, `Wf↔Act`

NexusOperation nodes participate in dependency edges as both source and target (caller → operation, operation → backing workflow, sync-op-body → callee). For spring-force purposes, an operation is treated as workflow-equivalent — it sits on the call path and clusters with workflows in the L3 band.

All link sliders share a common k range and a common rest range, so the gradient across the hierarchy (loose-and-long at the top, tight-and-short at L3) is visually obvious.

**Shape controls** modify the force curves:
- Master multipliers (`push`, `pull`, `dist`) scale entire force categories
- Exponents control falloff shape (charge exponent, link exponent)
- Softening prevents charge singularity at close range
- Rest distances (one per edge type) define the spring equilibrium length

**Dynamics** control the simulation's temporal behavior:
- Friction (velocity damping per tick)
- Cooling (energy decay per tick)
- Threshold (energy level below which the simulation pauses)

The full parameter set is exposed through the Control Panel (see below), organized by the equations they appear in.

### Simulation Lifecycle

1. **Initialize** — Place nodes at initial positions (see *Level Transitions* below).
2. **Tick** — On each animation frame, compute forces, update velocities, apply velocity damping (friction), update positions.
3. **Cool** — Over time, reduce the simulation's *alpha* (energy). As alpha approaches zero, the layout stabilizes and ticking can pause.
4. **Reheat** — When the graph structure changes (nodes added/removed, level transition), reset alpha to restart the simulation.

The simulation should use **requestAnimationFrame** for rendering, decoupled from the physics tick rate if needed for performance.

---

## Type Filtering

The graph uses **type toggles** to control which nodes are visible. Any combination is valid; there is no contiguity constraint.

### Type Toggle Control

Five toggle chips in the graph view filter bar:

**NS** · **Workers** · **Nexus** · **Wf** · **Act**

The **Nexus** chip is a **group** that controls three underlying node kinds together:
- **NexusEndpoint** — the routing alias (L1.5 nodes, parented to their namespace)
- **NexusService** — the callable API surface (L2, hosted on a worker)
- **NexusOperation** — the per-operation callable handle (L3, child of its service)

Toggling the Nexus chip on turns all three on simultaneously; toggling it off hides all three and any nexus call edges that touch them. This keeps the filter bar compact. Internally, `visibleTypes` still tracks the three individual def-type keys (`nexusEndpointDef`, `nexusServiceDef`, `nexusOperationDef`) so the filter contract and persistence are unchanged — the group is a UI-only concept.

Default state: Workers and Workflows ON; everything else OFF.

The tree view's filter bar is separate and continues to show individual chips for the three nexus kinds; the consolidation is graph-view only.

### Which Nodes Are Visible

A node is visible if its type toggle is on AND it passes the file filter AND it passes the search filter (if active).

### Edge Graduation

Edges adapt to the visible types by **graduating** across hidden layers. The rules:

**Dependency edges** between visible nodes at the same level render directly. When a level is hidden, its dependency edges are projected to the nearest visible ancestor level (same coarsening rule as before — Worker→Worker deps derive from L3→L3, Namespace→Namespace deps derive from Worker→Worker). Self-loops from projection are discarded.

**Containment edges** skip hidden intermediate levels. When Worker is hidden but Namespace and any L3 types are visible, L3 nodes attach directly to their grandparent Namespace via a graduated containment edge. The visual effect: L3 nodes cluster around their Namespace, as if the Worker container were transparent.

This means every combination of types produces a coherent graph — there are no "invalid" filter states. Examples:

| Visible Types | Nodes | Edges |
|---------------|-------|-------|
| NS only | Namespaces | NS→NS dependencies |
| NS + Worker | Namespaces, Workers | NS→NS deps, NS↔Worker containment, Worker→Worker deps |
| NS + Wf + Act | Namespaces, Workflows, Activities | NS→NS deps, NS↔L3 graduated containment, L3→L3 deps |
| Worker + Wf | Workers, Workflows | Worker→Worker deps, Worker↔Wf containment, Wf→Wf deps |
| Wf + Act + Nxs | All L3 types | L3→L3 deps only (no containment — no parent types visible) |
| All | Everything | All edges at all levels |

---

## Type Transitions (Animated)

Toggling a type on or off should feel spatial and continuous, not like a hard cut. The design below supports eventual seamless animation even if the first implementation is simpler.

### The Spatial Metaphor

Type transitions are **opening and closing containers**. When you enable Worker while Namespace is visible, each namespace visually "opens" — workers emerge from the namespace node and spread into their spatial arrangement while the namespace recedes to a background anchor. When you disable Worker, workers converge back into their namespace and disappear. The same applies one level deeper: enabling L3 types opens workers to reveal their registered definitions.

When a middle layer is hidden (e.g., enabling L3 types while Worker is off), the container metaphor skips the hidden level — L3 nodes emerge from their grandparent Namespace via graduated containment.

This metaphor constrains the animation design:
- Children must emerge *from* their nearest visible ancestor, not appear at arbitrary positions — the spatial origin preserves the containment relationship.
- The ancestor node remains visible as a spatial anchor during and after the transition — it provides the "container" context.
- The transition preserves the user's viewport focus — if they were looking at Namespace A, new nodes from Namespace A should appear near where they're looking, not at the edge of the canvas.

The user's mental model is: "I zoomed into this thing and saw what's inside." The mechanics below implement this metaphor.

### Revealing a Type (e.g., enabling Worker while Namespace is visible)

1. **Seed positions** — Place incoming nodes at the position of their nearest visible ancestor (parent if visible, grandparent if parent is hidden). This keeps the spatial context intact.
2. **Set initial forces** —
   - Containment link strength: **maximum** (children cling to ancestor).
   - Intra-level dependency link strength: **zero** (children ignore peer edges initially).
   - Child charge strength: **zero** (children don't repel yet).
3. **Animate in** — Over a transition duration (~400–600 ms, eased):
   - Fade child nodes and edges from fully transparent to fully opaque.
   - Ramp child charge strength up to its target value (children begin to spread out).
   - Ramp intra-level link strength up to its target value (dependency edges start pulling).
   - Ramp containment link strength down toward its resting target (ancestor grip loosens).
4. **Result** — Children fan out from their ancestor, finding their own equilibrium, with dependency edges guiding the final arrangement.

### Hiding a Type (e.g., disabling Worker)

Reverse the process: fade out, collapse charge and link strengths, then remove nodes when they've converged back to their nearest visible ancestor position. If hiding a middle layer while both parent and child types remain visible, the graduated containment edges animate in as the hidden nodes fade out — the graph smoothly transitions from a 3-level to a 2-level layout.

### Force Strength Interpolation

All strength transitions should be **interpolated over time** (not snapped). Use an easing curve (e.g., ease-in-out cubic) so the simulation smoothly adjusts. The sliders in the control panel should visibly animate in sync with the force changes, providing a direct visual mapping between the controls and the layout behavior.

---

## Visual Encoding

### Node Appearance

Each node type should be visually distinct using redundant encoding (don't rely on color alone):

| Node Type      | Shape Suggestion      | Size      |
|----------------|-----------------------|-----------|
| Namespace      | Rounded rectangle     | Large     |
| Worker         | Rectangle             | Medium    |
| Workflow       | Circle or pill        | Small     |
| Activity       | Circle or pill        | Small     |
| NexusService   | Circle or pill        | Small     |

Level 3 node types share the same size tier but are distinguished by color and icon (matching the tree view's existing color system: purple for workflows, blue for activities, pink for nexus services).

All nodes display their name as a label. Labels should remain legible at typical zoom levels — consider truncation with a tooltip for long names.

### Edge Appearance

| Edge Type                        | Line Style   | Direction Indicator |
|----------------------------------|--------------|---------------------|
| Direct dependency (→ same level) | Solid        | Arrowhead           |
| Nexus dependency (→ via nexus)   | Solid, distinct color | Arrowhead    |
| Containment (↔ adjacent levels)  | Dashed       | None (undirected)   |

**Arrowheads are visible at rest.** Direction encoding is essential for answering "what depends on what?" (Q7) without hovering. Arrowheads point from the dependent node toward the dependency (A → B means "A depends on B"). They must be legible at typical zoom levels — scale arrowhead size with zoom so they remain visible but don't dominate at close zoom. Containment edges have no arrowhead (the relationship is symmetric membership).

Edge opacity and thickness can be secondary signals — thicker or more opaque for higher-traffic connections if multiplicity data is available in the future.

Nexus edges carry metadata (endpoint, service, operation) shown on hover. Hovering a nexus edge can highlight all edges sharing the same nexus scope (endpoint, service, or operation) to reveal shared routing.

### Color

See [PRODUCT.md](./PRODUCT.md) § Visual Identity for the shared color palette. Edges inherit the color of their source node, or use a neutral color to reduce visual noise.

### Node Summaries

Graph nodes display **summary badges** that communicate structural role at a glance, without hovering or selecting. See [PRODUCT.md](./PRODUCT.md) § Glanceable summaries for the design principle.

| Node Level | Summary | Example |
|------------|---------|---------|
| Level 1 (Namespace) | Contained worker count | `5 workers` |
| Level 2 (Worker) | Registration breakdown | `3wf · 1act` |
| Level 3 (Definition) | Dependency degree (in/out) | `→3 ←2` |

**Presentation:**
- Summaries appear as a secondary label below or beside the node name, in a smaller font at reduced opacity.
- At low zoom levels where labels are already hard to read, summaries are the first thing to be elided — they disappear before the primary name label does.
- Containment counts (L1, L2) reflect only the currently visible children — if Level 3 is not in the selected range, a Worker node does not show a registration count.
- Dependency degree counts (L3) count only edges at the currently visible abstraction level, consistent with filter-as-source-of-truth.

---

## Viewport Controls

The graph lives on an infinite 2D canvas. Standard viewport interactions:

| Interaction       | Action                      |
|-------------------|-----------------------------|
| **Scroll / pinch** | Geometric zoom in/out      |
| **Click-drag on background** | Pan the viewport  |
| **Click-drag on a node**     | Drag the node; pin its position while dragging, release to unpin |
| **Double-click a node**      | Center and zoom to fit the node and its immediate neighbors (graph-native; not used for cross-view navigation) |

Dragging a node should **reheat** the simulation locally so nearby nodes can adjust.

### Fit-to-View

A button (or automatic behavior on level change) that adjusts the viewport to frame all currently visible nodes with padding.

---

## Overlay Layout

Unlike the Tree view, which stacks its filter bar, toolbar, and errors header above its scrollable content, the Graph view renders these three elements as a **single floating overlay layer** above the canvas. The graph canvas itself fills the full viewport behind them.

```
┌──────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────────┐ │
│ │ filter bar     [pinning]  [graph toolbar]            │ │  ← overlay
│ │ errors header (when present)                          │ │     (translucent or
│ └──────────────────────────────────────────────────────┘ │      with backdrop)
│                                                          │
│              ▲                                           │
│        ┌─────┴─────┐                                     │  ← canvas
│        │ Worker A  │  ←──┐                               │     (fills full
│        └─────┬─────┘     │                               │      viewport)
│              ▼           │                               │
│        ┌───────────┐   ┌─┴─────────┐                     │
│        │ Workflow  │──▶│ Activity  │                     │
│        └───────────┘   └───────────┘                     │
└──────────────────────────────────────────────────────────┘
```

### Why an Overlay

Two reasons:

1. **More canvas real estate.** The graph is a spatial workspace; every pixel of vertical space matters. Stacking three bars eats ~120px of viewport height for what is essentially configuration UI.
2. **Bleed-under is an affordance.** When the user zooms in, graph content extends visibly under the edges of the overlay. This serves as a passive cue that there's more content out there — invite to pan or zoom out. It also matches the convention of spatial editors (Figma, Sketch, design tools) where toolbars float over an infinite canvas.

### Visual Treatment

- The overlay has a semi-transparent backdrop (matched to the surface color of the rest of the visualizer, with backdrop blur where available) so canvas content underneath remains visible but the controls stay legible.
- The overlay never expands to occupy more than ~30% of the viewport height. If the errors header would push past that, it becomes internally scrollable.
- Interaction over the overlay does not pan or zoom the canvas — mouse events on overlay controls are consumed by the controls.
- The overlay does not occlude the bottom of the viewport. The Control Panel (§ Control Panel) anchors to its existing position (typically bottom-right).

### Graph Toolbar Contents

The graph toolbar — rendered as a row within the overlay, just below the filter bar — contains graph-specific state and quick-access controls that don't belong in the filter bar:

- **Node / edge count** — `N nodes, M edges` (counts the currently visible/graduated set). Informational; updates reactively with filters.
- **Fit** — fit the viewport to all visible nodes. Keyboard shortcut: `F`.
- **Play / Pause** — quick-access toggle for simulation ticking. Same as the Play/Pause in the Control Panel; both are in sync. Keyboard shortcut: `Space`.
- **Show in Tree** — contextual; appears only when a node is selected. Invokes the `focus(target)` view transition (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § View Transitions).

The toolbar is always visible (not collapsible). It is compact — a single row, right-aligned controls.

---

## Control Panel

A collapsible overlay containing force parameters, simulation controls, and a force field visualization toggle. It serves two purposes: **tuning** (let users shape the layout) and **transparency** (make the physics legible by organizing controls around the equations that govern them).

### Organization

The panel is collapsed by default (progressive disclosure). When expanded, controls are grouped into four **equation sections**. Each section displays the physics equation it governs as a monospace header, then the sliders for every parameter that appears in that equation.

**PUSH** (all node pairs)

    F = α × push × charge / eff^exp
    eff = √(d² + softening)

Master parameters that shape all charge (repulsion) forces:
- `push` — master multiplier for all repulsion forces
- `exp` — power of distance in charge falloff (2 = inverse-square)
- `softening` — added to d² to prevent singularity at close range

Per-type charge strengths (negative values = repulsion):
- L1 Namespace (`NS`)
- L2 Worker (`Wk`)
- L3 Workflow (`Wf`)
- L3 Activity (`Act`)
- L3 NexusService (`Nx`)

**PULL** (connected pairs)

    F = α × pull × k × sign(Δ) × |Δ|^exp / d
    Δ = d − rest × dist

Master parameters that shape all link (attraction) forces:
- `pull` — master multiplier for all spring forces
- `exp` — power of displacement in spring force (1 = linear/Hooke)
- `dist` — master multiplier for all rest distances

Per-edge spring constant (k) and rest distance, displayed as dual-slider rows ordered top-of-tree → bottom-of-tree:
- L1: `NS↔NS` (dep), `NS↔Wk` (cont)
- L2: `Wk↔Wk` (dep), `Wk↔Wf`, `Wk↔Act`, `Wk↔Nx` (cont)
- L3/L4: `Wf↔Wf`, `Wf↔Act` (dep)

**GRAVITY** (hierarchical anchor)

    Fx = α × X × (0 − x)
    Fy = α × Y × (band − y)   (only when y is outside band)

- `X strength` — pull toward the nearest edge of the global X rest band
- `Y strength` — pull toward the nearest edge of each node type's Y band
- Per-node-type **Y band** (dual-handle slider) — the `[yMin, yMax]` window in which the type feels zero Y gravity. One row per node type, stacking the two ladders from container tier at the top to leaf at the bottom. All rows share a common Y range so the bands are directly comparable; defaults stack the main ladder (NS / Wk / Wf / Act) top-to-bottom, with the nexus ladder rungs (Ep / Nx / Op) defaulting to bands near their main-ladder peers.

**DYNAMICS**

    v ×= friction
    α −= cooling, stop at threshold

- `friction` — velocity damping per tick (higher = more friction)
- `cooling` — energy lost per tick (higher = settles faster)
- `threshold` — energy level below which simulation pauses

The equation-oriented grouping means each section is self-contained: the formula shows what the parameters do, the sliders let you change them. A user who understands the equation can predict slider effects; a user who doesn't can still experiment and see results.

### Simulation Controls

Below the equation sections:
- **Play / Pause** — toggle simulation ticking
- **Reheat** — reset alpha to restart the layout from current positions
- **Reset** — return all parameters to defaults

### Design Decisions

**Parameter changes do not auto-reheat.** The user adjusts sliders at their own pace; the simulation applies changes passively. When satisfied with parameter tuning, the user manually reheats to see the full effect. This separates "explore parameters" from "run the simulation."

**Sliders are live.** Dragging a slider immediately affects the running simulation. Each slider shows its current numeric value.

**Help popover.** A `?` button in the panel header reveals a reference showing all four force equations and a brief tuning guide (e.g., "if nodes overlap, increase push or charge; if oscillating, increase friction or cooling").

**Future:** Named presets (e.g., "Tight clusters", "Spread out") that animate sliders to known-good values.

---

## Force Field Visualization

A toggle ("Show force fields") in the control panel enables a visual overlay on the canvas that makes the invisible forces visible. This embodies the *Make the Invisible Visible* design principle.

### What's Drawn

When enabled, the canvas renders three overlay layers (drawn before nodes, after edges):

**Charge field rings** — Concentric circle outlines around each node showing where the charge force drops below a fixed set of *absolute* thresholds. Ring radius is derived from the equation `force(d) = pushMul × |q| / (d² + softening)^(exp/2)`, solved for `d` at each threshold; rings whose threshold is unreachable for a node's charge (i.e. the threshold exceeds the node's peak force) are simply not drawn. Stronger charges therefore produce visibly larger rings — and a node type with too small a charge to reach the inner threshold renders only its outer rings, which is itself a useful signal that the type is under-charged. Ring colour matches the node's type colour at low opacity.

**Spring tension coloring** — Edges colored by their current tension state: green when near rest distance, orange when compressed, blue when stretched. Color intensity scales with displacement magnitude.

**Hierarchical gravity overlay** — A faint vertical stripe between world `bandXMin` and `bandXMax` (with dashed edges) shows the X rest band; a horizontal stripe in each node type's colour shows that type's Y rest band. Inside either stripe a node feels no force on that axis; outside it the node is pulled toward the nearest edge. Hovering a single Y-band slider in the control panel highlights only that band and dims the others.

### When It's On

The toggle defaults to **off** — these overlays add visual density and are a debugging/exploration tool, not part of the default reading experience. Once toggled on, the overlays persist across simulation pause/play and parameter changes, updating each frame.

---

## Control-Canvas Feedback Loop

The control panel and canvas are linked: hovering a control section activates the corresponding force visualization on the canvas, even when the persistent force field toggle is off. This creates a direct mapping between the abstract parameter the user is adjusting and its physical effect on the layout.

### Section Hover

| Hovered Section | Canvas Response |
|-----------------|-----------------|
| **PUSH** | Charge field rings appear around all visible nodes |
| **PULL** | Edges show tension coloring (green/orange/blue) |
| **GRAVITY** | Global X rest band (vertical stripe with dashed edges) plus per-type Y rest bands appear |
| **DYNAMICS** | No canvas response (dynamics are temporal, not spatial) |

When the user stops hovering, the visualization fades unless the persistent "Show force fields" toggle is on.

### Per-Type Charge Highlighting

Within the PUSH section, hovering an individual charge slider (`NS`, `Wk`, `Wf`, `Act`, or `Nx`) highlights only that node type's field rings and dims the others. This lets the user see the reach and strength of one type's charge force in isolation — useful for understanding why nodes of different types settle at different distances.

### Per-Type Y-Band Highlighting

Within the GRAVITY section, hovering a single Y-band slider highlights only that node type's stripe on the canvas (full opacity) and dims the rest. This makes it easy to see exactly where one type's rest band sits relative to the others while you're moving its handles.

### Principle

This feedback loop embodies two design principles:
- **Make the Invisible Visible** — forces are abstract numbers; the canvas shows their spatial consequence
- **Tight Feedback Loops** — the user touches a control and immediately sees what it governs, before changing its value

---

## Errors Header

The graph view surfaces parse errors using the shared error handling pattern. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Error Handling. The errors bar renders within the floating overlay (see § Overlay Layout), beneath the graph toolbar. The canvas still renders whatever valid nodes and edges exist in the partial AST.

---

## Search and Filtering

The graph view uses the unified filter bar shared with the tree view (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Unified Filter Bar). The two structural filter dimensions (files, types) are per-view and reconciled on every view switch; the search query is globally shared.

The graph adds one graph-specific behavior: **edge graduation** (see § Type Filtering above). When a type is toggled off, edges graduate across hidden layers rather than simply disappearing. This means the graph always shows a coherent structure regardless of which types are visible.

### Search Behavior

Search is **non-destructive**: it never removes nodes from the visible set. Instead, when a query is active:

- **Matching nodes** (visible AND name contains the query) render at full opacity.
- **Non-matching visible nodes** dim to ~30% opacity. Their edges dim correspondingly.

No ring, halo, or other decorative highlight is used to mark matches — full-vs-dim opacity is the entire visual treatment. (Ring decoration is reserved for other uses.)

### Search and Hidden Matches

Search matches against **all** nodes, including those excluded by structural filters. The results split:

- **Visible matches** — nodes that match the search AND pass the current type and file filters. Rendered at full opacity in the graph.
- **Hidden matches** — nodes that match the search but are excluded by structural filters (toggled-off type, filtered file). Not rendered in the graph.

Hidden match counts appear as **badge overlays** on the filter controls that are hiding them:
- If 3 matching workflows are hidden because the Workflow type toggle is off, the Wf toggle shows a badge: "3".
- If 2 matching nodes are hidden because their source file is filtered out, the corresponding file chip shows a badge: "2".

This lets the user discover that matches exist, understand *why* they're hidden, and decide whether to adjust filters to reveal them. Search informs but never overrides filters.

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
- All other nodes and edges dim (reduce opacity to ~20–30%).
- Show a **hover info tooltip** anchored near the hovered node containing:
  1. Node name, type icon + label, context line (format varies by type — see below), source file.
  2. **Duplicate-copies line** (only when the definition has more than one visible copy): `copy N of M`, where M is the number of sister copies currently visible. Makes the per-worker duplication explicit and tells the user the cross-canvas highlight on the other copies is intentional.
  3. Immediate connection counts: N outgoing ("depends on"), M incoming ("depended on by").
  4. Direction indicator: "dependencies" (default hover) or "dependents" (Shift held). Makes the Shift modifier's effect discoverable.

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

The nexus family has transient hover behaviors that reveal routing relationships without persistent edges. These complement the standard transitive-dep highlight and apply automatically based on node type.

**Hover on a `nexusEndpoint` node:** Standard transitive-dep BFS does not apply — endpoints have no outgoing dependency edges (they are pure addressing aliases). Instead, the canvas highlights all visible `nexusCall` edges whose routing metadata names this endpoint, plus the source and target nodes of those edges. The endpoint's namespace parent is also highlighted for context. The result makes the "which calls route through this entry point?" question answerable at a glance — the fan-out shows every caller and every operation that a call through this endpoint reaches.

**Hover on a `nexusService` deployment:** The standard transitive-dep chain applies as usual. Additionally, all visible `nexusEndpoint` nodes whose `(namespace, queue)` deployment matches this service's deployment are added to the highlighted set (plus their namespace parent). This surfaces "which endpoints front calls to this service?" as a derived inference computed at hover time. No persistent endpoint→service edges are emitted by the parser — an endpoint is namespace-scoped routing, agnostic of which specific services share its queue. The relationship is real only at the call site; here it is expressed as transient highlight state rather than a materialised edge.

No new edge types. No new data model. Both behaviors operate entirely over the existing graph, reading `edge.nexusEndpoint` metadata and node deployment fields (`namespace`, `queue`) that the parser already emits.

### Duplicate Highlighting

When the hovered or selected node belongs to a **duplicate group** (a definition that's been duplicated across multiple workers — see § Per-worker duplication), every sister copy is added to the highlighted set alongside the transitive dependency chain. The visual result: hovering any one copy of an activity registered on three workers keeps all three copies at full opacity while the rest of the graph dims. This is what links the duplicates visually — they don't have edges between each other (they're not "connected" in the dependency sense), but they share opacity with each other under hover, which is what tells the user "these are the same thing in different homes".

Sister copies are added to the highlight set only when they pass the current type and file filters. A copy that's been hidden by the user's filters does not pop back into visibility on hover; the hover interaction extends what's already on screen, it doesn't override the filter.

The transitive chain follows only **visible edges** — including graduated edges when intermediate types are hidden. If only Namespace is enabled, the chain follows Namespace → Namespace derived edges. If Namespace and Workflow are enabled (Workers hidden), the chain follows graduated containment and L3 dependency edges. This is consistent with filter-as-source-of-truth: the user sees relationships between what's visible, not inferred relationships from hidden data.

### Selection

Deferred. See [VISUALIZER_DEFERRED.md](../../../VISUALIZER_DEFERRED.md) § Node Selection. The hover info tooltip (§ Hover: Dependency Highlighting) serves the immediate identity and connection discoverability need without requiring persistent selection state.

### Info Panel

Deferred alongside selection. See [VISUALIZER_DEFERRED.md](../../../VISUALIZER_DEFERRED.md) § Node Selection.

### Multi-Select (future consideration)

Lasso or modifier+click to select multiple nodes. Useful for "what connects these two namespaces?" queries. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Keyboard Modifier Vocabulary for modifier key assignments — multi-select should use Ctrl/Meta+click (not Shift, which is reserved for dependency direction).

### Hotkey Discoverability

The graph view uses modifier keys for interaction variants (e.g., Shift+hover for upstream dependencies). These need to be discoverable:
- Tooltip hint on first hover (e.g., "Hold Shift to show dependents").
- A keyboard shortcut reference accessible from the control panel or a `?` button.
- Modifier state reflected in the UI — when Shift is held, a subtle indicator appears (e.g., the cursor changes, or a small label like "upstream" appears near the hovered node).

---

## Future: Message Flow Edges

The current graph models **call** relationships (workflow calls workflow, workflow calls activity). Temporal workflows also communicate through **messages** — signals, queries, and updates — which represent a different kind of dependency.

### Vision

When the DSL supports typed signal/query/update send statements (see `POSSIBLE_DSL_FEATURES.md`), the graph can derive **message flow edges** alongside call edges:

- **Workflow → Workflow** ("signals/queries/updates") — WorkflowA sends a signal to WorkflowB.

These are visually distinct from call edges (different line style or color) and toggleable — the user can show/hide message flow edges independently to manage visual complexity.

Message flow edges participate in the same systems as call edges:
- Graph coarsening projects them up to Worker → Worker and Namespace → Namespace.
- Transitive hover highlights follow them.
- Search and filtering apply to them.

### Data Contract (not yet available)

Requires the parser to emit typed send statements in the AST with:
- Source workflow (the sender)
- Target workflow (the receiver)
- Handler name (which signal/query/update)
- Message type (signal vs query vs update)

The DSL does not currently support send-side syntax. This feature is blocked on DSL and parser work.

### Design Anticipation

The edge data model, visual encoding tables, and interaction specs in this document are designed to accommodate message flow edges without structural changes. When the data becomes available:
- Add a new edge type to the Fundamental Edges table.
- Add a row to the Edge Appearance table (distinct line style for message flows).
- Add a toggle to the filter controls for message flow visibility.

---

## Performance Considerations

See [PRODUCT.md](./PRODUCT.md) § Density management for the cross-cutting principle.

### Computational

- **Node count** — For typical TWF projects, expect tens to low hundreds of nodes. A naive O(n²) charge calculation is acceptable at this scale. If needed later, apply a **Barnes-Hut approximation** (quadtree-based) to reduce to O(n log n).
- **Rendering** — Canvas-based rendering (2D context) is used. The simulation logic is renderer-agnostic.
- **Offscreen culling** — Only render nodes and edges within (or near) the visible viewport. The simulation still runs for all nodes.

### Visual Density

At high node counts, the graph risks becoming a hairball. Strategies to manage this, applied progressively as density increases:

- **Label elision** — At low zoom levels where labels would overlap, hide node name labels and show only the color-coded shape. Labels reappear on hover or when zoomed in. Summary badges (§ Node Summaries) are elided before name labels.
- **Edge bundling** — When many edges connect the same pair of workers or namespaces at coarser zoom levels, the derived edge already compresses them to one. At Level 3 with many visible edges between the same two worker groups, consider visual bundling (routing edges through shared paths) or opacity reduction for parallel edges.
- **Type toggles as density control** — The type filter is the primary density management tool. The default view (Workers and Workflows only) shows a moderate-density graph. Users opt into density by enabling additional types. This is density management through progressive disclosure rather than algorithmic simplification.
- **Zoom-dependent detail** — Node rendering can reduce detail at distant zoom: drop icons, simplify shapes to dots, reduce border thickness. The node remains clickable and hoverable at all zoom levels.

---

## Live Reload

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Live Reload for the shared reload behavior (identity matching, state preservation, transition indicator). Graph-view-specific reload details are documented there.

---

## Keyboard Navigation

The graph view supports keyboard navigation for node selection, viewport control, and interaction states.

### Key Bindings

| Key | Action |
|-----|--------|
| **Tab** | Cycle focus to the next node (order: by containment hierarchy, then alphabetical within peers) |
| **Shift+Tab** | Cycle focus to the previous node |
| **Enter** | Select the focused node (same as click — triggers dependency highlight) |
| **Escape** | Deselect all. Close any open panel or popover. |
| **Arrow keys** | Pan the viewport |
| **+** / **-** | Zoom in / out |
| **F** | Fit-to-view (frame all visible nodes) |
| **/** or **Ctrl+F** | Open search bar and focus the search input |
| **Space** | Toggle simulation play/pause |
| **?** | Toggle keyboard shortcut reference panel |

### Focus Indicator

The currently focused node has a visible focus ring (distinct from hover highlight and selection highlight). When a node is focused via keyboard, the tooltip appears as it would on mouse hover.

### Modifier Keys

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Keyboard Modifier Vocabulary for modifier key semantics. The Shift modifier for upstream dependency highlighting (see § Interaction States) also works with keyboard focus — holding Shift while a node is focused reverses the transitive highlight direction.

### Accessibility

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Accessibility for the shared accessibility approach (ARIA roles, focus indicators). Graph nodes are focusable elements with labels announcing node type and name.


## Cross-View Navigation

The graph view participates in the visualizer's cross-view navigation system. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) for view switching, "Show in Tree" actions, shared filter vocabulary, and other shared behaviors.

---

## Design Principles

- **Direct Manipulation** — Prefer controls that let users interact with the thing itself, not a proxy.
- **Make the Invisible Visible** — Forces are invisible; make their effects visible (field rings, spring tension, balance indicators).
- **Spatial Encoding** — Use physical layout to communicate structure; position beats labels.
- **Tight Feedback Loops** — Changes should be immediately visible; the display and the thing being displayed should be one.
- **Progressive Disclosure** — Show the essential, reveal the detailed on demand.
