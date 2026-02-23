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

## Group 2: Tree View — Rendering Gaps

**Tier:** Core | **Blocked:** No | **Type:** Internal

Small rendering omissions that affect spec compliance.

### Features addressed

1. **Comment blocks not rendered** — `StatementBlock.tsx` returns `null` for `comment` type. Spec lists comment as a light-grey leaf block that should render with its text. Add a `CommentBlock` component.

2. **Missing hover tooltip on block signatures** — No `title` attribute on any `<span className="block-signature">` in `DefinitionBlock.tsx` or block components. When signatures are truncated by CSS ellipsis, the full text is permanently unreadable. Add `title={signature}` to all signature spans.

3. **Detach dashed border missing on await targets** — `AwaitBlocks.tsx` `getAwaitStmtDisplay` does not apply `block-mode-detach` class for detached workflow/nexus targets inside await statements. Only the keyword text changes ("detach workflow"), but no dashed border is applied. Top-level call blocks correctly apply the dashed border. Add `block-mode-detach` class when the await target has detach mode.

4. **If block missing `then:` branch label** — `ControlFlowBlocks.tsx` renders an `else:` label via `.branch-label` but no corresponding `then:` label on the first branch. The asymmetry is inconsistent with spec intent. Add a `then:` label.

5. **Namespace endpoint entries missing routing target** — Spec describes endpoints as "deployment routing entries (endpoint name + task queue)." Implementation only shows `endpointName`. If the AST provides additional routing fields, they should render.

### Files touched
- `tools/visualizer/src/components/blocks/StatementBlock.tsx` — route `comment` to new component
- `tools/visualizer/src/components/blocks/LeafBlocks.tsx` — add `CommentBlock`
- `tools/visualizer/src/components/blocks/DefinitionBlock.tsx` — add `title` to signature spans
- `tools/visualizer/src/components/blocks/CallBlocks.tsx` — add `title` to signature spans
- `tools/visualizer/src/components/blocks/AwaitBlocks.tsx` — add detach class to await target blocks
- `tools/visualizer/src/components/blocks/ControlFlowBlocks.tsx` — add `then:` branch label
- `tools/visualizer/src/components/blocks/blocks.css` — comment block styling

### Parallelism
Self-contained. All items independent of each other. No dependencies on other groups.

---

## Group 3: Tree View — Header & Filter Polish

**Tier:** Core | **Blocked:** No | **Type:** Internal

Minor gaps in header control behavior.

### Features addressed

1. **Search keyboard shortcut missing** — No global keydown listener for `/` or `Ctrl+F` to open the search bar. Only the icon button click works.

2. **Empty state messages don't match spec** — Three cases need fixing:
   - Webview no-AST state shows "Loading workflow..." with spinner instead of spec message: "Open a `.twf` file or connect to the extension to get started."
   - No-filter-match message doesn't include "adjust filters" hint.
   - "Only parse errors" case not distinguished — placeholder text renders alongside errors header instead of showing only the errors header.

3. **Errors header defaults collapsed instead of expanded** — `ErrorsHeader` initializes `expanded` to `false`. Spec says it defaults to expanded when errors are present.

### Files touched
- `tools/visualizer/src/components/WorkflowCanvas.tsx` — add `/` and `Ctrl+F` keydown handler; fix empty state messages; fix errors header default state
- `tools/visualizer/src/webview.tsx` — update no-AST message text
- `tools/visualizer/src/App.tsx` — update no-AST message text (if applicable)

### Parallelism
Self-contained. No dependencies on other groups.

---

## Group 4: Tree View — Keyboard Navigation & Accessibility

**Tier:** Core | **Blocked:** No | **Type:** Internal

The entire keyboard navigation and ARIA system is absent.

### Features addressed

1. **No keyboard event handling on block items** — Up/Down/Left/Right/Enter/Home/End key bindings are completely missing. No `onKeyDown` handler on any block element.

2. **Block headers not keyboard-reachable** — All block headers are `<div>` elements with no `tabIndex`. They are absent from the tab order entirely.

3. **No focus ring CSS** — No `:focus-visible` styles on any block, button, or interactive element. The only focus-related CSS is `outline: none` on the search input.

4. **No ARIA markup** — Zero `role="tree"`, `role="treeitem"`, `aria-expanded`, or `aria-level` attributes anywhere.

5. **Tab cycling incomplete** — Tab moves through header buttons but skips the entire block list since blocks have no `tabIndex`.

6. **Escape only works inside search input** — No global Escape handler for clearing selection or closing popovers outside search.

### Implementation approach
- Add roving `tabIndex` focus management to the block tree
- Add `onKeyDown` handler on the tree container for arrow keys, Enter, Home/End
- Add `role="tree"` to container, `role="treeitem"` + `aria-expanded` + `aria-level` to each block
- Add `:focus-visible` CSS for all interactive elements
- Add global Escape handler

### Files touched
- `tools/visualizer/src/components/WorkflowCanvas.tsx` — tree-level keyboard handler, focus management, ARIA on container
- `tools/visualizer/src/components/blocks/DefinitionBlock.tsx` — `role="treeitem"`, `aria-expanded`, `aria-level`, `tabIndex`
- `tools/visualizer/src/components/blocks/blocks.css` — `:focus-visible` styles
- `tools/visualizer/src/styles/index.css` — global focus ring token

### Parallelism
Self-contained. No dependencies on other groups.

---

## Group 5: Tree View — Contextual Navigation Buttons

**Tier:** Core | **Blocked:** No | **Type:** Internal

The entire feature is missing: reverse reference index, hover action buttons, scroll-to-target, and multi-target popover.

### Features addressed

1. **No reverse reference index** — `DefinitionContext` is forward-only (name → definition). No reverse index mapping each definition name to the set of call sites that reference it.

2. **No contextual navigation buttons** — No hover-triggered action buttons on any block header. No "Show callers", "Show worker", "Show namespace", "Show definition" buttons.

3. **No scroll + expand ancestry + flash behavior** — No programmatic scroll-to-element, no ancestry expansion API, no flash animation. Block expand state is managed locally via `useToggle` with no external control surface.

4. **No multi-target popover** — No popover component for selecting among multiple targets.

5. **No "Show in Graph" action** — Placeholder until Graph View exists, but the button slot and callback infrastructure are absent.

### Implementation approach
1. Build reverse index alongside `DefinitionContext` in `WorkflowCanvas`, distribute via new context
2. Create `ContextualNavButtons` component — reads both contexts, renders per block type
3. Add programmatic expand + scroll + flash capability (requires refs and imperative control API)
4. Add multi-target popover component
5. Wire "Show in Graph" callback from app shell (disabled until Graph View exists)

### Files touched
- `tools/visualizer/src/components/WorkflowCanvas.tsx` — build reverse index, add to context
- New: `tools/visualizer/src/components/blocks/ContextualNav.tsx` — nav button + popover component
- `tools/visualizer/src/components/blocks/DefinitionBlock.tsx` — render nav buttons on definition headers
- `tools/visualizer/src/components/blocks/CallBlocks.tsx` — render "Show definition" button on call headers
- `tools/visualizer/src/components/blocks/blocks.css` — button positioning, popover styles

### Parallelism
Depends on scroll-to + expand-ancestry logic (new infrastructure). "Show in Graph" is a placeholder until Graph View exists. Otherwise self-contained.

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
