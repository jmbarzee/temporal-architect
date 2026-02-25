# View Framework

The visualizer has two views — Tree View and Graph View — that show the same data from different perspectives. This document specifies how they compose into a single product: view switching, cross-view navigation, and all shared behaviors that apply identically to both views.

For the product vision, user goals, UX principles, and visual identity, see [PRODUCT.md](./PRODUCT.md).


## View Model

The views use a **tab switching** model. One view is active at a time. Each view maintains its own state (filter selections, scroll/zoom position, expand/collapse state) independently.

**Default view:** Tree View is the default on first load. It's the more familiar interaction model (collapsible list) and works immediately with any AST. Graph View is a "power view" the user discovers via the tab bar.


## Tab Bar

A tab bar at the top of the visualizer with two tabs: **Tree** and **Graph**. The active tab is visually highlighted. Clicking a tab switches the active view.

**State on switch:** Each view preserves its own state across tab switches. Switching from Tree to Graph and back returns the Tree to exactly where it was — scroll position, expanded blocks, filter selections, search query. Same for Graph: zoom level, node positions, type toggle selections, simulation state.


## "Show in [View]" Action

A contextual action available on any identifiable item (a definition block in the tree, a node in the graph) that opens the other view focused on that item.

### Trigger Points

- **Tree View:** Action available on definition block headers (workflow, activity, worker, namespace, nexus service). Accessible via right-click context menu or the "Show in Graph" contextual navigation button.
- **Graph View:** Action available on nodes. Accessible via right-click context menu. (Double-click is reserved for graph-native "center and zoom to fit" — see GRAPH_VIEW.md § Viewport Controls.)

### Behavior Sequence

When the user invokes "Show in [target view]" on an item:

1. **Switch tab** — The target view becomes active (instant, no animation).
2. **Adjust filters** — Make the minimum filter changes needed to ensure the item is visible in the target view:
   - If the item's type is toggled off, toggle it on.
   - If the item's source file is filtered out, add it to the file selection.
   - Do not clear other active filters — only expand, never narrow.
   Because the filter bar is visually identical in both views, the user sees familiar controls change — a toggle lights up, a chip activates. This continuity across views reduces disorientation.
3. **Animate filter bar** — The filter controls animate to reflect the changes (toggles flip, chips activate). This gives the user a visual explanation of what changed.
4. **Animate view to target:**
   - **Tree View:** Smooth scroll to the target definition. Expand the target block's ancestry (any collapsed parents that contain it). Expand the target block itself.
   - **Graph View:** Pan and zoom to center the target node **and its immediate neighbors** — a local-first orientation. Lock viewport focus on the target node until the simulation stabilizes (the node stops moving). The user can break the lock by manually panning or zooming out to see broader context.
5. **Flash target** — After the view has settled, briefly highlight the target item (a pulse or glow effect) to draw the eye.

### Orientation

The transition should go **local → context**, not context → find-the-needle. When navigating to the graph, the user first sees the target node and its neighborhood (close zoom), then optionally zooms out to see the broader graph. When navigating to the tree, the user first sees the target block expanded and centered, then optionally scrolls to see siblings.

This local-first approach means the user lands oriented — they see the thing they asked about immediately, in its immediate relationships, before the full complexity of the target view is revealed.

### Filter-as-Source-of-Truth

Filters are always authoritative. "Show in [view]" never bypasses filters — it adjusts them. The user can always see exactly what's filtered and manually change it. The animation of the filter bar in step 3 makes the adjustment visible and reversible.


## Unified Filter Bar

Both views display the same visual filter bar with the same three filter dimensions:

```
[file chips...] | [NS] [Worker] [Wf] [Act] [Nxs] | [🔍 search]
```

**Source file chips** — One chip per `.twf` file in the AST. Click to toggle visibility. When the filter narrows to a single file, the extension opens that file in the editor.

**Type toggles** — Five toggle buttons, one per definition type, using the type's color: NS (dark grey), Worker (medium grey), Wf (purple), Act (blue), Nxs (pink). Each toggle shows/hides all items of that type. Both views use the same five toggles — the graph no longer has a separate level selector.

**Name search** — Text input (toggled by `/` or `Ctrl+F`). Case-insensitive substring match against definition/node names. In the tree, non-matching definitions are hidden. In the graph, non-matching nodes dim while matches highlight.

### Independent State

Filter state is **independent per view**. Each view's toggles, file chips, and search can diverge without affecting the other. The visual bar looks the same in both views, but the active toggles may differ.

Default state is the same for both views: Workers and Workflows **ON**; Namespaces, Activities, and NexusServices **OFF**. No search active.

### Layout Stack

The layout stack is identical in both views:

1. **Filter bar** (`canvas-header`) — shared; visually identical across views. File chips, type toggles, search.
2. **View toolbar** — view-specific controls directly below the filter bar. The graph view has a toolbar with node/edge count, Fit, and Play/Pause quick-access. The tree view has no separate toolbar (it has no simulation state to surface).
3. **Errors header** — present only when parse errors exist. Same collapsible pattern in both views.
4. **Content** — tree block list or graph canvas, filling remaining space.

This stack order is fixed. The filter is always first, so users always know where to find it regardless of which view they're in.

### Hidden Match Badges

When a search is active, filter controls that are hiding matches show **badge overlays** with the count of hidden matches. For example: if the Wf toggle is off and 3 workflows match the search, the Wf button shows a "3" badge. This lets users discover hidden matches and decide whether to adjust filters. See GRAPH_VIEW.md § Search and Hidden Matches for full behavior.

### Graph-Specific: Edge Graduation

The graph adds one behavior on top of the shared filter bar: when a type is toggled off, edges **graduate** across hidden layers rather than disappearing. See GRAPH_VIEW.md § Edge Graduation for the rules. The tree view simply hides definitions whose type is toggled off.

**Future:** A mechanism for the user to sync filter state across views (e.g., "apply these filters to both views"). To be designed after cross-view navigation is in use.


## Visual Consistency

Both views use the same color palette, icon system, and theming. See [PRODUCT.md](./PRODUCT.md) § Visual Identity for the authoritative definitions.


## Initial Defaults

### Tree View
- Definition type toggles: Workers and Workflows **ON**; Namespaces, Nexus Services, and Activities **OFF**.
- All definitions collapsed.
- No search query active.

### Graph View
- Type toggles: same defaults as Tree View — Workers and Workflows **ON**; Namespaces, Activities, and NexusServices **OFF**.
- No search query active.
- Force simulation running with default strength parameters.


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
| Filter selections | Preserved. If a filtered file no longer exists, remove it from the selection. |
| Search query | Preserved. Results recomputed against new data. |
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
