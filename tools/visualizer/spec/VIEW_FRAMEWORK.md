# View Framework

The visualizer has two views — Tree View and Graph View — that show the same data from different perspectives. This document specifies how they compose into a single product: view switching, cross-view navigation, and all shared behaviors that apply identically to both views.

For the product vision, user goals, UX principles, and visual identity, see [PRODUCT.md](./PRODUCT.md).


## View Model

The views use a **tab switching** model. One view is active at a time. Each view maintains its own scroll/zoom and expand/collapse state independently. Each declared filter axis — the host declares two, File and Kind — is per-view and reconciled on every switch (§ View Transitions); the search query is globally shared (§ Unified Filter Bar).

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
| `manual` | User clicks the destination tab in the tab bar. | For each filter axis the destination shows (its chain): if **pinned** (§ Per-Dimension Pinning), leave it alone; otherwise adopt the source view's current selection. An axis the destination does not show is not reconciled. |
| `focus(target)` | User invokes "Show in [view]" on a definition or node. | Take destination's current filter and **expand** it only as needed to make the target visible — the target names its values per axis (`FocusTarget`), and each axis's focus policy says how: a kind is always added; a file only widens an already-active selection, since adding the first file would narrow from everything to one. Pins do not block expansion — a `focus` transition can override a pin, with a visible cue. The pin state itself is not changed. |

A `mirror` intent (force one view's filters onto the other, ignoring pins) is deliberately **not** exposed: it would let one view silently discard the other's filter state. The name is reserved should an explicit power-user gesture ever justify it.

### The Filter Reconciler

The reconciler is the single function responsible for producing the destination view's filter state on every switch. Its signature, conceptually:

    reconcileFilter(destFilter, sourceFilter, destPins, intent, axes) → { filter, overriddenPins }

It is the only consumer of `ViewTransition`. Switch-trigger code at the call sites is responsible for naming the intent; the reconciler owns the rules. This collapses the previously-duplicated filter-expansion logic in `TreeView` and `GraphView` into one shared module.

### Behavior Sequence (`manual` — Tab Click)

1. **Switch tab** — destination view becomes active.
2. **Reconcile** — apply the `manual` rule, dimension by dimension.
3. No filter-bar animation — the user is now in the destination view and reads the resulting state directly. Animating on every tab click would be visually noisy when the user just wants to see what's there.

### Behavior Sequence (`focus(target)` — "Show in [View]")

The "Show in [view]" action is a contextual action available on any identifiable item: a definition block in the tree (workflow, activity, worker, namespace, nexus service) or a node in the graph.

**Trigger points:**
- **Tree View:** the "Show in Graph" contextual navigation button on a definition block.
- **Graph View:** A **"Show in Tree" button in the node's hover tooltip** (the tooltip is interactive — it stays open while the pointer is over it so the button is clickable). (Double-click is reserved for graph-native "center and zoom to fit" — see GRAPH_VIEW.md § Viewport Controls.)

**Sequence when invoked:**

1. **Switch tab** — The target view becomes active (instant, no animation).
2. **Reconcile** — Apply the `focus(target)` rule: minimum filter expansion to make the target visible. If a pin would block the expansion, the pin is overridden for this transition only.
3. **Animate filter bar** — The filter controls animate to reflect the changes (chips that turned on flash, overridden pins flash). This gives the user a visual explanation of what changed and which pins were bypassed.
4. **Animate view to target:**
   - **Tree View:** Smooth scroll to the target definition. Expand the target block's ancestry (any collapsed parents that contain it). Expand the target block itself.
   - **Graph View:** Centre the viewport on the target node and reheat so the layout settles around it. Framing the immediate neighbours, locking the viewport until the simulation stabilises, and the flash of step 5 are deferred — [#183](https://github.com/jmbarzee/temporal-architect/issues/183).
5. **Flash target** (deferred, #183) — After the view has settled, briefly highlight the target item (a pulse or glow effect) to draw the eye.

### Orientation

The transition should go **local → context**, not context → find-the-needle. When navigating to the graph, the user first sees the target node, centred, then optionally zooms out to see the broader graph. When navigating to the tree, the user first sees the target block expanded and centered, then optionally scrolls to see siblings.

This local-first approach means the user lands oriented — they see the thing they asked about immediately, in its immediate relationships, before the full complexity of the target view is revealed.

### Filter-as-Source-of-Truth

Filters remain authoritative. `focus(target)` never bypasses filters silently — it adjusts them visibly. The user can always see exactly what's filtered and manually change it. The animation of the filter bar in step 3 makes the adjustment (and any pin override) explicit and reversible.


## Unified Filter Bar

Both views display the same filter bar, rendered from the host's declared filter axes (R6, R14, R19) in the view's **chain** — the axes shown, in order, editable per view (R17): each axis is a row of chips with its pin and a `×`, shown on hover, that removes it (and stops it filtering); a `+` appears when a declared axis is not shown and adds the first such axis at the end; an empty chain is the small bar with just `+` and the search (R18). The default chain is the host's declared order, File then Kind, so the `+` is absent by default.

```
[file chips...]                                          🔒 (×)
[Namespaces] [Workers] [Nexus] [Workflows] [Activities]  🔒 (×)
[🔍 search]
```

**Source file chips** — One chip per `.twf` file in the AST. Click to toggle visibility. When the Tree's file filter narrows to a single file, the host is asked to open that file (`onOpenFile`). For **packaged** designs, a node's [`package`](../../../skills/temporal-architect-design/topics/packages.md) is recoverable from its qualified node-ID (see GRAPH_VIEW.md § Packages and Qualified Identity), so package is available as a **derived grouping lens** parallel to the source-file dimension — no new wire data. Today "package" ≈ the source-file chip; an unpackaged design has a single implicit package, so the lens is inert for it.

**Kind chips** — the Kind axis's chips as its descriptor declares them: five chips over seven kinds (Nexus groups the endpoint, service and operation kinds), each tinted with a style value's colour from the taxonomy (`FilterChip.tint`) and carrying its icon. Each chip shows/hides every item of its kinds. Both views render the same chips from the same descriptor — the graph has no separate tier selector.

**Per-axis pin icons** — A small lock icon sits at the trailing edge of each axis's section in each view's filter bar. See § Per-Dimension Pinning below.

**Name search** — Text input (toggled by `/` or `Ctrl+F`). Case-insensitive substring match against definition/node names. Search is **non-destructive in both views**: it dims non-matching items rather than hiding them. See § Search Scope below.

### Filter State Model

The filter state is a map from axis to its selected values (`FilterState`), held as **per-view state** at the `WorkflowCanvas` level — one copy for the Tree view's filter, one copy for the Graph view's. What an empty selection means (File: everything; Kind: nothing) and what a node with no value on an axis does (File: stays visible) are each axis's declared policy, read in one place for both views. While a view is active, the user freely edits its filter without affecting the other view.

On every view switch, the reconciler (§ View Transitions) decides how the destination view's filter responds to the source view's current state. The default behavior is **propagation**: edits in one view flow to the other so the views stay in sync. The user can opt out of propagation per dimension by **pinning** that dimension on the view they want to hold steady.

This design satisfies two competing intuitions:

- A casual user flipping between views expects continuity — narrowing files in Tree should narrow them in Graph too. Default propagation gives this for free.
- A power user maintaining asymmetric configurations (e.g., Tree narrowed to one file as a drilldown; Graph wide as a map) needs the views to diverge. A pin on the dimension to hold steady gives this with one click.

### Per-Dimension Pinning

Each axis section in a view's filter bar carries a **pin icon**. A pin freezes its axis at its current value:

- **Unpinned (default, 🔓):** `manual` transitions adopt the source view's current value for this dimension. Edits propagate automatically.
- **Pinned (🔒):** `manual` transitions skip this dimension. The view holds its current value regardless of what the other view does.
- **Unpinning:** resumes propagation from the current values. There is no retroactive catch-up — the next switch is the first opportunity for the pinned view to adopt the source.

`focus(target)` transitions may override a pin to expose the target (per § View Transitions). The pin state itself is not changed by the override; only that one transition bypasses it. The filter bar animation in step 3 of the `focus` sequence visibly flashes the overridden pin so the user sees what was bypassed.

**Pin persistence:** pins are persisted with the rest of the pane's state — both views' filters, chains and pins, the search query, the graph's theme choice — under one versioned key (`localStorage` in the standalone app, the webview's `setState` in VS Code); a state of another version is discarded whole (D4). Pins also survive AST live-reload (see § Live Reload).

### Search Scope

The search field is **globally shared** — a single query, owned by `WorkflowCanvas`, applied identically in both views. Typing in the search bar of one view updates the other view's search instantly. There is no per-view search state.

Search is safe to share because it is **non-destructive in both views**: it dims non-matching items rather than removing them from the visible set. The user types `PaymentWorkflow` in Tree, flips to Graph, and immediately sees the `PaymentWorkflow` node at full opacity (with surrounding nodes dimmed) — no need to retype.

Each view renders search matches in its own native style:
- **Tree View:** non-matching definitions dim to reduced opacity; matching definitions stay at full opacity. An `N of M` match count appears in the filter bar. Press `n` / `N` to jump between matches (see TREE_VIEW.md § Keyboard Navigation).
- **Graph View:** non-matching nodes dim to 20% opacity; matching nodes stay at full opacity. See GRAPH_VIEW.md § Search and Hidden Matches.

### Hidden Match Badges

When a search is active, filter chips that are hiding matches show **badge overlays** with the count of hidden matches, in both views. For example: if the Workflows chip is off and 3 workflows match the search, that chip shows a "3" badge. This lets users discover hidden matches and decide whether to adjust filters.

Because search is non-destructive, badges apply only to matches hidden by *structural* filters (the file and kind chips); search itself never hides anything. See GRAPH_VIEW.md § Search and Hidden Matches for full behavior.

### Layout Stack

The filter bar is a **single shared component** (`FilterBar`, the library's) rendered by both views — one chip section per axis in the chain, each with its pin and per-chip counts, the search, and a slot at its bottom that the host fills with its **error/warning bars**. The counts and the findings are the host's, handed in: the bar knows the taxonomy's axes and chips, not the AST. Defining it once is what keeps the two views' toolbars in lockstep.

The layout stack is:

1. **Filter bar** (`canvas-header`) — shared; visually identical across views. File chips, kind chips, search, and the error/warning bars (§ Error Handling).
2. **Content** — tree block list or graph canvas, filling remaining space.

The filter bar is always first, so users always know where to find it regardless of which view they're in.

**Definition counts on chips.** Each file and kind chip carries a muted count of the top-level definitions it represents. Kind-chip counts respect the file filter (definitions from the selected files only, or all when none selected); file-chip counts are the per-file definition totals. The counts come from the AST, handed to the bar by the host, so they read alike in both views (not the graph's deployment-expanded node count); in history mode — a graph-only payload with no definitions — they read 0.

**Graph view specifics:** in the Graph view the shared filter bar is rendered as a **floating overlay** above the canvas (the canvas fills the full viewport behind it). Zoomed-in graph content extends visibly under the edges of the overlay — an affordance signaling "there's more out here." See GRAPH_VIEW.md § Overlay Layout. The graph's simulation state and controls do not live in a top toolbar row; they float at the bottom of the canvas: node/edge counts at the bottom-left, and a centred Fit / Scheme / Play-Pause / fps cluster at the bottom-center. See GRAPH_VIEW.md § Bottom Controls. The Tree view has no simulation state to surface and uses normal vertical stack flow because its content scrolls within a fixed-width column where bleed-under provides no value.

### Graph-Specific: Edge Graduation

The graph adds one behavior on top of the shared filter bar: when a type is toggled off, edges **graduate** across hidden layers rather than disappearing. See GRAPH_VIEW.md § Edge Graduation for the rules. The tree view simply hides definitions whose type is toggled off.


## Visual Consistency

Both views use the same color palette, icon system, and theming. See [PRODUCT.md](./PRODUCT.md) § Visual Identity for the authoritative definitions.

### Expand/Collapse Affordance

Anything that can be expanded or collapsed to reveal/hide nested children — a tree
node, a definition block, a decomposition group/division with subsections — uses a
**disclosure caret** (`▶` collapsed, `▼` expanded), never a text "expand"/"collapse"
label or a separate button pair. Each caret controls exactly one thing: the
show/hide state of **its own row's direct children**. The caret sits at the leading
edge of the row; rows with no children render a same-width spacer in its place so
siblings stay aligned. This is the single, recognizable "there is more underneath"
signal across the whole visualizer.


## Initial Defaults

### Tree View
- File filter: focused file (if the AST identifies one), otherwise no files selected (= all included).
- Kind: the values the taxonomy declares default-visible — Workers and Workflows **ON**; Namespaces, the Nexus kinds and Activities **OFF**.
- Pins: every axis **unpinned** (propagation enabled).
- All definitions collapsed.

### Graph View
- File filter: same defaults as Tree (sync from Tree on first switch since pins are unset).
- Kind: same defaults as Tree View.
- Pins: every axis **unpinned**.
- Force simulation running with default strength parameters.

### Shared
- Search query empty; search bar collapsed.


## Empty States

Each view shows a centered, non-interactive message when there's nothing to display. Three cases:

| Condition | Message |
|-----------|---------|
| No payload | The host shell's `emptyState` slot (`VisualizerHost`); the standalone app's text is "Open a `.twf` file or connect to the extension to get started." |
| AST loaded, nothing matches the current filters | Tree: "No definitions match the current filters." with a hint to adjust the chips. Graph: an empty canvas and `0 nodes, 0 edges` — a message is deferred ([#181](https://github.com/jmbarzee/temporal-architect/issues/181)). |
| AST loaded, only parse errors | Show the error/warning bars (see § Error Handling below) with no content below. |

The message is centred in the content area below the filter bar.


## Error Handling

When the AST contains parse errors or warnings, both views surface them in the same way — the host's error/warning bars, rendered into the shared filter bar's findings slot. The shapes are the parser's; the bar's library knows nothing of them.

### Error and Warning Bars

Findings are split by **severity** into two independent bars at the bottom of the filter bar:

- **Errors bar** (red) — process-level `FileError`s plus `error`-severity diagnostics.
- **Warnings bar** (yellow) — `warning`-severity diagnostics.

Each bar:

- Renders only when it has at least one finding of that severity.
- Shows the count for its severity (`N errors`, `M warnings`).
- Is **collapsed by default** — it is a notification, expanded on demand. Each bar collapses/expands independently.
- Has its own **scrollable body** so a long list never pushes the rest of the toolbar off-screen.
- Splits its body into **Shown files** / **Hidden files** sub-groups (by the current file filter) when the filter is hiding findings, so the user sees which findings the filter is keeping out of view. Each detail row shows the code and message, and the file name and position when the finding carries a file (graph-stage findings do not).

### Errors Are Informational

Errors do not block rendering. Both views still render whatever valid definitions exist in the partial AST. The error/warning bars are notifications, not a gate.


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
| Selection | Tree: preserved if the item still exists. Graph: cleared on every rebuild ([#180](https://github.com/jmbarzee/temporal-architect/issues/180)). |

**Tree-view-specific:**

| State | Behavior |
|-------|----------|
| Expand/collapse | Preserved for definitions that still exist (matched by name). New definitions appear collapsed. |
| Scroll position | Preserved. If the scrolled-to definition was removed, scroll to the nearest surviving sibling. |
| Contextual nav buttons | Recomputed from new AST (reverse index rebuilt). |

**Graph-view-specific:**

| State | Behavior |
|-------|----------|
| Node positions | **Not yet** ([#180](https://github.com/jmbarzee/temporal-architect/issues/180)): every changed payload builds a new simulation, which reseeds every node from its band. |
| Viewport (zoom/pan) | Refit after the rebuild (#180). |
| Kind selections | Preserved. |
| Force parameters | Preserved (slider values unchanged). |

### Additions and Removals

**Tree View:**
- New definitions appear in their natural position (sorted by type and order in AST), collapsed, with no special animation.
- Removed definitions disappear immediately. If expanded, children vanish with them.

**Graph View:**
- New and surviving nodes alike are reseeded by the rebuild (#180); seeding new nodes at their parent while the rest stay put is the intended behaviour.
- Removed nodes disappear with their edges; the fade (~200 ms) is intended, not built ([#186](https://github.com/jmbarzee/temporal-architect/issues/186)).

### Transition Indicator

A brief, non-blocking indicator (e.g., a subtle flash on the header bar, or a small "updated" badge that fades) signals that the AST has been refreshed. This should not interrupt the user's current interaction. Today the Tree flashes its header on refresh; the Graph shows no indicator.


## Accessibility

### ARIA Roles

Both views follow WAI-ARIA guidance for their respective interaction models:
- **Tree View:** `role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-level` — following the WAI-ARIA Treeview pattern.
- **Graph View:** the canvas keeps a virtual keyboard focus over its nodes; focusable, labelled node elements are deferred ([#182](https://github.com/jmbarzee/temporal-architect/issues/182)).

The key requirement is that screen readers can announce identity (type and name), state (expanded/collapsed, selected/unselected), and relationships (nesting depth, dependency connections). Specific ARIA attributes beyond these requirements are implementation concerns.

### Focus Indicators

Both views show a visible focus ring on the currently focused item (block or node). The focus ring is visually distinct from hover highlight and selection highlight. Focus follows keyboard navigation and is independent of mouse hover.

### Keyboard Navigation

Each view defines its own key bindings (see TREE_VIEW.md § Keyboard Navigation and GRAPH_VIEW.md § Keyboard Navigation). Shared keyboard patterns:

| Key | Behavior (both views) |
|-----|----------------------|
| **/** (and **Ctrl+F** in the Tree) | Open search bar and focus the search input |
| **Escape** | Close search bar, clear selection, or close any open popover (in priority order) |
| **Tab** | Tree: move focus between header controls and the content area. Graph: cycle the focused node (the pane captures Tab — #182) |


## Keyboard Modifier Vocabulary

Modifier keys have consistent meanings across the entire visualizer. This prevents views from independently defining conflicting modifier semantics.

| Modifier | Meaning | Used In |
|----------|---------|---------|
| **Shift** (with hover/focus) | Reverse dependency direction — show **upstream** dependents instead of downstream dependencies | Graph View: Interaction States |
| **Shift+Tab** | Reverse focus cycling | Both views: standard browser/OS convention |

### Multi-Select

Deferred — [#50](https://github.com/jmbarzee/temporal-architect/issues/50); specced in [GRAPH_VIEW.md](./GRAPH_VIEW.md) § Multi-Select. The modifier assignment is fixed here because Shift already means dependency-direction reversal: multi-select uses **Ctrl+click** (Windows/Linux) or **Meta+click** (macOS).
