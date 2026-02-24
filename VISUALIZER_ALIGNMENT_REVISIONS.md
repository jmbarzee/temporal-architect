# Visualizer Alignment Revisions

**Source:** Semantic changes in spec (VIEW_FRAMEWORK.md, GRAPH_VIEW.md) + newly specced features not yet implemented

---

## Summary

**Stale (4 items — implementation contradicts new spec):**

1. The graph still uses `LevelSelector` (a contiguous numeric range control) instead of five independent type-toggle buttons. The visibility filter tests `node.level` against a range rather than testing `node.nodeType` against a set of enabled types.
2. The graph defaults to level range `[1, 2]` (Namespace + Worker), not Workers + Workflows ON.
3. Edge graduation is not implemented. When a node type is hidden, edges whose endpoints become invisible are simply dropped. The spec requires graduated edges that skip hidden layers and project dependency edges to the nearest visible ancestor.
4. Cross-view navigation from tree → graph centers on the bare target node at a fixed `1.2` zoom scale. The spec requires fitting the target and its immediate neighbors (local-first orientation).

**Missing (4 items — spec features not yet in code):**

5. Glanceable block summaries in the tree (collapsed headers) and node summaries in the graph (secondary labels).
6. Info panel for selected graph nodes (identity, connection counts, blast radius, navigation links).
7. Dependency direction indicator label ("dependencies" / "dependents") near hovered graph node.
8. Density management: label elision at low zoom levels; zoom-dependent node detail reduction.

**Already aligned:**
- Tree view filter bar matches the spec: file chips + five type toggles (from `DEF_TYPE_CONFIGS`) + search input. Default state correct: Workers + Workflows ON.
- Arrowheads rendered at rest on dependency edges; containment edges are dashed with no arrowhead. Correct.
- Graph construction pipeline (6-step build, orphan detection, Worker→Worker and NS→NS derived edges). Correct.
- Shift+hover upstream traversal with transitive highlighting. Correct.
- Aggregate hidden-match badge on the graph search control. Correct (partial — per-toggle breakdown is missing, covered in Group 6).
- Force simulation, control panel (4 equation sections), force field visualization, per-level charge highlighting. All aligned.
- Error handling headers (collapsible, shown/hidden file grouping) in both views. Aligned.
- Live reload transition flash in tree view. Aligned.
- Cross-view tab switching and filter adjustment sequence. Structurally aligned (filter adjustment references wrong state variable — fixed in Group 4).

---

## Group 1: Replace Level Selector with Unified Type Toggle Bar

**Status:** stale
**Spec:** VIEW_FRAMEWORK.md § Unified Filter Bar; GRAPH_VIEW.md § Type Filtering
**Files:**
- `tools/visualizer/src/components/GraphView.tsx`
- `tools/visualizer/src/components/LevelSelector.tsx` — delete
- `tools/visualizer/src/styles/index.css` — remove `.level-selector` and `.level-seg*` styles
**Parallelism:** All three changes are coupled; do in a single pass. Groups 2 and 4 depend on this group.
**Change type:** Semantic

The graph currently holds `levelRange: LevelRange` state (`[1, 2]` by default) and renders `<LevelSelector>` — a 3-segment drag-to-select range picker that constrains the visible set to a contiguous level range. The spec replaces this entirely with five independent type toggle buttons, matching the tree view's filter bar.

**What to replace in `GraphView.tsx`:**

1. Remove the `levelRange` state and the `LevelRange` / `LevelSelector` imports.
2. Add `visibleTypes: Set<string>` state, initialized to `new Set(DEF_TYPE_CONFIGS.filter(c => c.defaultOn).map(c => c.type))` — this produces `{workerDef, workflowDef}`, matching the spec default.
3. Rewrite the visibility filter memo (currently `node.level < minL || node.level > maxL`). The new test maps each `SimNode.nodeType` string to the corresponding `defType` key and checks presence in `visibleTypes`:

   ```
   nodeType-to-defType mapping:
     namespace    → namespaceDef
     worker       → workerDef
     workflow     → workflowDef
     activity     → activityDef
     nexusService → nexusServiceDef
   ```

4. Replace `<LevelSelector>` in the JSX with type toggle buttons. The graph can reuse the same `DEF_TYPE_CONFIGS` array and the same button markup pattern as the tree view, so the bars are visually identical.
5. Remove the level-range reheat effect (currently watches `prevRange` vs `levelRange`). Add a new effect that watches `visibleTypes` changes and seeds newly visible nodes at their nearest visible ancestor position before reheating.
6. Delete `LevelSelector.tsx` and remove its CSS rules.

The spec layout for both bars:
```
[file chips...] | [NS] [Worker] [Wf] [Act] [Nxs] | [🔍 search]
```

The graph's existing file chip and search controls stay in place; only the middle section changes.

---

## Group 2: Graph Defaults — Workers + Workflows ON

**Status:** stale
**Spec:** VIEW_FRAMEWORK.md § Initial Defaults
**Files:**
- `tools/visualizer/src/components/GraphView.tsx`
**Parallelism:** Addressed as a one-line consequence of Group 1. The initial `visibleTypes` value from Group 1 already produces the correct default. Document explicitly so it is not overlooked.
**Change type:** Semantic

The current default `[1, 2]` maps to Namespace + Worker. The spec requires Workers + Workflows ON; Namespaces, Activities, and NexusServices OFF. Once Group 1 initializes `visibleTypes` from `DEF_TYPE_CONFIGS.filter(c => c.defaultOn)`, the default is automatically correct because `DEF_TYPE_CONFIGS` already marks `workerDef` and `workflowDef` as `defaultOn: true` and the other three as `defaultOn: false`.

Verify: after Group 1, confirm the initial graph render shows Worker and Workflow nodes only. No additional code change should be needed beyond Group 1.

---

## Group 3: Edge Graduation

**Status:** stale
**Spec:** GRAPH_VIEW.md § Edge Graduation; GRAPH_VIEW.md § Type Filtering (table of visible-type examples)
**Files:**
- `tools/visualizer/src/components/GraphView.tsx` — replace visibility filter memo
- `tools/visualizer/src/graph/build.ts` — no changes (full edge set already built)
**Parallelism:** Depends on Group 1 (type toggles must exist before graduation can reference visible types). The graduation algorithm itself can be designed and tested in isolation before wiring in.
**Change type:** Semantic

Currently `visibleEdges` is:
```typescript
const vEdges = sim.edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId))
```

This drops every edge whose source or target is in a hidden type. The spec says these edges must graduate.

**Graduation rules:**

**Containment edges — skip hidden intermediate levels:**

For each containment edge `(child → parent)`:
- If both `child` and `parent` are in `visibleIds`: keep the edge as-is.
- If `child` is visible but `parent` is hidden: walk up `parent.parentId` until a visible ancestor is found. If found, emit a graduated containment edge `(child → ancestor)`. If no visible ancestor, the child floats free (no containment edge).
- If `child` is hidden: drop the edge (child is not rendered).

**Dependency edges — project to nearest visible ancestor:**

For each dependency edge `(source → target)`:
- If both `source` and `target` are in `visibleIds`: keep as-is.
- If `source` is hidden: find nearest visible ancestor of `source` via `parentId` chain.
- If `target` is hidden: find nearest visible ancestor of `target` via `parentId` chain.
- If both resolved ancestors are visible and are not the same node (discard self-loops): emit a projected dependency edge between them. Deduplicate across projections (same source+target pair from multiple hidden L3 pairs should collapse to one edge).
- If either side has no visible ancestor: drop the edge.

The core primitive needed is `findNearestVisibleAncestor(nodeId, visibleIds, nodeMap)` — walk `parentId` until either a visible node is found or the chain ends.

The graduated edges have the same `edgeType` as their source edges (containment stays containment, dependency stays dependency, nexusDependency stays nexusDependency). The canvas rendering code already handles all three styles and does not need changes.

**Examples from the spec table:**

| Visible Types | Expected behavior |
|---------------|-------------------|
| NS + Wf + Act | L3 nodes attach to their grandparent NS via graduated containment; NS↔NS deps present |
| Worker + Wf   | Worker↔Wf containment; Worker→Worker deps; Wf→Wf deps |
| Wf + Act + Nxs | L3→L3 deps only; no containment (no parent types visible) |

---

## Group 4: Cross-View Orientation — Local-First Graph Navigation

**Status:** stale
**Spec:** VIEW_FRAMEWORK.md § Orientation; VIEW_FRAMEWORK.md § "Show in [View]" Action step 4
**Files:**
- `tools/visualizer/src/components/GraphView.tsx`
**Parallelism:** Depends on Group 1 (the filter adjustment logic must reference `visibleTypes` not `levelRange`). Small scope; can be done as part of Group 1 or immediately after.
**Change type:** Semantic

The pending navigation handler (lines 370–402) currently:
1. Adjusts `levelRange` to include the target node's level — this must change to `setVisibleTypes(prev => new Set(prev).add(defType))`.
2. Sets `pendingCenterRef.current = { nodeId: targetNode.id }`, which is later resolved in the animation loop to center on the bare node at `Math.max(prev.scale, 1.2)`.

The spec requires centering on the target **and its immediate neighbors** — a local-first orientation. The existing `handleDoubleClickNode` handler already implements this correctly:

```typescript
const neighborIds = new Set<string>([id])
for (const edge of sim.edges) {
  if (edge.sourceId === id) neighborIds.add(edge.targetId)
  if (edge.targetId === id) neighborIds.add(edge.sourceId)
}
const neighbors = sim.nodes.filter(n => neighborIds.has(n.id))
setViewport(fitToView(neighbors, width, height, 80))
```

Apply this same pattern in the `pendingCenterRef` handler inside the animation loop. Replace the fixed-scale single-node centering with `fitToView(neighborNodes, width, height, 80)`.

Note: the spec also calls for a viewport lock on the target node until the simulation stabilizes, which the user can break by panning/zooming. The COM-drift compensation already exists (`lastComRef`) and is disabled when `selectedNodeId` is set — the locking behavior is partially present. A full lock would additionally disable user-initiated pan until the simulation is stable or the user pans, which is a refinement that can follow the neighborhood zoom fix.

---

## Group 5: Glanceable Summaries — Tree Blocks and Graph Nodes

**Status:** missing
**Spec:** TREE_VIEW.md § Block Summaries; GRAPH_VIEW.md § Node Summaries; PRODUCT.md § Glanceable summaries
**Files:**
- `tools/visualizer/src/components/blocks/DefinitionBlock.tsx` — tree block summaries
- `tools/visualizer/src/components/GraphCanvas.tsx` — graph node secondary labels
- `tools/visualizer/src/components/GraphView.tsx` — pass summary data to canvas
- `tools/visualizer/src/components/blocks/blocks.css` — summary text styles
**Parallelism:** Tree block summaries and graph node summaries are independent. Each can be implemented in parallel. Graph node summaries should wait for Group 3 (graduation) so counts reflect visible edges correctly.
**Change type:** Semantic

**Tree block summaries:**

Each collapsed definition header needs a secondary annotation rendered to the right of the signature in a smaller, muted font. The annotation is hidden when the block is expanded. Zero counts are omitted.

| Type | Summary content |
|------|----------------|
| Workflow | `12 steps · 3 calls · 2 handlers` |
| Activity | `5 steps` |
| Worker | `3 workflows · 1 activity` |
| Namespace | `4 workers · 2 endpoints` |
| NexusService | `2 async · 1 sync` |

All data is available from the AST fields already passed into `DefinitionBlock.tsx`. A helper function `computeSummary(def)` can derive each string without additional data fetching.

Add a `.block-summary` CSS class: `font-size: 0.8em; opacity: 0.55; margin-left: 8px; white-space: nowrap`.

**Graph node summaries:**

Nodes render a secondary label below/beside the name label:

| Level | Summary |
|-------|---------|
| L1 (Namespace) | `N workers` (count visible Worker children) |
| L2 (Worker) | `Nwf · Mact` (visible L3 by type) |
| L3 (Definition) | `→N ←M` (outgoing + incoming visible dependency edges) |

Counts are derived from the visible edge set (`visibleEdges`) — they must reflect only currently visible nodes (filter-as-source-of-truth). Compute a `Map<string, string>` of node summaries in the `GraphView` visibility memo and pass it as a prop to `GraphCanvas`. In the canvas draw loop, after drawing the name label, draw the summary in a smaller font at reduced opacity.

The spec states summaries are the first thing elided at low zoom — implement this as a check in the canvas draw loop: skip summary rendering when `viewport.scale < 0.5` (threshold to be tuned). This is the first elision step in Group 8.

---

## Group 6: Info Panel for Selected Graph Nodes

**Status:** missing
**Spec:** GRAPH_VIEW.md § Interaction States — Selection, Info Panel
**Files:**
- new file: `tools/visualizer/src/components/GraphInfoPanel.tsx`
- `tools/visualizer/src/components/GraphView.tsx` — wire panel into layout; compress canvas when panel is open
**Parallelism:** Fully independent of Groups 1–4. Can be built in any order. The transitive traversal it needs (`getTransitiveDeps`) already exists in `tools/visualizer/src/graph/highlight.ts`.
**Change type:** Semantic

Currently clicking a node selects it (dependency highlight persists; "Show in Tree" button appears in the header) but no structured panel opens. The spec defines a panel anchored to one side of the canvas showing:

1. **Identity** — name, type icon + label, parent name (worker for L3, namespace for L2), source file.
2. **Connections** — immediate dependency counts: N outgoing ("depends on"), M incoming ("depended on by"), broken down by level when mixed.
3. **Blast radius** — transitive upstream count: "If this changes, N definitions across M workers in K namespaces are affected." Reuse `getTransitiveDeps(nodeId, visibleEdges, visibleIds, 'upstream')`.
4. **Navigation** — clickable list of connected nodes (click to select that node). "Show in Tree" action (already implemented in the header button; move into the panel).

**Layout:** The panel anchors to the right side of the canvas and compresses the canvas area (not an overlay). When `selectedNodeId` is non-null, the `.graph-view` container switches to a row layout with the canvas on the left and the panel on the right. Deselecting (background click or Escape) removes the panel and restores the full-width canvas.

**Panel lifecycle:**
- Appears on node click (or Enter on focused node).
- Updates immediately when a different node is selected (no animation required).
- Dismisses on deselect.
- Persists across simulation ticks.

The metrics (connection counts, blast radius traversal) reuse data already computed for hover highlighting. No new graph traversal algorithms are needed.

---

## Group 7: Dependency Direction Indicator Label

**Status:** missing
**Spec:** GRAPH_VIEW.md § Interaction States — Hover: Dependency Highlighting (direction indicator)
**Files:**
- `tools/visualizer/src/components/GraphCanvas.tsx`
- `tools/visualizer/src/components/GraphView.tsx` — add `shiftHeld` to `GraphCanvasProps`
**Parallelism:** Small, independent. Can be done alongside any other group.
**Change type:** Semantic

When a node is hovered and `highlightedNodes` is active, the spec requires a subtle text label near the hovered node reading "dependencies" (default, downstream) or "dependents" (Shift held, upstream). This makes the Shift modifier discoverable.

`shiftHeld` is already tracked in `GraphView` state but is not passed to `GraphCanvas`. Add it to `GraphCanvasProps` and pass it through. In the canvas draw loop, after drawing the hovered node's name label, draw an additional small label:

```
"dependencies"   (when shiftHeld is false and highlightedNodes is active)
"dependents"     (when shiftHeld is true and highlightedNodes is active)
```

Style: approximately `9px`, opacity `0.5`, below the name label or offset to the side. No background fill.

---

## Group 8: Density Management — Label Elision and Zoom-Dependent Detail

**Status:** missing
**Spec:** GRAPH_VIEW.md § Performance Considerations — Visual Density; PRODUCT.md § Density management
**Files:**
- `tools/visualizer/src/components/GraphCanvas.tsx`
**Parallelism:** Depends on Group 5 (summaries must exist before they can be elided). Otherwise independent of other groups.
**Change type:** Semantic

Currently labels are always drawn regardless of zoom level. The spec defines a progressive elision strategy as `viewport.scale` decreases:

1. **Summary badges elide first** (`scale < ~0.5`): hide node summary secondary labels before the primary name label. Already gated in Group 5's implementation.
2. **Name labels elide second** (`scale < ~0.25`): hide name labels entirely — show only the color-coded shape. Exception: always show the label for the currently hovered or selected node regardless of zoom.
3. **Node detail reduces** (`scale < ~0.1`): reduce node rendering complexity — drop any icon overlays, reduce border thickness, potentially render as plain filled dots. Nodes remain clickable and hoverable at all zoom levels.

These thresholds are approximate and should be calibrated against real data. The scale check is a simple addition to the canvas draw loop immediately before each optional rendering step.

The `truncateLabel` function already handles horizontal overflow by width — the new zoom elision is a separate orthogonal check (`if (viewport.scale < LABEL_ELIDE_THRESHOLD) return` before drawing the label at all).

---

## Execution Order

```
Group 1: Replace Level Selector with Type Toggles   [BLOCKING for 2, 4]
    |
    +-- Group 2: Edge Graduation                     [depends on 1]
    |
    +-- Group 4: Cross-View Orientation Fix          [depends on 1]

Group 3: Graph Defaults                              [subsumed by Group 1]

Group 5: Glanceable Summaries (tree + graph)        [independent; graph half benefits from Group 2]
Group 6: Info Panel                                 [independent]
Group 7: Direction Indicator Label                  [independent, smallest scope]
Group 8: Density Management                         [independent; depends on Group 5]
```

Groups 1, 2, and 4 address the stale items and are the critical path. Groups 5–8 are additive new features and can proceed in parallel with or after the stale fixes.
