# Graph View

A second view for the Visualizer. The existing tree view shows definitions in isolation. This graph view shows **how definitions relate to each other** — which namespaces depend on which, how workers compose, and where workflows call across boundaries.

---

## User Goals

This view serves goals 6–9 (system architecture questions) from [PRODUCT.md](./PRODUCT.md) § User Goals.

---

## Graph Data Model

### Node Types (3 levels of a hierarchy)

| Level | Node Type    | Derived From                            |
|-------|--------------|-----------------------------------------|
| 1     | **Namespace** | Namespace definition                   |
| 2     | **Worker**    | Worker instantiation within a namespace |
| 3     | **Workflow**  | Workflow registered on a worker         |
| 3     | **Activity**  | Activity registered on a worker         |
| 3     | **NexusService** | Nexus service registered on a worker |

Level 3 contains all definition types that are registered on a Worker. These form a strict containment hierarchy: every Level 3 node belongs to exactly one Worker, and every Worker belongs to exactly one Namespace.

**Future:** Per-type visibility toggle at Level 3, allowing users to show/hide Workflows, Activities, and NexusServices independently.

### Fundamental Edges

**Containment edges** come from registration:

1. **Level 3 node → Worker** ("member of") — A workflow, activity, or nexus service is registered on a specific worker.
2. **Worker → Namespace** ("member of") — A worker is instantiated within a specific namespace.

**Dependency edges** come from cross-boundary calls. Only calls that cross a Worker boundary are included — same-worker calls are implicit in the containment hierarchy.

1. **Workflow → Workflow** ("calls") — A workflow calls or awaits another workflow on a different worker.
2. **Workflow → Activity** ("calls") — A workflow calls an activity on a different worker.
3. **Workflow → Workflow via nexus** ("calls via nexus") — A workflow calls a nexus operation whose backing workflow is on a different worker (or in a different namespace). The edge connects caller to backing workflow directly; the nexus service and operation are metadata on the edge, not intermediary nodes.

Nexus edges are visually distinct from direct call edges. Hovering a nexus edge reveals the endpoint, service, and operation. Edges sharing a nexus service or endpoint can be highlighted together to show shared scope.

### Derived Edges (Graph Coarsening)

Higher-level dependency edges are **derived** by projecting Level 3 dependency edges upward through the containment hierarchy:

1. **Worker → Worker** ("depends on") — Exists when any Level 3 node in Worker A depends on any Level 3 node in Worker B. Discard self-loops.
2. **Namespace → Namespace** ("depends on") — Exists when any Worker in Namespace A depends on any Worker in Namespace B. Discard self-loops.

### Graph Construction Order

1. Build Namespace nodes from namespace definitions.
2. Build Worker nodes from worker instantiations; attach each to its parent Namespace.
3. Build Workflow, Activity, and NexusService nodes from registrations on each worker; attach each to its parent Worker.
4. Resolve cross-worker dependency edges:
   a. Workflow → Workflow edges from cross-worker workflow calls and awaits.
   b. Workflow → Activity edges from cross-worker activity calls.
   c. Workflow → Workflow (via nexus) edges by tracing nexus calls through to their backing workflows.
5. Project Level 3 dependencies up to Worker-level; discard self-loops.
6. Project Worker-level dependencies up to Namespace-level; discard self-loops.

### Orphan Definitions

The containment hierarchy assumes every Level 3 node belongs to a Worker and every Worker belongs to a Namespace. But the DSL allows definitions without assignments — a workflow not registered on any worker, a worker not placed in any namespace.

**Treatment:** Orphan definitions appear in the graph as uncontained nodes, visually distinct from contained ones (e.g., positioned outside any grouping, with a subtle "unassigned" indicator such as a dashed outline or muted badge). They participate in dependency edges normally.

**Type filtering behavior:**
- Orphan workers (no namespace) are visible when the Worker type toggle is on.
- Orphan Level 3 nodes (no worker) are visible when their specific type toggle (Wf, Act, or Nxs) is on.
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
| **Center**        | All nodes        | A weak drift toward the viewport center to keep the graph from wandering. |

Each force has a **strength** parameter that controls its magnitude. These strengths are the primary tuning knobs for the layout.

### Force Parameters

The simulation has **8 core force strengths** — one per force category — plus shape controls and dynamics that govern how those forces behave.

**Charge strengths** (3, one per level — negative values, repulsion):
- Level 1 (Namespace) node repulsion
- Level 2 (Worker) node repulsion
- Level 3 (Workflow/Activity/NexusService) node repulsion

**Link strengths** (5, one per edge type — positive values, attraction):
- Namespace ↔ Namespace (dependency)
- Namespace ↔ Worker (containment)
- Worker ↔ Worker (dependency)
- Worker ↔ Level 3 (containment)
- Level 3 ↔ Level 3 (dependency)

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

The graph uses **type toggles** — the same five definition types as the tree view — to control which nodes are visible. Any combination of types is valid. There is no contiguity constraint.

### Type Toggle Control

Five toggle buttons in the filter bar, matching the tree view's type toggles:

**NS** · **Worker** · **Wf** · **Act** · **Nxs**

Each toggle shows/hides all nodes of that type. The toggle buttons use the same color coding as the tree view (dark grey, medium grey, purple, blue, pink). Default state matches the tree view: Workers and Workflows ON; Namespaces, Activities, and NexusServices OFF.

This replaces the previous level range selector. The visual filter bar is now identical across both views (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Unified Filter Bar).

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

Per-level charge strengths (negative values = repulsion):
- L1 Namespace charge
- L2 Worker charge
- L3 Definition charge

**PULL** (connected pairs)

    F = α × pull × k × sign(Δ) × |Δ|^exp / d
    Δ = d − rest × dist

Master parameters that shape all link (attraction) forces:
- `pull` — master multiplier for all spring forces
- `exp` — power of displacement in spring force (1 = linear/Hooke)
- `dist` — master multiplier for all rest distances

Per-edge spring constant (k) and rest distance, displayed as dual-slider rows:
- NS↔NS, NS↔Worker, Worker↔Worker, Worker↔L3, L3↔L3

**GRAVITY** (toward center of mass)

    F = α × gravity × (pos − COM)

- `gravity` — strength of drift toward center of mass

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

**Charge field rings** — Concentric circle outlines around each node showing where the charge force drops to 75%, 50%, and 25% of its peak value. Ring radius is derived from the actual equation: `force(d) = charge / (d² + softening)^(exp/2)`, solved for d at each threshold. Ring color matches the node's type color at low opacity.

**Spring tension coloring** — Edges colored by their current tension state: green when near rest distance, orange when compressed, blue when stretched. Color intensity scales with displacement magnitude.

**Center-of-mass crosshair** — A subtle crosshair at the graph's center of mass with faint drift lines from each node toward the COM, showing the direction and magnitude of the gravity force.

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
| **GRAVITY** | Center-of-mass crosshair with drift lines appears |
| **DYNAMICS** | No canvas response (dynamics are temporal, not spatial) |

When the user stops hovering, the visualization fades unless the persistent "Show force fields" toggle is on.

### Per-Level Charge Highlighting

Within the PUSH section, hovering an individual charge level slider (L1, L2, or L3) highlights only that level's field rings and dims the others. This lets the user see the reach and strength of one level's charge force in isolation — useful for understanding why nodes at different hierarchy levels settle at different distances.

### Principle

This feedback loop embodies two design principles:
- **Make the Invisible Visible** — forces are abstract numbers; the canvas shows their spatial consequence
- **Tight Feedback Loops** — the user touches a control and immediately sees what it governs, before changing its value

---

## Errors Header

The graph view surfaces parse errors using the shared error handling pattern. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Error Handling. The error bar appears between the graph header controls (filter bar) and the graph canvas. The canvas still renders whatever valid nodes and edges exist in the partial AST.

---

## Search and Filtering

The graph view uses the unified filter bar shared with the tree view (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Unified Filter Bar). All three filter dimensions — source file, definition type, and name search — work identically in both views, with independent state per view.

The graph adds one graph-specific behavior: **edge graduation** (see § Type Filtering above). When a type is toggled off, edges graduate across hidden layers rather than simply disappearing. This means the graph always shows a coherent structure regardless of which types are visible.

### Search and Hidden Matches

Search matches against **all** nodes, not just visible ones. The results are split:

- **Visible matches** — nodes that match the search AND pass the current type and file filters. These are highlighted in the graph.
- **Hidden matches** — nodes that match the search but are excluded by filters (toggled-off type, filtered file). These are NOT shown in the graph.

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
- Show a **tooltip** with the hovered node's full name and type.
- A **direction indicator** reflects the current traversal mode: a subtle label near the hovered node reading "dependencies" (default) or "dependents" (Shift held). This reinforces which direction the highlight is following and makes the Shift modifier's effect discoverable.

The transitive chain follows only **visible edges** — including graduated edges when intermediate types are hidden. If only Namespace is enabled, the chain follows Namespace → Namespace derived edges. If Namespace and Workflow are enabled (Workers hidden), the chain follows graduated containment and L3 dependency edges. This is consistent with filter-as-source-of-truth: the user sees relationships between what's visible, not inferred relationships from hidden data.

### Selection

Clicking a node selects it. A selected node:
- Stays highlighted even after the cursor moves away.
- Retains the dependency highlight from hover (downstream by default, upstream if modifier was held during click).
- Opens the **info panel** (see below).
- Click the background or press Escape to deselect and dismiss the panel.

### Info Panel

The info panel is the structured complement to hover highlighting. Hover answers "let me see the shape of this dependency chain." The info panel answers "let me understand the scope." It serves user questions Q7 (what depends on what), Q8 (blast radius), and Q10 (where is this used).

**Content** (top to bottom):

1. **Identity** — Node name, type icon + label, parent (worker name for L3, namespace name for L2), source file.
2. **Connections** — Immediate dependency counts: N outgoing ("depends on"), M incoming ("depended on by"). Counts broken down by level when mixed (e.g., "→ 3 workflows, 1 activity across 2 workers").
3. **Blast radius** — Transitive upstream count: "If this changes, N definitions across M workers in K namespaces are affected." Computed from the same transitive traversal used for Shift+hover highlighting.
4. **Navigation** — Clickable list of connected nodes (click to select that node instead). "Show in Tree" action.

**Layout:** A panel anchored to one side of the canvas (right or bottom), sized to avoid occluding the selected node. The panel does not overlay the graph — it compresses the canvas area. On narrow viewports, it could overlay with a close button.

**Lifecycle:**
- Appears when a node is selected (click or Enter on focused node).
- Updates immediately if a different node is selected.
- Dismisses on deselect (click background, press Escape).
- Persists across simulation ticks — the selected node may move, but the panel stays open.

**Not yet implemented.** This section describes the target experience. The transitive traversal and dependency counts are already computed for hover highlighting and can be reused.

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
