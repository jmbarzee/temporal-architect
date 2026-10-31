# TWF Visualizer — Product Vision

The TWF Visualizer renders Temporal system architecture from `.twf` as an interactive, explorable interface. It gives developers a visual understanding of their workflow system — both the fine-grained logic of individual definitions and the architectural relationships between them.

Two views compose into a single product:

- **Tree View** — a collapsible, color-coded block list. Answers questions about individual definitions: their logic, inputs/outputs, handlers, and call structure. The familiar interaction model (expand/collapse) makes it the default view on first load.
- **Graph View** — a force-directed dependency graph with type filtering and edge graduation. Answers questions about system architecture: which namespaces depend on which, how workers compose, and where workflows call across boundaries. A "power view" the user discovers via the tab bar.

The views share a visual identity, filtering vocabulary, and interaction patterns. Cross-view navigation lets the user follow a definition from one perspective to the other without losing context.


## User Goals

The visualizer answers two categories of developer questions:

### Individual definitions (served by Tree View)

1. **"What do these workflows do?"** — Read the step-by-step logic of any workflow, activity, or handler through recursive expand/collapse.
2. **"What are the inputs and outputs?"** — See signatures (params → return type) on every definition and call.
3. **"What handlers do these workflows expose?"** — See signal, query, and update declarations grouped at the top of each workflow body.
4. **"What does this call expand to?"** — Inline expansion shows the full body of any referenced workflow, activity, or nexus operation without navigating away.
5. **"What definitions exist in this file or package?"** — Filter and browse definitions by type, source file, and name.

### System architecture (served by Graph View)

6. **"What does this system look like?"** — A spatial overview of all namespaces, workers, and the definitions they host, with edges showing cross-boundary dependencies.
7. **"What depends on what?"** — Trace cross-worker and cross-namespace calls visually.
8. **"What is the blast radius of a change?"** — Hover a node and see its transitive dependents at any level of abstraction.
9. **"How is this namespace composed?"** — Zoom into a namespace to see its workers, then into a worker to see its workflows, activities, and services.

### Cross-cutting (served by both views together)

10. **"Where is this used?"** — Contextual navigation buttons (tree) and dependency highlighting (graph) surface reverse references — who calls this definition, what worker hosts it, what namespace contains it.
11. **"Show me the same thing from the other angle."** — "Show in [View]" navigates from a tree block to its graph node or vice versa, adjusting filters as needed to reveal the target.


## UX Principles

### Progressive disclosure

Collapse by default, expand on demand. Tree blocks start collapsed; the user drills into what interests them. The graph's kind chips default to a sparse view (Workers and Workflows only); the user enables additional kinds to add detail. Information density is always under user control.

### Filter-as-source-of-truth

Filters are always authoritative. No feature bypasses filters — navigation adjusts them. When "Show in [View]" needs to reveal a hidden item, it makes the minimum filter changes required, animates the filter bar to show what changed, and lets the user see exactly what's filtered and reverse it. The user is never surprised by what's visible or hidden.

### Reactive composition

Features (search, filters, hover highlighting, force simulation) share state but don't directly manipulate each other. Each feature reads from shared data and produces its own output. This prevents cascading complexity as new features are added. The spec describes *what* each feature does; the implementation composes them through shared data, not inter-feature wiring.

### Focus + context

Highlight what matters; push everything else to the background. Hover a graph node and its dependency chain lights up while everything else dims. Search a name and matching nodes highlight while non-matches fade. The user always sees both the focal point and its surroundings.

### Direct manipulation

Drag nodes, scrub sliders, click to expand — all with immediate visual feedback. The graph's force simulation responds live to slider changes. Tree blocks expand and collapse on click. The control panel's sliders animating during kind transitions is intended, not built ([#186](https://github.com/jmbarzee/temporal-architect/issues/186)). The user acts on the visualization directly, not through menus or dialogs.

### Glanceable summaries

Every item — a collapsed tree block, a graph node, a filter chip — should communicate its structural role without requiring interaction. A collapsed workflow header that reads "MyWorkflow(params) → Type" tells you the signature; a summary annotation like "12 steps · 3 calls · 2 handlers" tells you the shape. A graph node labeled "OrderService" tells you the name and, through its color/icon/size, its type and tier at a glance; finer structural detail (connectivity like "→3 ←5", composition counts) surfaces in the hover box so the zoomed-out canvas stays legible.

Summaries are secondary information — smaller, muted, never competing with the primary label. They answer "is this worth drilling into?" and reduce the need for speculative expand/collapse. Each view defines its own summary content (see TREE_VIEW.md § Block Summaries and GRAPH_VIEW.md § Node Summaries).

### Density management

The visualizer must remain useful as the system it displays grows. Filters and progressive disclosure handle moderate scale, but large projects (100+ definitions, 50+ visible graph nodes) require explicit density strategies: label elision at zoom levels and detail reduction at distance. Virtualized rendering for long lists is **not** implemented — deferred as [#87](https://github.com/jmbarzee/temporal-architect/issues/87). Each view defines its own density thresholds (see TREE_VIEW.md § Scale Behavior and GRAPH_VIEW.md § Performance Considerations). The goal is graceful degradation — the experience gets simpler at high density, never broken.


## Visual Identity

### Color palette

Each definition type has a dedicated color used consistently across both views. Colors are defined as CSS variables with three values per type:

- `--block-{type}-bg` — gradient background
- `--block-{type}-border` — border color
- `--block-{type}-text` — text/icon color

| Type | Color | Used In |
|------|-------|---------|
| Workflow | Purple | Tree blocks, graph nodes, call blocks |
| Activity | Blue | Tree blocks, graph nodes, call blocks |
| NexusService | Deep pink | Tree blocks, graph nodes, call blocks |
| Worker | Medium grey | Tree blocks, graph nodes |
| Namespace | Dark grey | Tree blocks, graph nodes |

Every color palette has a matching dark variant.

**In the graph, the palette is the taxonomy's declaration**: every style value carries its fill and border in both themes (`color.light`, `color.dark`) beside its size, and every edge type its stroke; the pane carries them as `--gv-node-<suffix>` custom properties in its resolved theme, and the filter chips borrow a value's colour as a tint. The tree's `--block-*` tokens are the host's own.

### Icon system

Tree-block icons are defined in a central theme map (`temporal-theme.tsx`); graph-node icons are each style value's declared `icon` in the taxonomy. Most are Unicode text characters. In tree block headers, workflows and activities use custom SVG icons (interlocking gears and single gear) for clarity at small sizes; the host's theme owns them. Graph nodes and filter chips draw the taxonomy's text glyph.

### Theming

- Auto follows the host — an ancestor's `data-theme`, else the OS colour scheme — and is light when none says otherwise. The library reads only `data-theme`; this host translates the editor's body classes (`.vscode-dark`, the high-contrast classes) into a `data-theme` on its root.
- Dark theme activates via a `[data-theme="dark"]` attribute on an ancestor — set by the shell from the VS Code webview's body classes, or by any other host however it knows its theme; the graph pane also has its own choice — Auto / Light / Dark, persisted — carried as `data-theme` on the pane, so it can be dark in a light host and light in a dark one.
- Hover brightness shifts direction between themes (`0.95` in light, `1.1` in dark).

### Border conventions

| Context | Border weight | Style |
|---------|--------------|-------|
| Top-level definitions (workflow, activity, nexus service) | 2px | Solid |
| Call-level and statement-level blocks | 1px | Solid |
| Handler declarations (signal, query, update) | 1px | Dashed |
| Detached (fire-and-forget) calls | 1px | Dashed |
| Unresolved references | 1px | Dashed + reduced opacity + `?` badge |

### Node shapes (Graph View)

Every node is drawn as a disc of its value's declared radius (`size.r`, the taxonomy's), with its icon inside and its name beside it: 20 for a namespace, worker or nexus service; 15 for a nexus endpoint; 11 for a workflow or nexus operation; 8 for an activity. The containers and hosts read as the large discs, the orchestrators and leaves as the small ones; within a size, colour and icon tell the values apart.

### Node badges (Graph View)

Badges are node **adornments** — small markers drawn beside a graph node, distinct from its name label. Both views describe them consistently through this shared vocabulary.

| Badge | Applies to | Meaning |
|-------|-----------|---------|
| `?` unresolved | — | **Deferred** ([#185](https://github.com/jmbarzee/temporal-architect/issues/185)): unresolved references reach the graph only as warnings in the findings bar; the tree's `?` badge (§ Border conventions) has no graph counterpart yet |
| Orphan ring | Workers, orchestrators and leaves | A dashed ring around a node not contained by any parent (see GRAPH_VIEW.md § Orphan Definitions) |
| Cardinality (`× {param}`) | Namespace / NexusEndpoint | The node is a parameterized family; the host writes one `× {param}` badge per entry in the node's `templateParams` wire field, and the library draws its badges as a chip row (chip count = array length, chip label = bare param name). See GRAPH_VIEW.md § Visual Encoding → Node Appearance. |

### Edge styles (Graph View)

| Edge Type | Line Style | Direction |
|-----------|-----------|-----------|
| Direct dependency | Solid | Arrowhead |
| Nexus dependency | Solid, distinct color | Arrowhead |
| Containment | Dashed | None (undirected) |

Every edge is stroked by its resolved type's declared stroke (colour per theme, alpha, dash, width).
