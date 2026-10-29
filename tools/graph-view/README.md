# @temporal-architect/graph-view

A force-directed graph view with composable dimensions, as a React component.

A host declares what its graph is made of — the **dimensions** its nodes carry,
the **values** on each, and for the style axis a colour, size, icon and physics
per value, plus how an edge classifies from the values at its ends — through
`createOntology(spec)`. It builds a `Graph` of nodes and edges carrying
dimension maps, and mounts `GraphView`. The view lays the graph out (push and
pull on any axis the nodes carry, two layout axes keyed on an axis or a computed
scalar), filters it on any declared axis, highlights it, and lets the user tune
the forces — without knowing what any node or edge means. The host's vocabulary
never enters this package; a ratchet in the first host's package holds it at
zero.

## Status

Not yet published. In this repository the visualizer (`tools/visualizer/`) is
the first host and consumes the library from source through its build's alias;
`npm run build:lib` here produces the standalone artifact (`dist-lib/`: the
bundle, one stylesheet, the declarations the entry reaches), and
`make pack-graph-view-lib` packs it. Publishing under the organisation's scope
is a release decision.

## Install (once published)

`react` and `react-dom` are peer dependencies (`^18 || ^19`). Import the
stylesheet once — it carries the design tokens and every component's rules:

```ts
import '@temporal-architect/graph-view/styles.css'
```

## The contract

- `createOntology(spec: OntologySpec): Ontology` — the taxonomy. The style
  axis and its ordered `values`, each a `NodeStyle`: an id, a label and a
  colour per theme are required; abbreviation, icon, size, physics (charge,
  core radius, a rest band per layout axis) and the hidden-node policy
  default from the label, the size and the value's position in the order
  (top of the hierarchy first). `edgeTypes` with a stroke each and the rule
  that classifies an edge; `filterDimensions`, each an id, a label and what
  an empty selection means, the policies and the chips defaulting from that
  and an `initialSelection` for the first open; optional scalar axes and the
  hooks a host may supply (a hover box's context line, the text the search
  matches on, a highlight, which of two colliding edges survives). An incoherent spec is refused at
  construction, loudly.
- `Graph` — `nodes` and `edges`, each carrying `dimensions` and an opaque
  `payload` the view never reads. Every edge carries `relation`
  (`containment` or `dependency`). A node's `parentId` names its container;
  the view derives the containment edge from it, so a host writes the fact
  once. Containment is a tree: an entity that sits in two containers is two
  nodes sharing a `copyKey`, and the library indexes the copies
  (`copyGroups`), draws their halo and counts them in the hover box. A node
  may carry `badges` (short texts drawn as chips above it) and a `ring`.
- `GraphView` — the component. It needs the `graph`, a taxonomy (the
  `ontology` prop, or an `OntologyContext.Provider` above), and a parent
  that is a flex column with a height (the pane fills what it is given and
  renders at zero height otherwise). Everything else is optional. The filter,
  the pins, the chain of axes shown, the search control and the theme choice
  each follow the React convention: pass the value and its callback to
  control it, neither to let the view keep it, the callback alone to be
  told. The chip `counts` (the graph's node counts unless given), the
  `findings` under the bar, the `groups` to glow (each with a `color` or the
  palette's), a `crossView` action for the hover box, `controls` and
  `themeToggle` to hide the panel and the theme button, `className`, `style`
  and `positions` (a kept layout) are inputs; `onSelectionChange`,
  `onNodeActivate`, `onHover` and `onThemeResolved` are outputs. Through its
  ref, `focusNode(id)` reveals, centres and selects a node in one call,
  `fit()` frames the visible set, and `getPositions()` / `setPositions()`
  carry a layout out and back in. The theme the pane resolves (`onThemeResolved`)
  is for the host's own chrome beside the pane, never for a `data-theme` on an
  ancestor of it: the pane reads that ancestor to resolve `system`, so writing
  the answer there locks it. `keyboard` scopes the shortcuts: `pane`
  (the focusable root), `global` (the window — a tab shell's active tab) or
  `none`. Keep one `graph` object until its nodes or edges change: a new
  object of the same shape rebuilds the layout for nothing, and the view
  says so once; a changed graph keeps the positions of the nodes it still
  has. Filter chips rendered outside the pane (`FilterBar`, for a second
  view sharing the bar) take the `graph` or the `values` per axis, and
  default the rest.

`src/index.ts` names the whole surface; the tarball ships `dist-lib/`, this
file and the licence.
