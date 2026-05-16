# View Framework

The visualizer has two views — Tree View and Graph View — that show the same data from different perspectives. This document specifies how they compose into a single product: view switching, cross-view navigation, and all shared behaviors that apply identically to both views.

For the product vision, user goals, UX principles, and visual identity, see [PRODUCT.md](./PRODUCT.md).


## View Model

The views use a **tab switching** model. One view is active at a time. Each view maintains its own scroll/zoom and expand/collapse state independently. The two structural filter dimensions (files, types) are per-view and reconciled on every switch (§ View Transitions); the search query is globally shared (§ Unified Filter Bar).

**Default view:** Tree View is the default on first load. It's the more familiar interaction model (collapsible list) and works immediately with any AST. Graph View is a "power view" the user discovers via the tab bar.


## Tab Bar

A tab bar at the top of the visualizer with two tabs: **Tree** and **Graph**. The active tab is visually highlighted. Clicking a tab switches the active view.

**State on switch:** Each view preserves its scroll/zoom and expand/collapse state across tab switches. Filter state is reconciled per § View Transitions: pinned dimensions hold their values across switches; unpinned dimensions propagate from the source view. Search is shared across views and is not affected by switching.


## View Transitions

Every switch from one view to the other is a **view transition** with a declared **intent**. The intent expresses *why* the user is switching, and a single shared reconciler decides what filter state the destination view should land in.

This vocabulary unifies what would otherwise be separate features ("Show in Graph", tab clicks, future explicit-sync gestures) under one named pattern. Call sites only declare intent — they never directly mutate destination filter state.

### Intents

| Intent | Trigger | Reconciliation |
|---|---|---|
| `manual` | User clicks the destination tab in the tab bar. | For each filter dimension (files, types): if destination's dimension is **pinned** (§ Per-Dimension Pinning), leave it alone; otherwise adopt the source view's current value. |
| `focus(target)` | User invokes "Show in [view]" on a definition or node. | Take destination's current filter and **expand** it only as needed to make the target visible (add the target's type if toggled off; add the target's source file if file filtering is active). Pins do not block expansion — a `focus` transition can override a pin, with a visible cue. The pin state itself is not changed. |

A future `mirror` intent (force one view's filters onto the other, ignoring pins) is reserved for explicit power-user gestures and is not exposed today.

### The Filter Reconciler

The reconciler is the single function responsible for producing the destination view's filter state on every switch. Its signature, conceptually:

    reconcileFilter(destView, destFilter, sourceFilter, pinState, intent) → newDestFilter

It is the only consumer of `ViewTransition`. Switch-trigger code at the call sites is responsible for naming the intent; the reconciler owns the rules. This collapses the previously-duplicated filter-expansion logic in `TreeView` and `GraphView` into one shared module.

### Behavior Sequence (`manual` — Tab Click)

1. **Switch tab** — destination view becomes active.
2. **Reconcile** — apply the `manual` rule, dimension by dimension.
3. No filter-bar animation — the user is now in the destination view and reads the resulting state directly. Animating on every tab click would be visually noisy when the user just wants to see what's there.

### Behavior Sequence (`focus(target)` — "Show in [View]")

The "Show in [view]" action is a contextual action available on any identifiable item: a definition block in the tree (workflow, activity, worker, namespace, nexus service) or a node in the graph.

**Trigger points:**
- **Tree View:** Right-click context menu on definition block headers, or the "Show in Graph" contextual navigation button.
- **Graph View:** Right-click context menu on nodes. (Double-click is reserved for graph-native "center and zoom to fit" — see GRAPH_VIEW.md § Viewport Controls.)

**Sequence when invoked:**

1. **Switch tab** — The target view becomes active (instant, no animation).
2. **Reconcile** — Apply the `focus(target)` rule: minimum filter expansion to make the target visible. If a pin would block the expansion, the pin is overridden for this transition only.
3. **Animate filter bar** — The filter controls animate to reflect the changes (toggles flip, chips activate, overridden pins briefly flash). This gives the user a visual explanation of what changed and which pins were bypassed.
4. **Animate view to target:**
   - **Tree View:** Smooth scroll to the target definition. Expand the target block's ancestry (any collapsed parents that contain it). Expand the target block itself.
   - **Graph View:** Pan and zoom to center the target node **and its immediate neighbors** — a local-first orientation. Lock viewport focus on the target node until the simulation stabilizes. The user can break the lock by manually panning or zooming out.
5. **Flash target** — After the view has settled, briefly highlight the target item (a pulse or glow effect) to draw the eye.

### Orientation

The transition should go **local → context**, not context → find-the-needle. When navigating to the graph, the user first sees the target node and its neighborhood (close zoom), then optionally zooms out to see the broader graph. When navigating to the tree, the user first sees the target block expanded and centered, then optionally scrolls to see siblings.

This local-first approach means the user lands oriented — they see the thing they asked about immediately, in its immediate relationships, before the full complexity of the target view is revealed.

### Filter-as-Source-of-Truth

Filters remain authoritative. `focus(target)` never bypasses filters silently — it adjusts them visibly. The user can always see exactly what's filtered and manually change it. The animation of the filter bar in step 3 makes the adjustment (and any pin override) explicit and reversible.


## Unified Filter Bar

Both views display the same visual filter bar with the same three filter dimensions:

```
[file chips...] 🔒 | [NS] [Worker] [Wf] [Act] [Nxs] 🔒 | [🔍 search]
```

**Source file chips** — One chip per `.twf` file in the AST. Click to toggle visibility. When the filter narrows to a single file, the extension opens that file in the editor.

**Type toggles** — Five toggle buttons, one per definition type, using the type's color: NS (dark grey), Worker (medium grey), Wf (purple), Act (blue), Nxs (pink). Each toggle shows/hides all items of that type. Both views use the same five toggles — the graph has no separate level selector.

**Per-dimension pin icons** — A small lock icon sits at the trailing edge of the Files section and the Types section in each view's filter bar. See § Per-Dimension Pinning below.

**Name search** — Text input (toggled by `/` or `Ctrl+F`). Case-insensitive substring match against definition/node names. Search is **non-destructive in both views**: it dims non-matching items rather than hiding them. See § Search Scope below.

### Filter State Model

The two structural filter dimensions (files, types) live as **per-view state** at the `WorkflowCanvas` level — one copy for the Tree view's filter, one copy for the Graph view's filter. While a view is active, the user freely edits its filter without affecting the other view.

On every view switch, the reconciler (§ View Transitions) decides how the destination view's filter responds to the source view's current state. The default behavior is **propagation**: edits in one view flow to the other so the views stay in sync. The user can opt out of propagation per dimension by **pinning** that dimension on the view they want to hold steady.

This design satisfies two competing intuitions:

- A casual user flipping between views expects continuity — narrowing files in Tree should narrow them in Graph too. Default propagation gives this for free.
- A power user maintaining asymmetric configurations (e.g., Tree narrowed to one file as a drilldown; Graph wide as a map) needs the views to diverge. A pin on the dimension to hold steady gives this with one click.

### Per-Dimension Pinning

Each view's filter bar exposes two **pin icons** — one on the Files chip row, one on the Types toggle row. Each pin freezes its dimension at its current value:

- **Unpinned (default, 🔓):** `manual` transitions adopt the source view's current value for this dimension. Edits propagate automatically.
- **Pinned (🔒):** `manual` transitions skip this dimension. The view holds its current value regardless of what the other view does.
- **Unpinning:** resumes propagation from the current values. There is no retroactive catch-up — the next switch is the first opportunity for the pinned view to adopt the source.

`focus(target)` transitions may override a pin to expose the target (per § View Transitions). The pin state itself is not changed by the override; only that one transition bypasses it. The filter bar animation in step 3 of the `focus` sequence visibly flashes the overridden pin so the user sees what was bypassed.

**Pin persistence:** pin state is preserved in `localStorage` per workspace, alongside other user preferences. Pins also survive AST live-reload (see § Live Reload).

### Search Scope

The search field is **globally shared** — a single query, owned by `WorkflowCanvas`, applied identically in both views. Typing in the search bar of one view updates the other view's search instantly. There is no per-view search state.

Search is safe to share because it is **non-destructive in both views**: it dims non-matching items rather than removing them from the visible set. The user types `PaymentWorkflow` in Tree, flips to Graph, and immediately sees the `PaymentWorkflow` node at full opacity (with surrounding nodes dimmed) — no need to retype.

Each view renders search matches in its own native style:
- **Tree View:** non-matching definitions dim to reduced opacity; matching definitions stay at full opacity. An `N of M` match count appears in the filter bar. Press `n` / `N` to jump between matches (see TREE_VIEW.md § Keyboard Navigation).
- **Graph View:** non-matching nodes dim to ~30% opacity; matching nodes stay at full opacity. See GRAPH_VIEW.md § Search and Hidden Matches.

### Hidden Match Badges

When a search is active, filter controls that are hiding matches show **badge overlays** with the count of hidden matches. For example: if the Wf toggle is off and 3 workflows match the search, the Wf button shows a "3" badge. This lets users discover hidden matches and decide whether to adjust filters.

Because search is non-destructive, badges apply only to matches hidden by *structural* filters (file/type toggles); search itself never hides anything. See GRAPH_VIEW.md § Search and Hidden Matches for full behavior.

### Layout Stack

The layout stack is identical in both views:

1. **Filter bar** (`canvas-header`) — shared; visually identical across views. File chips with pin, type toggles with pin, search.
2. **View toolbar** — view-specific controls directly below the filter bar. The graph view has a toolbar with node/edge count, Fit, and Play/Pause quick-access. The tree view has no separate toolbar (no simulation state to surface).
3. **Errors header** — present only when parse errors exist. Same collapsible pattern in both views.
4. **Content** — tree block list or graph canvas, filling remaining space.

This stack order is fixed. The filter is always first, so users always know where to find it regardless of which view they're in.

**Graph view layout exception:** in the Graph view, the filter bar, view toolbar, and errors header are rendered as a **floating overlay** above the canvas (the canvas fills the full viewport behind them). Zoomed-in graph content extends visibly under the edges of the overlay — an affordance signaling "there's more out here." See GRAPH_VIEW.md § Overlay Layout. The Tree view uses normal vertical stack flow because its content scrolls within a fixed-width column where bleed-under provides no value.

### Graph-Specific: Edge Graduation

The graph adds one behavior on top of the shared filter bar: when a type is toggled off, edges **graduate** across hidden layers rather than disappearing. See GRAPH_VIEW.md § Edge Graduation for the rules. The tree view simply hides definitions whose type is toggled off.


## Visual Consistency

Both views use the same color palette, icon system, and theming. See [PRODUCT.md](./PRODUCT.md) § Visual Identity for the authoritative definitions.


## Initial Defaults

### Tree View
- File filter: focused file (if the AST identifies one), otherwise no files selected (= all included).
- Definition type toggles: Workers and Workflows **ON**; Namespaces, Nexus Services, and Activities **OFF**.
- Pins: Files and Types both **unpinned** (propagation enabled).
- All definitions collapsed.

### Graph View
- File filter: same defaults as Tree (sync from Tree on first switch since pins are unset).
- Type toggles: same defaults as Tree View.
- Pins: Files and Types both **unpinned**.
- Force simulation running with default strength parameters.

### Shared
- Search query empty; search bar collapsed.


## Empty States

Each view shows a centered, non-interactive message when there's nothing to display. Three cases:

| Condition | Message |
|-----------|---------|
| No AST loaded | "Open a `.twf` file or connect to the extension to get started." |
| AST loaded, no definitions match current filters | "No definitions match the current filters." with a hint to adjust filters. |
| AST loaded, only parse errors | Show the errors header (see § Error Handling below) with no content below. |

Empty states apply identically to both views. The message is centered in the content area below the header/filter controls.


## Error Handling

When the AST contains parse errors, both views surface them in the same way.

### Errors Header

A collapsible bar between the filter bar and the view content (tree block list or graph canvas). The bar shows:

- **Error count** — total number of parse errors.
- **Error grouping** — errors are split into two groups:
  - **Shown files** — errors from files that match the current file filter selection.
  - **Hidden files** — errors from files excluded by the file filter.
- **Error detail** — each error displays the source file name and the error/stderr message.

The errors header is collapsible — the user can dismiss it to focus on the valid content. It defaults to expanded when errors are present.

### Errors Are Informational

Errors do not block rendering. Both views still render whatever valid definitions exist in the partial AST. The errors header is a notification, not a gate.


## Live Reload

When the AST updates (file save → parser re-run → new `TWFFile` delivered to the visualizer), both views preserve user state where possible.

### Identity Matching

Definitions and nodes are matched across AST versions **by name**. A definition with the same name in the new AST is considered the same item, even if it moved between containers (e.g., a workflow re-registered on a different worker). Renames are treated as a removal of the old name plus an addition of the new name.

### State Preserved Across Reloads

| State | Behavior |
|-------|----------|
| Filter selections (per view) | Preserved. If a filtered file no longer exists, remove it from the selection. |
| Pin states (per view, per dimension) | Preserved. Pins are a user preference and survive reloads. |
| Shared search query | Preserved. Results recomputed against new data. |
| Selection | Preserved if the selected item still exists. Cleared if removed. |

**Tree-view-specific:**

| State | Behavior |
|-------|----------|
| Expand/collapse | Preserved for definitions that still exist (matched by name). New definitions appear collapsed. |
| Scroll position | Preserved. If the scrolled-to definition was removed, scroll to the nearest surviving sibling. |
| Contextual nav buttons | Recomputed from new AST (reverse index rebuilt). |

**Graph-view-specific:**

| State | Behavior |
|-------|----------|
| Node positions | Preserved for nodes that still exist. Simulation does not restart for surviving nodes. |
| Viewport (zoom/pan) | Preserved. |
| Type toggle selections | Preserved. |
| Force parameters | Preserved (slider values unchanged). |

### Additions and Removals

**Tree View:**
- New definitions appear in their natural position (sorted by type and order in AST), collapsed, with no special animation.
- Removed definitions disappear immediately. If expanded, children vanish with them.

**Graph View:**
- New nodes are seeded at the position of their parent node (same as level transition seeding). The simulation reheats locally — new nodes spread out from their parent while existing nodes remain stable.
- Removed nodes fade out over a short duration (~200 ms). Their edges disappear with them. The simulation reheats locally to let surviving neighbors adjust.

### Transition Indicator

A brief, non-blocking indicator (e.g., a subtle flash on the header bar, or a small "updated" badge that fades) signals that the AST has been refreshed. This should not interrupt the user's current interaction. The indicator is the same in both views.


## Accessibility

### ARIA Roles

Both views follow WAI-ARIA guidance for their respective interaction models:
- **Tree View:** `role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-level` — following the WAI-ARIA Treeview pattern.
- **Graph View:** Nodes are focusable elements with labels announcing node type and name — following WAI-ARIA guidance for interactive graphics.

The key requirement is that screen readers can announce identity (type and name), state (expanded/collapsed, selected/unselected), and relationships (nesting depth, dependency connections). Specific ARIA attributes beyond these requirements are implementation concerns.

### Focus Indicators

Both views show a visible focus ring on the currently focused item (block or node). The focus ring is visually distinct from hover highlight and selection highlight. Focus follows keyboard navigation and is independent of mouse hover.

### Keyboard Navigation

Each view defines its own key bindings (see TREE_VIEW.md § Keyboard Navigation and GRAPH_VIEW.md § Keyboard Navigation). Shared keyboard patterns:

| Key | Behavior (both views) |
|-----|----------------------|
| **/** or **Ctrl+F** | Open search bar and focus the search input |
| **Escape** | Close search bar, clear selection, or close any open popover (in priority order) |
| **Tab** | Move focus between header controls and the content area |


## Keyboard Modifier Vocabulary

Modifier keys have consistent meanings across the entire visualizer. This prevents views from independently defining conflicting modifier semantics.

| Modifier | Meaning | Used In |
|----------|---------|---------|
| **Shift** (with hover/focus) | Reverse dependency direction — show **upstream** dependents instead of downstream dependencies | Graph View: Interaction States |
| **Shift+Tab** | Reverse focus cycling | Both views: standard browser/OS convention |

### Future: Multi-Select

Multi-select (selecting multiple nodes) is a future feature for Graph View. Because Shift already has a defined meaning (dependency direction reversal), multi-select should use a different modifier — **Ctrl+click** (Windows/Linux) or **Meta+click** (macOS) — to avoid ambiguity.
