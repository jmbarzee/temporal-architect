# Tree View

The tree view is the primary view for the TWF Visualizer. It renders every definition from the AST as a collapsible, color-coded block in a vertical list. Nesting is achieved through progressive disclosure — clicking a block header expands it to reveal its children.


## User Goals

This view serves goals 1–5 (individual definition questions) from [PRODUCT.md](./PRODUCT.md) § User Goals.


## Existing codebase context

### Architecture
- **React 18** + **TypeScript** + **Vite** (no additional UI libraries)
- Entry points: `src/main.tsx` (standalone dev) and `src/webview.tsx` (VS Code webview)
- Both entry points load AST data and pass it as `TWFFile` to `<WorkflowCanvas>`
- Shared type definitions in `src/types/ast.ts`
- Theme configuration (icons, labels, CSS variable prefixes) centralized in `src/theme/temporal-theme.tsx`
- Styles split across `src/styles/index.css` (global layout, header, theme variables) and `src/components/blocks/blocks.css` (block-level variables and styles)
- CSS variables provide full light/dark theme support; dark theme activates via `.vscode-dark` or `[data-theme="dark"]`

### File structure
```
src/
  App.tsx                          — Standalone app shell (file upload, query param loading)
  main.tsx                         — Standalone entry point
  webview.tsx                      — VS Code webview entry point
  types/
    ast.ts                         — TypeScript types mirroring the Go AST JSON
  theme/
    temporal-theme.tsx             — Central icon/label/CSS-prefix map for all primitives
  styles/
    index.css                      — Global styles, layout, header, theme variables
  components/
    WorkflowCanvas.tsx             — Main tree view component + DefinitionContext + header/filters
    icons/
      GearIcons.tsx                — SVG icons (search, single gear, interlocking gears)
    blocks/
      blocks.css                   — All block-level CSS variables and styles
      useToggle.ts                 — Shared expand/collapse hook
      DefinitionBlock.tsx          — Top-level definition router + namespace/worker/activity/nexus blocks
      StatementBlock.tsx           — Statement router (dispatches to leaf/call/control-flow blocks)
      WorkflowContent.tsx          — Workflow body renderer (state, handlers, body) + inline workflow/sync body blocks
      CallBlocks.tsx               — Activity call, workflow call, nexus call blocks
      AwaitBlocks.tsx              — Await statement, await all, await one blocks
      ControlFlowBlocks.tsx        — Switch, if, for blocks
      LeafBlocks.tsx               — Return, close, raw, promise, set, unset, break, continue blocks
```


## Data flow

1. AST JSON (`TWFFile`) arrives via file upload, URL query param, or VS Code `postMessage`
2. `WorkflowCanvas` receives the AST as a prop
3. `WorkflowCanvas` builds a `DefinitionContext` — lookup maps keyed by name for workflows, activities, workers, nexus services, and namespaces
4. `DefinitionContext` is provided via React context so any nested block can resolve references (e.g., a workflow call block can look up the target workflow's definition to render its body inline)
5. Each `WorkflowDef` additionally builds a `HandlerContext` with maps for its signals, queries, and updates, so await blocks can resolve handler references


## Header and filtering

The tree view uses the unified filter bar described in [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Unified Filter Bar. The bar contains file chips (with pin), type toggles (with pin), and a search input — visually identical to the graph view's filter bar. The structural filter dimensions (files, types) are per-view and reconciled on every view switch; the search query is globally shared.

Tree-view-specific behaviors:
- Toggling a type off hides all definitions of that type from the list (no edge graduation — that's graph-specific).
- Search is **non-destructive**: non-matching definition blocks dim to reduced opacity; matching definitions stay at full opacity. An `N of M` match-count indicator appears in the filter bar while a query is active. Press `n` / `N` to jump focus between matches (see § Keyboard Navigation).
- When exactly one file chip is selected, the VS Code webview sends an `openFile` message to focus that file in the editor.

### Errors header
- Shown only when the AST contains parse errors
- A collapsible bar below the filter bar with error count
- Errors are grouped by "shown files" (matching the file filter) and "hidden files"
- Each error displays the file name and the error/stderr message


## Block rendering

### Block anatomy
Every block follows the same layout pattern:

```
┌──────────────────────────────────────────────┐
│ ▶  ⚙⚙  workflow  MyWorkflow(params) → Type  │  ← header (toggle, icon, keyword, signature)
└──────────────────────────────────────────────┘
```

When expanded:

```
┌──────────────────────────────────────────────┐
│ ▼  ⚙⚙  workflow  MyWorkflow(params) → Type  │  ← header
│    ┌─────────────────────────────────────┐   │
│    │  (nested child blocks)              │   │  ← body (indented left margin)
│    └─────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

Header elements (left to right):
1. **Toggle indicator** — `▶` (collapsed) or `▼` (expanded). Placeholder space if not expandable.
2. **Icon** — type-specific icon (text emoji or SVG). Workflows use interlocking gears SVG, activities use single gear SVG.
3. **Keyword** — bold text identifying the block type (e.g., `workflow`, `activity`, `await`, `if`)
4. **Signature** — the name, params, and return type. Truncated with ellipsis if too long. Full text shown on hover via tooltip.

Body:
- Indented via left margin (20px) + left padding (12px)
- Contains child blocks rendered recursively

### Expand/collapse behavior
- `useToggle` hook manages open/closed state per block
- Blocks that reference an unresolvable definition are not expandable (`canToggle: false`)
- Expanded blocks gain a subtle box shadow
- Top-level definition blocks (workflow, worker, namespace) start collapsed
- Control flow blocks (if, for, switch, await all, await one) start expanded
- Default initial state varies by block type


## Options

Option-bearing blocks render their `options:` block as a **collapsible, neutrally-colored box** at the top of the expanded block body, above any inline-expanded definition content. This covers:

- **Calls** — activity, workflow, and nexus calls (`task_queue`, timeouts, `retry_policy`, `priority`, etc.)
- **Handler declarations** — signal, query, and update handlers (`unfinished_policy`, `description`)
- **Namespace entries** — worker and nexus-endpoint deployment config

Presentation:
- The box uses the **neutral control palette** (grey), not a type color, so it reads as metadata distinct from the type-colored definition/call blocks.
- It is collapsed by default (progressive disclosure). Collapsed, the header shows an `options` label and a muted summary of the top-level option keys. Expanded, it shows the full recursive key/value list.
- Each entry renders as a `key: value` row in monospace; nested blocks (e.g. `retry_policy`, `priority`) indent their sub-entries by exactly one nesting level. **Indentation is the only thing that changes with depth — text size and color stay constant at every level** so deep option trees read calmly rather than chaotically.

Because the options box lives in the expanded body, a block that carries options becomes **expandable even when its reference is unresolved or it has no inline body** (e.g. an activity call to an undefined activity, or a nexus endpoint, which otherwise would not expand). The toggle indicator appears whenever a block has either inline content or options.


## Block Summaries

Collapsed definition headers display a **summary annotation** — a short, muted string after the signature that communicates the block's structural shape without expanding it. Summaries are derived from the AST at render time. See [PRODUCT.md](./PRODUCT.md) § Glanceable summaries for the design principle.

### Summary Content by Definition Type

| Type | Summary | Example |
|------|---------|---------|
| Workflow | statement count · call count · handler count | `12 steps · 3 calls · 2 handlers` |
| Activity | statement count | `5 steps` |
| Worker | registration breakdown by type | `3 workflows · 1 activity` |
| Namespace | worker count · endpoint count | `4 workers · 2 endpoints` |
| NexusService | operation count by type | `2 async · 1 sync` |

### Presentation

- Summaries appear as secondary text — smaller font size, muted color — to the right of the signature, separated by a visual gap.
- When a block is expanded, the summary is hidden (the body itself is the detail).
- Counts of zero are omitted (a workflow with no handlers shows `12 steps · 3 calls`, not `12 steps · 3 calls · 0 handlers`).
- Summaries are not interactive — they're read-only annotations.


## Definition types

### Namespace (`namespaceDef`)
- Dark grey color palette
- Header shows name and entry count
- Body contains two sections:
  - **Workers** — each renders as a worker-colored sub-entry that, when expanded, shows the full worker body (workflow/activity/service ref lists)
  - **Nexus endpoints** — each renders as a nexus-colored sub-entry (not expandable). These are deployment routing entries (endpoint name + task queue), distinct from nexus service *definitions* which are registered on workers and contain operations. A nexus call references both: the endpoint (where to route) and the service + operation (what to call).

### Worker (`workerDef`)
- Medium grey color palette
- Header shows name and total reference count across all categories
- Body contains up to three labeled sections:
  - **Workflows** — each ref is a purple sub-entry that expands to show the workflow's full content
  - **Activities** — each ref is a blue sub-entry that expands to show the activity's body
  - **Nexus services** — each ref is a pink sub-entry that expands to show the service's operations

### Workflow (`workflowDef`)
- Purple color palette, 2px solid border (heavier than call-level blocks)
- Body uses `WorkflowContent` which renders (in order):
  1. **State** — collapsible group showing conditions and raw state declarations
  2. **Signals** — collapsible group of signal handler declarations (dashed border)
  3. **Queries** — collapsible group of query handler declarations (dashed border)
  4. **Updates** — collapsible group of update handler declarations (dashed border)
  5. **Body statements** — the workflow's statement list rendered recursively

### Activity (`activityDef`)
- Blue color palette, 2px solid border
- Body contains the activity's statement list

### Nexus Service (`nexusServiceDef`)
- Deep pink color palette, 2px solid border
- Body lists nexus operations, each rendered as a sub-block:
  - **Async operations** — expandable if a backing workflow is found; expands to show the workflow inline
  - **Sync operations** — expandable if a body is present; expands to show the handler body


## Statement types

Statements are rendered by `StatementBlock` which routes to specialized block components:

### Call blocks
| Statement | Keyword | Color | Expandable |
|-----------|---------|-------|------------|
| Activity call | `activity` | Blue | Yes — shows activity definition body |
| Workflow call | `workflow` or `detach workflow` | Light purple | Yes — shows workflow content |
| Nexus call | `nexus` or `detach nexus` | Pink | Yes — shows backing workflow or sync handler body |

- Detached calls (fire-and-forget) use a **dashed border** to distinguish from synchronous calls
- Unresolved references (definition not in scope) use a dashed border + reduced opacity + a circled `?` badge

### Await blocks
| Statement | Keyword | Color |
|-----------|---------|-------|
| Await timer | `await timer` | Yellow |
| Await signal | `await signal` | Red/pink |
| Await update | `await update` | Orange |
| Await activity | `await activity` | Blue |
| Await workflow | `await workflow` | Light purple |
| Await nexus | `await nexus` | Pink |
| Await ident | `await` | Teal |
| Await all | `await all` | Grey |
| Await one | `await one` | Grey |

- **Await all** — expands to show its concurrent branch statements
- **Await one** — expands to show its cases, each rendered as a **tagged composite** (a grey "option" tag on the left, the case content block on the right)
- Tagged composites are expandable when the case has a body

### Control flow blocks
| Statement | Keyword | Color |
|-----------|---------|-------|
| If | `if` | Grey/slate |
| For | `for` | Grey/slate |
| Switch | `switch` | Grey/slate |

- `if` bodies show a `then` branch and optionally an `else:` branch
- `for` shows the loop variant in its signature: iteration (`x in items`), conditional (`condition`), or infinite (`∞`)
- `switch` expands to show case blocks and an optional default

### Leaf blocks (non-expandable)
| Statement | Keyword | Color |
|-----------|---------|-------|
| Return | `return` | Green |
| Close (complete) | `close complete` | Green |
| Close (fail) | `close fail` | Red/pink |
| Close (continue as new) | `close continue_as_new` | Orange |
| Promise | `promise` | Cyan/teal |
| Set | `set` | Subtle grey |
| Unset | `unset` | Subtle grey |
| Raw | (code text) | Light grey |
| Break | `break` | Subtle grey |
| Continue | `continue` | Subtle grey |
| Comment | `comment` | Light grey |


## Cross-reference resolution

The tree view supports **inline expansion** of referenced definitions. When a call block (activity, workflow, nexus) is expanded, it doesn't navigate elsewhere — it renders the target definition's content directly as nested children. This works through the `DefinitionContext`:

- A workflow call block looks up the target `WorkflowDef` by name and renders `<WorkflowContent>` inline
- A nexus call block resolves the service → operation chain, then either renders the backing workflow inline (async) or the handler body (sync)
- Worker ref items within a worker definition expand to show the referenced workflow, activity, or nexus service content
- Namespace worker entries expand to show the full worker body

Unresolved references (name not found in context) are marked visually but do not prevent rendering.


## Contextual navigation buttons

Every block in the tree view supports **contextual navigation** — small action buttons that appear on hover, positioned at the top-right of the block header, half-overlapping the upper border. These provide focus-shifting actions: navigating to callers, parent containers, or the graph view.

### Available actions by block type

| Block type | Available buttons |
|------------|-------------------|
| Workflow definition | Show callers, Show worker, Show in Graph |
| Activity definition | Show callers, Show worker, Show in Graph |
| NexusService definition | Show callers, Show worker, Show in Graph |
| Worker definition | Show namespace, Show in Graph |
| Namespace definition | Show in Graph |
| Call block (activity/workflow/nexus call) | Show definition, Show in Graph |
| Handler declaration (signal/query/update) | Show callers *(future — requires send-side DSL syntax)* |

Buttons only appear when the action has at least one valid target. If a definition has no callers, "Show callers" does not appear.

### Behavior

- **Single target:** Clicking the button scrolls the tree view to the target, expanding its ancestry if needed, and flashes the target. Same animation sequence as "Show in [View]" (see [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md)).
- **Multiple targets:** Clicking the button opens a small popover listing the targets. The user selects one, then the view navigates to it.
- **Show in Graph:** Follows the cross-view "Show in [View]" sequence from VIEW_FRAMEWORK.md.

### Data requirements

The visualizer builds a **reverse reference index** client-side from the AST's forward references. For each definition, the index maps its name to the set of call sites (workflow + statement location) that reference it. Names are unique per definition type (the resolver enforces this), so the key is the simple name — no qualified naming needed. This is computed from the same data already used by `DefinitionContext` — no parser changes needed.


## Visual Design

Color palette, icon system, theming, and border conventions are defined in [PRODUCT.md](./PRODUCT.md) § Visual Identity.


## Scale Behavior

See [PRODUCT.md](./PRODUCT.md) § Density management for the cross-cutting principle.

The tree view is a flat list of definitions filtered by type, source file, and search. At moderate scale (20–50 definitions), filters are sufficient. At larger scale:

- **Virtualized rendering** — Only render definition blocks visible in the scroll viewport (plus a small overscan buffer). Off-screen blocks are replaced by placeholder elements at the correct height. This keeps DOM size bounded regardless of definition count.
- **Grouped headers** — When many definitions are visible, consider grouping by source file with collapsible file-level headers. This adds a navigation layer between "everything" and "individual definition" without changing the filter model.
- **Search-first discovery** — At scale, browsing becomes impractical. The search bar becomes the primary navigation tool. Search should feel instant (no debounce delay at <500 definitions) and highlight matches in-place.

These are progressive enhancements — the current flat-list-with-filters approach works well at the expected scale of most TWF projects. Add virtualization and grouping when real usage demonstrates the need.


## Live Reload

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Live Reload for the shared reload behavior (identity matching, state preservation, transition indicator). Tree-view-specific reload details are documented there.


## Keyboard Navigation

The tree view supports keyboard navigation following the same model as VS Code's tree widget.

### Key Bindings

| Key | Action |
|-----|--------|
| **↑ / ↓** | Move focus to previous / next visible block (siblings and across nesting levels) |
| **→** | Expand focused block (if collapsed). If already expanded, move focus to first child. |
| **←** | Collapse focused block (if expanded). If already collapsed, move focus to parent. |
| **Enter** | Toggle expand/collapse on focused block |
| **Home / End** | Move focus to first / last visible block |
| **/** or **Ctrl+F** | Open search bar and focus the search input |
| **n / N** | Jump focus to next / previous search match (only when a search query is active) |
| **Escape** | Close search bar (if open), clear selection, or close any open popover |
| **Tab** | Move focus between header controls (file filter, type toggles, search) and the block list |

### Focus Indicator

The currently focused block has a visible focus ring (distinct from hover and selection styles). Focus follows keyboard navigation and is independent of mouse hover.

### Bulk Expand/Collapse (future)

For large ASTs with many definitions, expanding one at a time can be tedious. A future keyboard shortcut (e.g., **Ctrl+Shift+→** to expand all at the current level, **Ctrl+Shift+←** to collapse all) would help.

### Accessibility

See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) § Accessibility for the shared accessibility approach (ARIA roles, focus indicators). The tree view follows the WAI-ARIA Treeview pattern (`role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-level`).


## Cross-View Navigation

The tree view participates in the visualizer's cross-view navigation system. See [VIEW_FRAMEWORK.md](./VIEW_FRAMEWORK.md) for view switching, "Show in Graph" actions, shared filter vocabulary, and other shared behaviors.
