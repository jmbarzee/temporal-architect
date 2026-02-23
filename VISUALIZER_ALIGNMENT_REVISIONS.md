# Visualizer Alignment Revisions

Spec-to-implementation gap analysis. Spec is authoritative.

## Coverage Summary

| Layer | Implemented | Partial | Missing | Total |
|-------|------------|---------|---------|-------|
| Tree View — Block Rendering | 12 | 1 | 1 | 14 |
| Tree View — Statement Dispatch | 15 | 2 | 2 | 19 |
| Tree View — Call Blocks & Cross-Ref | 13 | 0 | 2 | 15 |
| Tree View — Header & Filters | 5 | 1 | 1 | 7 |
| Tree View — Keyboard Nav & A11y | 0 | 3 | 7 | 10 |
| Tree View — Contextual Navigation | 0 | 0 | 7 | 7 |
| View Framework — Errors & Empty States | 4 | 3 | 1 | 8 |
| View Framework — Tab Switching | 1 | 0 | 4 | 5 |
| View Framework — Live Reload | 1 | 1 | 6 | 8 |
| Graph View | 0 | 0 | 34 | 34 |

**Tree View block rendering and data consumption are substantially complete.** Gaps are in interaction patterns (keyboard, contextual nav), a few rendering omissions (comment blocks, tooltips, detach styling in await context), and one functional correctness issue (missing HandlerContext on inline workflow expansion).

**View Framework** is partially present via the tree-only canvas. Tab switching, cross-view navigation, live reload, and most accessibility are absent.

**Graph View is entirely unimplemented.** All 34 spec features have zero code.

No features are blocked on missing parser data. Two future features (Message Flow Edges, Handler Show Callers) are blocked on send-side DSL syntax, but these are out of scope.

---

## Group 1: Tree View — Functional Correctness Fix ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Added `WorkflowCallHandlerScope` wrapper in `CallBlocks.tsx` that builds a `HandlerContext` from the target workflow's signal/query/update declarations and provides it via `<HandlerContext.Provider>`, mirroring `InlineWorkflowBlock`'s existing pattern.

---

## Group 2: Tree View — Rendering Gaps ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

1. Added `CommentBlock` in `LeafBlocks.tsx` (light grey, italic, renders comment text), routed from `StatementBlock.tsx`.
2. Added `title={signature}` to all `block-signature` spans in `DefinitionBlock.tsx` and `CallBlocks.tsx`.
3. Added `block-mode-detach` class to `getAwaitStmtDisplay` for detached workflow/nexus await targets + CSS rule in `blocks.css`.
4. Added `then:` branch label in `ControlFlowBlocks.tsx` to match existing `else:` label.
5. Skipped: namespace endpoint task queue — AST `NamespaceEndpoint` type has no task queue field; data not available.

---

## Group 3: Tree View — Header & Filter Polish ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

1. Added global `/` and `Ctrl+F` keydown handler in `WorkflowCanvas.tsx` to open search bar.
2. Fixed empty state messages: webview no-AST says "Open a .twf file..."; no-filter-match says "No definitions match the current filters." with hint; errors-only case renders nothing below errors header.
3. Changed `ErrorsHeader` default state from `false` to `true` (expanded when errors present).

---

## Group 4: Tree View — Keyboard Navigation & Accessibility ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Implemented:
1. `role="tree"` container with `onKeyDown` handler for Up/Down/Left/Right/Enter/Home/End/Escape.
2. `role="treeitem"` wrappers with `aria-expanded`, `aria-level={1}`, roving `tabIndex` (focused=0, others=-1).
3. Controlled expand state: `WorkflowCanvas` manages `expandedDefs` Set, passed to `DefinitionBlock` via `expanded`/`onToggle` props. Sub-blocks fall back to internal `useToggle` when not controlled.
4. `:focus-visible` CSS with `--focus-ring-color` variable (blue in light, lighter blue in dark).
5. Global Escape handler closes search when tree is focused.

---

## Group 5: Tree View — Contextual Navigation Buttons ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Implemented:
1. Built `NavigationContext` with reverse-reference index (`callers`, `workerOf`, `namespaceOf` maps) computed via recursive AST statement walker in `WorkflowCanvas.tsx`. Keys use `${defType}:${name}` format for type-safe lookups.
2. Created `ContextualNavButtons` component in new `ContextualNav.tsx` — hover-activated action buttons (Callers, Worker, NS, Def) positioned absolutely at top-right of block header.
3. Added `navigateTo` callback: finds target in `visibleDefinitions`, expands it, scrolls into view, focuses, and flashes with CSS animation.
4. Multi-target popover for buttons with >1 target — outside-click and Escape dismiss.
5. Wired nav buttons into all 5 definition block types (`DefinitionBlock.tsx`) and all 3 call block types (`CallBlocks.tsx`).
6. Skipped: "Show in Graph" — deferred until Graph View exists (Group 9+).

---

## Group 6: View Framework — Tab Switching & View Shell ✅

**Tier:** Core | **Blocked:** No (structurally) | **Type:** Internal | **Status:** Completed

Refactored `WorkflowCanvas.tsx` into a view shell with tab switching:
1. `WorkflowCanvas.tsx` now serves as the view shell — manages AST, `DefinitionContext`, tab state, and renders a tab bar with Tree/Graph buttons. All context type exports preserved for downstream imports.
2. Created `TreeView.tsx` — extracted all tree-specific state (header filters, expand/collapse, keyboard nav, reverse-reference index, navigateTo, flash) and rendering (header, errors header, definition list).
3. Created `GraphView.tsx` — placeholder component showing definition count and "coming soon" message.
4. Added tab bar styles to `index.css` (`.view-shell`, `.tab-bar`, `.tab-bar-btn` with active/hover/dark states).
5. Cross-view navigation infrastructure ("Show in [View]") deferred — requires Graph View implementation (Groups 8-10).

---

## Group 7: View Framework — Live Reload ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Implemented state preservation across AST reloads:
1. Changed expand state identity key from `${sourceFile}-${type}-${name}` to `${type}:${name}` — definitions survive file moves, matching spec's "by name" identity rule.
2. Added stale file cleanup `useEffect` — prunes `selectedFiles` when files disappear from AST.
3. Added expand state cleanup `useEffect` — prunes `expandedDefs` when definitions disappear from AST.
4. Added transition indicator — `refreshFlash` state triggers a subtle purple glow animation on the canvas-header when AST updates.
5. Search query and scroll position were already preserved (local state not reset by AST prop changes). No changes needed.
6. Filter selections already preserved for same `focusedFile`. Stale cleanup (item 2) handles the remaining gap.

---

## Group 8: Graph View — Data Model & Graph Construction ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Created graph data model and AST→graph construction pipeline:
1. `model.ts` — `GraphNode` (id, level, nodeType, name, parentId, orphan), `GraphEdge` (edgeType, source/target with levels, nexus metadata), `Graph` (nodes Map + edges array), helper functions `nodeId()` and `nodeLevel()`.
2. `build.ts` — `buildGraph(ast)` implementing the spec's 6-step pipeline: namespace nodes → worker nodes with namespace containment → L3 nodes from worker registrations + orphan detection → cross-worker dependency edges (direct calls, nexus traced to backing workflows) → Worker→Worker projection → Namespace→Namespace projection. Self-loops discarded at each projection step.

---

## Group 9: Graph View — Simulation, Rendering & Semantic Zoom ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Implemented the full graph rendering pipeline:
1. `simulation.ts` — `Simulation` class with charge/link/center forces, 8 per-level strength parameters (`ForceParams`), alpha cooling, `tick()`/`reheat()`/`isStable()`/`pinNode()`/`unpinNode()`, child seeding at parent positions.
2. `viewport.ts` — `Viewport` interface with `worldToScreen`/`screenToWorld`/`zoomAt`/`fitToView` transforms.
3. `GraphCanvas.tsx` — Canvas 2D renderer with requestAnimationFrame loop. Nodes: rounded rect (namespace), rect (worker), circle (L3) with theme colors and name labels. Edges: solid+arrowhead for dependencies, dashed for containment, pink for nexus. Orphan dashed outline. Mouse handlers for wheel zoom, drag pan, node drag, double-click center+zoom.
4. `LevelSelector.tsx` — 3-segment range selector (NS/Worker/Defs) with pointer events for click-single and drag-range selection. 6 valid contiguous combinations.
5. `GraphView.tsx` — Replaced placeholder with full wiring: `buildGraph` → `Simulation` → `GraphCanvas` + `LevelSelector`, level-range filtering via visibility matrix, auto fit-to-view after warmup, level-transition node seeding + reheat, play/pause/fit controls.
6. `index.css` — Replaced placeholder CSS with graph-view, graph-header, graph-canvas-container, and level-selector styles.

Level transitions use instant visibility + reheat + parent seeding (animated force interpolation deferred per spec allowance).

---

## Group 10: Graph View — Interaction Layer ✅

**Tier:** Core | **Blocked:** No | **Type:** Internal | **Status:** Completed

Implemented the full graph interaction layer:
1. `highlight.ts` — `getTransitiveDeps()` BFS traversal following dependency edges downstream or upstream; `getHighlightedEdgeIds()` for edges along the traversal path.
2. `GraphControlPanel.tsx` — Collapsible panel with 8 force sliders (3 charge + 5 link) grouped by type, play/pause and reheat buttons. Slider changes propagate live to running simulation.
3. `GraphCanvas.tsx` — Added hover detection (pointer-move hit test), click-to-select/background-deselect, opacity dimming (20% for non-highlighted), selection ring, focus ring, search match ring, offscreen culling (100px margin).
4. `GraphView.tsx` — Full interaction wiring: hover/select/focus state, Shift-key tracking for upstream deps, file filter chips, search bar with hidden match badge, search results dropdown with click-to-center, errors header (GraphErrorsHeader component), keyboard handler (Tab/Shift+Tab/Enter/Escape/Arrows/+/-/F/Space/?), shortcuts reference panel, control panel integration.
5. `index.css` — Styles for file chips, search bar/results, errors header, control panel (absolute-positioned), shortcuts panel, all with dark theme variants.

Deferred: Nexus edge scope highlighting (highlighting all edges sharing a nexus service/endpoint on hover) — requires additional edge metadata UI that would benefit from user testing first.

---

## Group 11: View Framework — Cross-View Navigation

**Tier:** Core | **Blocked:** Requires Groups 6, 10 | **Type:** Internal

"Show in [View]" navigation between Tree and Graph views.

### Features addressed
- Full cross-view sequence: switch tab, adjust filters, animate filter bar, scroll/pan to target, flash
- Shared filter vocabulary with independent per-view state

### Files touched
- View shell component — cross-view navigation controller
- `tools/visualizer/src/components/TreeView.tsx` — accept "navigate to item" command
- `tools/visualizer/src/components/GraphView.tsx` — accept "navigate to item" command
- `tools/visualizer/src/styles/index.css` — filter animation, flash/pulse CSS

### Parallelism
Requires Groups 6 and 10. Both views must exist and support programmatic focus.

---

## Future Features (not actionable now)

| Feature | Blocked? |
|---------|----------|
| Cross-View Filter Sync | No |
| Multi-Select Modifier | No |
| Bulk Expand/Collapse (Ctrl+Shift+→/←) | No |
| Handler "Show Callers" | Yes — needs send-side DSL |
| Edge Opacity/Thickness for Traffic | Yes — needs multiplicity data |
| Level 3 Per-Type Visibility Toggle | No |
| Selection Info Panel | No |
| Multi-Select (Graph) | No |
| Force Parameter Presets | No |
| Message Flow Edges | Yes — needs send-side DSL |
| Barnes-Hut Approximation | No (perf optimization) |
