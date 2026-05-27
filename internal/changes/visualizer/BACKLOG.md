# Visualizer Backlog

Deferred features and design ideas. Not committed to any cycle — just a place to drop thoughts.

---

## Blocked on Parser / DSL Changes

| Feature | What's Needed |
|---------|---------------|
| Handler "Show Callers" | Send-side DSL syntax (signal/query/update send statements) |
| Message Flow Edges | Send-side DSL syntax |
| Edge Opacity/Thickness for Traffic | Multiplicity data in AST |
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
| Nexus Edge Scope Highlighting | Highlight all edges sharing a nexus service/endpoint on hover |
| Animated Type Transitions | Smooth force interpolation when toggling types (now specced in GRAPH_VIEW.md § Type Transitions) |
| Barnes-Hut Approximation | Perf optimization for large graphs — O(n log n) charge force |
| Diagnostic Summary Pill in Tab Bar | Originally Group 4 of REVISIONS_005. Render `N✗` / `N⚠` pills next to the Tree/Graph tab buttons sourced from `ast.summary.errors`/`warnings`. Deferred because the errors header already renders directly below the tab bar (minimal value-add), and a clickable variant ("expand the header") would require new cross-component state coordination between `WorkflowCanvas` and its child views. |
