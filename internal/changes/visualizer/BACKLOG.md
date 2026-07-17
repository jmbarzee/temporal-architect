# Visualizer Backlog

Deferred features and design ideas. Not committed to any cycle — just a place to drop thoughts.

---

## Blocked on Parser / DSL Changes

| Feature | What's Needed |
|---------|---------------|
| Handler "Show Callers" | Send-side DSL syntax (signal/query/update send statements) |
| Message Flow Edges | Send-side DSL syntax |
| Edge Opacity/Thickness for Traffic | Multiplicity data in AST for *design* graphs. Now available for *observed* graphs — see "Observed-graph time series" below. |
| Namespace Endpoint Task Queue | `NamespaceEndpoint` AST type needs a task queue field |

---

## Unblocked — Interaction Refinements

| Feature | Notes |
|---------|-------|
| Cross-View Filter Sync | Shared filter vocabulary with synced state across Tree/Graph |
| Multi-Select Modifier (Tree) | Shift/Ctrl click for multi-selection in tree view |
| Bulk Expand/Collapse | `Ctrl+Shift+Right/Left` to expand/collapse all at current level |
| Multi-Select (Graph) | Select multiple nodes in graph view |
| Node Selection + Info Panel | Click-to-select with persistent highlight state, a structured info panel (identity, connections, blast radius, navigation list, "Show in Tree"), and stable selection target for cross-view actions. Motivation: hover is transient — selection locks context while the user reads a panel or pans the canvas. The hover info tooltip serves the immediate discoverability need. Original spec in GRAPH_VIEW.md § Selection and § Info Panel. |
| Unified Filter Bar | Replace graph level selector with shared type toggles + edge graduation (now specced in VIEW_FRAMEWORK.md § Unified Filter Bar, GRAPH_VIEW.md § Type Filtering) |
| Force Parameter Presets | Named presets for simulation force parameters |
| Save / Load Layout State | Persist the live working state between sessions: the tuned force settings (`ForceParams`) and the node distribution (settled node positions), restored on reload. Distinct from named presets — this is the current working layout, not a curated set. The post-WS3 id-keyed `ForceParams` shape (maps keyed by `NodeType`/`EdgeTypeId`) serializes cleanly for this. |
| Nexus Edge Scope Highlighting | Highlight all edges sharing a nexus service/endpoint on hover |
| Animated Type Transitions | Smooth force interpolation when toggling types (now specced in GRAPH_VIEW.md § Type Transitions) |
| Barnes-Hut Approximation | Perf optimization for large graphs — O(n log n) charge force |
| Diagnostic Summary Pill in Tab Bar | Originally Group 4 of REVISIONS_005. Render `N✗` / `N⚠` pills next to the Tree/Graph tab buttons sourced from `ast.summary.errors`/`warnings`. Deferred because the errors header already renders directly below the tab bar (minimal value-add), and a clickable variant ("expand the header") would require new cross-component state coordination between `WorkflowCanvas` and its child views. |
| Inject node/edge config into the forces panel | Make the forces panel + simulation accept the node-type and edge-type taxonomy as injected config (props/context) rather than importing `NODE_TYPE_REGISTRY` / `EDGE_TYPE_REGISTRY` as module singletons: node types with set/family + order (so the band-gravity plot lays out sensibly), edge types as ordered node-type pairs. The post-WS3 registries + id-keyed `ForceParams` already make everything derive from the taxonomy, so this is the natural next step. |
| Schema-driven control visibility | Show only the controls for node/edge types actually present after filtering — e.g. hide nexus tokens/columns/edges when the nexus filter is off, or show only edge controls when the visible set is edges-only. Reads the enabled filters / post-filter type set against the registries. High value for new users and small graphs; depends on the registries + filter state (and pairs well with the config-injection item above). |
| Decomposition group overlay polish | The Graph-view chunk-decomposition overlay shipped read-only. Its deferred polish — recompute (editable params + host round-trip), smarter coloring (structural map-coloring + stable semantic hue), glow-metric encoding, cohesion force, and advisory surfacing — is owned by the chunks workstream: see [`internal/changes/temp-change-set/chunks/BACKLOG.md`](../temp-change-set/chunks/BACKLOG.md) § Deferred — decomposition overlay. |

---

## Observed-graph time series

The sampler now emits an `observedGraph` payload (`observe.ObservedGraph`) with a per-edge occurrence time series (`ObservedEdge.buckets`) on an absolute-time `window`, plus the existing `coarsenedEdges[].weight`. The client projection in `types/payload.ts` (`observedToParserGraph`) currently **drops the buckets** — the graph renders structurally, ignoring volume/time. These features are unblocked by that wire data (no parser/DSL change needed):

| Feature | Notes |
|---------|-------|
| Edge weight → thickness/opacity | Carry `sum(buckets)` (and `coarsenedEdges.weight` at worker/namespace tier) onto the view `GraphEdge` and drive stroke width/opacity in `GraphCanvas`. Wire data already present; the projection just needs to stop discarding it. |
| Time-based edge appear/decay | Iterate `buckets` against `window` (`since`/`until`/`buckets`) to animate edges fading in/out over the sampled window — a playback scrubber over the graph. Needs a time-axis UI control and a per-frame edge-visibility/intensity pass; the bucket series is the data source. |
| Node "heat" | Blocked on the sampler emitting a per-node series (`ObservedNode.buckets`) — tracked in the reverse-history backlog. Once present, encode node throughput the same way. |

Consuming this only affects the observed-graph (history) path; `.twf` design graphs have no time series.

---

## Code Health / Maintainability

| Item | Notes |
|------|-------|
| Decompose `src/styles/index.css` | One ~2.4k-line stylesheet holds styles for every component (panels, tree, graph, blocks, controls, theme). Split by feature/component (or co-locate `*.css` next to each component, or adopt CSS modules) so styles live with the code that uses them. The new `components/controls/` extraction is a natural first slice to co-locate. Not urgent; large but mechanical. |
