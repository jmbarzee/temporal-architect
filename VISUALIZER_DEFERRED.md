# Visualizer — Deferred Features

Features identified during spec-to-implementation alignment that are not yet implemented. Grouped by blocker status.

## Blocked on Parser / DSL Changes

| Feature | What's Needed |
|---------|---------------|
| Handler "Show Callers" | Send-side DSL syntax (signal/query/update send statements) |
| Message Flow Edges | Send-side DSL syntax |
| Edge Opacity/Thickness for Traffic | Multiplicity data in AST |
| Namespace Endpoint Task Queue | `NamespaceEndpoint` AST type needs a task queue field |

## Unblocked — Interaction Refinements

| Feature | Notes |
|---------|-------|
| Cross-View Filter Sync | Shared filter vocabulary with synced state across Tree/Graph |
| Multi-Select Modifier (Tree) | Shift/Ctrl click for multi-selection in tree view |
| Bulk Expand/Collapse | `Ctrl+Shift+Right/Left` to expand/collapse all at current level |
| Multi-Select (Graph) | Select multiple nodes in graph view |
| Selection Info Panel | Detail panel shown when a graph node is selected (now specced in GRAPH_VIEW.md § Info Panel) |
| Unified Filter Bar | Replace graph level selector with shared type toggles + edge graduation (now specced in VIEW_FRAMEWORK.md § Unified Filter Bar, GRAPH_VIEW.md § Type Filtering) |
| Force Parameter Presets | Named presets for simulation force parameters |
| Nexus Edge Scope Highlighting | Highlight all edges sharing a nexus service/endpoint on hover |
| Animated Type Transitions | Smooth force interpolation when toggling types (now specced in GRAPH_VIEW.md § Type Transitions) |
| Barnes-Hut Approximation | Perf optimization for large graphs — O(n log n) charge force |
