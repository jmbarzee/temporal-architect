---
description: "Interactive architecture visualizer for Temporal systems — namespace→worker→workflow topology as a graph and an inline-expanding tree."
---
## Visualizer

An interactive view of the system defined in `.twf` — open any file as a **Graph View** (namespace → worker → workflow topology with dependency edges) or a **Tree View** (collapsible blocks; expand a call to see the target's body inline).

![Graph View — namespace to worker to workflow topology with dependency edges](images/graph-view-system.png)

![Tree View — a workflow expanded with inline call expansion and color-coded blocks](images/tree-view-expanded.png)

- **Graph View** — a force-directed graph with three node levels (namespace → worker → workflow) and dependency edges; semantic zoom selects which levels are visible.
- **Tree View** — every definition as a collapsible, color-coded block; expand a call to see the target's body inline; filter and search.
