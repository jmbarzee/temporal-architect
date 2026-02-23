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

## Group 6: View Framework — Tab Switching & View Shell

**Tier:** Core | **Blocked:** No (structurally) | **Type:** Internal

The entire tab/view framework is absent. This is the prerequisite for Graph View and cross-view navigation.

### Features addressed

1. **No tab bar** — No tab bar, no view switching, no per-view state preservation.
2. **No Graph View placeholder** — Tree View renders directly; no second view slot.
3. **No cross-view navigation infrastructure** — No "Show in [View]" action, no filter adjustment on switch, no flash-on-arrival.

### Files touched
- `tools/visualizer/src/components/WorkflowCanvas.tsx` — refactor into view-shell + tab bar + view slot
- New: `tools/visualizer/src/components/TreeView.tsx` — extract current tree rendering
- New: `tools/visualizer/src/components/GraphView.tsx` — placeholder graph view component
- `tools/visualizer/src/styles/index.css` — tab bar styles

### Parallelism
Prerequisite for Groups 7-10. Can be developed independently of Groups 1-5.

---

## Group 7: View Framework — Live Reload

**Tier:** Core | **Blocked:** No | **Type:** Internal

State preservation across AST reloads is absent. Every AST update replaces all state.

### Features addressed

1. **No identity matching** — `setAst(message.data)` replaces the AST wholesale. No diff by definition name.
2. **Filter selections not preserved** — `selectedFiles` resets on every new AST (via `useEffect` on `ast.focusedFile`).
3. **Search query not preserved** — `searchQuery` is local state, lost on AST replacement.
4. **Expand/collapse not preserved** — Relies on React key stability (`${sourceFile}-${type}-${name}`), which may work incidentally but is not explicit preservation logic. Fails when list order changes.
5. **Scroll position not preserved** — No scroll restoration logic.
6. **No stale file cleanup** — Stale file selections persist silently when files disappear from new AST.
7. **No transition indicator** — No visual signal that the AST has been refreshed.

### Files touched
- `tools/visualizer/src/components/WorkflowCanvas.tsx` — identity-matching diff logic, state preservation hooks, transition indicator
- `tools/visualizer/src/components/blocks/DefinitionBlock.tsx` — externalized expand state keyed by name
- `tools/visualizer/src/styles/index.css` — transition indicator animation

### Parallelism
Independent of Groups 1-5. Benefits from Group 6 (view shell) being in place.

---

## Group 8: Graph View — Data Model & Graph Construction

**Tier:** Core | **Blocked:** No | **Type:** Internal

Build the graph data model from AST definitions. Foundation for all graph rendering.

### Features addressed
- Node types (3-level hierarchy): Namespace (L1), Worker (L2), Workflow/Activity/NexusService (L3)
- Containment edges: L3→Worker, Worker→Namespace
- Dependency edges: cross-worker calls (workflow→workflow, workflow→activity, workflow→workflow via nexus)
- Derived edges: Worker→Worker and Namespace→Namespace projected from L3
- Graph construction order (6-step pipeline)
- Orphan definitions (uncontained nodes)

### Files touched
- New: `tools/visualizer/src/graph/model.ts` — graph node/edge types, containment hierarchy
- New: `tools/visualizer/src/graph/build.ts` — AST→graph construction, orphan detection, edge coarsening

### Parallelism
Prerequisite for Groups 9-10. Independent of Groups 1-5. Requires Group 6 only for integration.

---

## Group 9: Graph View — Simulation, Rendering & Semantic Zoom

**Tier:** Core | **Blocked:** No | **Type:** Internal

Force-directed layout, visual encoding, viewport controls, and semantic zoom.

### Features addressed
- Force simulation: charge, link, center forces with `requestAnimationFrame`
- Per-level strength parameters (3 charge + 5 link)
- Simulation lifecycle: initialize → tick → cool → reheat
- Viewport controls: scroll/pinch zoom, click-drag pan, node drag, double-click center+zoom, fit-to-view
- Semantic zoom: 3-segment range selector, 6 valid level combinations, visibility matrix
- Level transitions: animated reveal/hide with force strength interpolation
- Node visual encoding: shape by type, color + icon matching tree view, name labels
- Edge visual encoding: solid + arrowhead for dependencies, dashed for containment, distinct nexus edges

### Files touched
- New: `tools/visualizer/src/graph/simulation.ts` — force simulation, strength parameters, lifecycle
- New: `tools/visualizer/src/graph/viewport.ts` — pan, zoom, fit-to-view, node drag
- New: `tools/visualizer/src/components/GraphCanvas.tsx` — rendering, animation loop, node/edge visuals
- New: `tools/visualizer/src/components/LevelSelector.tsx` — 3-segment range selector UI

### Parallelism
Depends on Group 8 (data model). Independent of Groups 1-5.

---

## Group 10: Graph View — Interaction Layer

**Tier:** Core | **Blocked:** No | **Type:** Internal

Hover, selection, search, filtering, keyboard navigation, and control panel.

### Features addressed
- Transitive dependency highlighting (hover downstream, Shift+hover upstream, ~20-30% opacity dimming)
- Selection (click to select, background/Escape to deselect)
- Control panel: level selector, 8 force sliders, play/pause/reheat
- Search and filtering: source file chips, name search, hidden match badges
- Search result selection: click match to center and select
- Errors header (shared pattern)
- Keyboard navigation: Tab/Shift+Tab focus, Enter select, arrows pan, +/- zoom, F fit, `/` search, Space toggle sim, `?` shortcuts
- Hotkey discoverability: tooltip hint, `?` reference panel
- Nexus edge scope highlighting
- Offscreen culling

### Files touched
- New: `tools/visualizer/src/components/GraphControlPanel.tsx` — sliders, play/pause, reheat
- New: `tools/visualizer/src/graph/highlight.ts` — transitive dependency traversal
- `tools/visualizer/src/components/GraphCanvas.tsx` — hover/select/keyboard handlers, search integration
- `tools/visualizer/src/components/GraphView.tsx` — filter bar, search bar, errors header

### Parallelism
Depends on Groups 8-9. Many sub-features can be parallelized internally.

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
