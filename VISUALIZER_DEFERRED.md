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
| Selection Info Panel | Detail panel shown when a graph node is selected |
| Level 3 Per-Type Visibility Toggle | Show/hide workflow vs activity vs nexus at L3 independently |
| Force Parameter Presets | Named presets for simulation force parameters |
| Nexus Edge Scope Highlighting | Highlight all edges sharing a nexus service/endpoint on hover |
| Animated Level Transitions | Smooth force interpolation when changing level range (currently instant visibility + reheat) |
| Barnes-Hut Approximation | Perf optimization for large graphs — O(n log n) charge force |
