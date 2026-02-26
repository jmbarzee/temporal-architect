# Visualizer Alignment Changes

**Source review:** `review-alignment-visualizer`
**Revision file:** `VISUALIZER_ALIGNMENT_REVISIONS.md`

## Summary

Aligned the graph view implementation to the spec across type filtering, edge graduation, cross-view navigation, and density management. Replaced the level-range selector with the unified type toggle bar, implemented edge graduation for hidden types, added glanceable summaries to both views, replaced the specced selection/info-panel model with a hover info tooltip, and added progressive label elision at low zoom. Node shape was also unified — all nodes now render as circles.

## Changes by Type

### Semantic

**Type filtering (Groups 1 + 2)**
- `GraphView.tsx`: Removed `LevelSelector` / `levelRange` state. Added `visibleTypes: Set<string>` initialized from `DEF_TYPE_CONFIGS.filter(c => c.defaultOn)` → Workers + Workflows ON by default.
- `GraphView.tsx`: Filter bar replaced with shared `canvas-header` structure (file chips → divider → type toggles → divider → search), identical markup to tree view. Graph-specific controls (node/edge count, Fit, Play/Pause, Show in Tree) moved to a `graph-toolbar` below the filter bar.
- `GraphView.tsx`: `nodeTypeToDefType()` / `defTypeToNodeType()` helpers map between graph `nodeType` strings and AST `defType` keys.
- `LevelSelector.tsx`: Deleted.
- `index.css`: Removed all `.level-selector` / `.level-seg*` rules. Added `.graph-toolbar`, `.graph-toolbar-count`, `.graph-toolbar-btn`. Added `.graph-view .canvas-header` context override (no border-radius, no shadow, flush bar).

**Edge graduation (Group 3)**
- `GraphView.tsx`: Replaced flat `visibleEdges` filter with a graduation algorithm in the visibility memo.
  - Containment edges: if child is visible but parent is hidden, walk `parentId` chain to nearest visible ancestor and repoint the edge there. Hidden children drop their edge.
  - Dependency / nexusDependency edges: project hidden endpoints to nearest visible ancestor via `findNearestVisibleAncestor()`. Discard self-loops. Deduplicate projected edges by `sourceId→targetId` key.
- `GraphView.tsx`: `findNearestVisibleAncestor()` helper added at module level.
- `GraphView.tsx`: `prevVisibleTypes` effect seeds newly visible nodes at their nearest currently-visible ancestor position before reheating.

**Cross-view orientation (Group 4)**
- `GraphView.tsx`: Pending-navigation handler now uses `setVisibleTypes(prev => ...)` instead of old `setLevelRange`. Cross-view center resolves using `fitToView(neighborNodes, width, height, 80)` (local-first: target + immediate neighbors) rather than fixed `1.2` scale on the bare target node.

**Glanceable summaries (Group 5)**
- `DefinitionBlock.tsx`: Added `computeSummary(def)` helper. Collapsed block headers render a `.block-summary` span to the right of the signature (hidden when expanded). Zero counts omitted. Format per type: Workflow `N steps · M calls · K handlers`; Activity `N steps`; Worker `N workflows · M activities`; Namespace `N workers · M endpoints`; NexusService `N async · M sync`.
- `blocks.css`: Added `.block-summary { font-size: 0.8em; opacity: 0.55; margin-left: 8px; white-space: nowrap; font-family: var(--font-mono); }`.
- `GraphView.tsx`: Added `computeGraphNodeSummary()` helper. Visibility memo computes `nodeSummaries: Map<string, string>` from the graduated visible edge set and passes it to `GraphCanvas`.
- `GraphCanvas.tsx`: Added `nodeSummaries` prop. After the name label, draws summary in 9px font at 0.55 opacity; elided when `viewport.scale < 0.5`.

**Selection / info panel model change (Group 6 → deferred)**
- `GRAPH_VIEW.md`: § Selection and § Info Panel replaced with deferred stubs referencing `VISUALIZER_DEFERRED.md`.
- `GRAPH_VIEW.md`: § Hover: Dependency Highlighting expanded — tooltip now carries identity (name, type icon, parent, file), immediate connection counts, and direction indicator in a single hover interaction.
- `VISUALIZER_DEFERRED.md`: "Selection Info Panel" row expanded to "Node Selection + Info Panel" with motivation context.
- `VISUALIZER_SPEC_CHANGES.md`: New file documenting the model change.

**Hover info tooltip (Group 7)**
- `GraphView.tsx`: Wrapped `<GraphCanvas>` in `.graph-canvas-area` div. Added `GraphHoverTooltip` component rendered as a DOM overlay (not canvas-drawn). Tooltip position derived from `worldToScreen(viewport, node.x, node.y)`. Content: type icon, node name, parent name, source filename, outgoing/incoming dep counts, direction indicator ("dependencies" / "dependents" per `shiftHeld`).
- `index.css`: Added `.graph-canvas-area` (flex wrapper, `position: relative`). Added `.graph-hover-tooltip` and sub-element styles (`pointer-events: none`, `transform: translate(14px, -50%)`).

**Node shape unification**
- `GraphCanvas.tsx`: All nodes now render as circles. `NODE_SIZES` updated to `{ w: 2r, h: 2r, r }` for all levels (L1 r=18, L2 r=13, L3 r=9). Removed all `if (node.level === 3)` shape branches — shape, orphan ring, search ring, selection ring, and focus ring all use `ctx.arc`. Labels now position below the circle (`sy + s.r + 12`) for all levels. Hit testing uses circular distance check. `drawRoundedRect` function removed.

**Density management (Group 8)**
- `GraphCanvas.tsx`: Added named scale constants: `SUMMARY_ELIDE_SCALE = 0.5`, `LABEL_ELIDE_SCALE = 0.25`, `DETAIL_REDUCE_SCALE = 0.1`.
- `GraphCanvas.tsx`: Added `hoveredNodeId` to `GraphCanvasProps` and `DrawData`.
- `GraphCanvas.tsx`: Name labels elided below `0.25`; always drawn for the hovered or selected node. Summaries nested inside the label gate (can't show without the name label). Orphan ring and focus ring dropped below `0.1`.
- `GraphView.tsx`: `hoveredNodeId` passed to `<GraphCanvas>`.
