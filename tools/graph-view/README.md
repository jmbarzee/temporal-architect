# @temporal-architect/graph-view

A force-directed graph view with composable axes, as a React component.

A host declares what its graph is made of — the **axes** its nodes carry values on,
the **values** on each, and for the style axis a colour per value — through
`createTaxonomy(spec)`. It builds a `Graph` of nodes and edges carrying
their values on those axes, and mounts `GraphView`. The view lays the graph out (push and
pull on any axis the nodes carry, two layout axes keyed on an axis or a
computed scalar), filters it on any declared axis, highlights it, and lets the
user tune the forces — without knowing what any node or edge means. The host's
vocabulary never enters this package.

## Status

Not yet published. In this repository the visualizer (`tools/visualizer/`) is
the first host and consumes the library from source through its build's alias;
`examples/course-catalog/` is the second, written against the public entry
alone. `npm run build:lib` produces the standalone artifact (`dist-lib/`: the
bundle, one stylesheet, the declarations the entry reaches), and
`make pack-graph-view-lib` packs it. Publishing under the organisation's scope
is a release decision.

## Install (once published)

```bash
npm install @temporal-architect/graph-view
```

`react` and `react-dom` are peer dependencies (`^18 || ^19`). The package is
ESM only. Import the stylesheet once — it carries the design tokens and every
component's rules.

## Quick start

The smallest host: a taxonomy of two values and two edge types, a graph of
three nodes, the view. The block below is compiled against the shipped
declarations by the artifact gate, so it cannot drift from the surface.

```tsx
import { createTaxonomy, GraphView } from '@temporal-architect/graph-view'
import type { Graph, GraphNode } from '@temporal-architect/graph-view'
import '@temporal-architect/graph-view/styles.css'

const taxonomy = createTaxonomy({
  styleAxis: 'kind',
  styles: [
    { id: 'team', label: 'Team', icon: '⌂', summaryKind: 'children',
      color: { light: { fill: '#475569', border: '#1E293B' }, dark: { fill: '#94A3B8', border: '#475569' } }, size: { r: 18 } },
    { id: 'service', label: 'Service', icon: '◆',
      color: { light: { fill: '#0F766E', border: '#134E4A' }, dark: { fill: '#2DD4BF', border: '#0F766E' } } },
  ],
  edgeTypes: [
    { id: 'owns', sourceValue: 'service', targetValue: 'team', relation: 'containment' },
    { id: 'calls', sourceValue: 'service', targetValue: 'service', relation: 'dependency',
      style: { color: { light: '#0F766E', dark: '#5EEAD4' }, width: 1.5 } },
  ],
})

const nodes: GraphNode[] = [
  { id: 'payments', name: 'Payments', values: { kind: 'team' } },
  { id: 'checkout', name: 'Checkout', values: { kind: 'service' }, parentId: 'payments' },
  { id: 'ledger', name: 'Ledger', values: { kind: 'service' }, parentId: 'payments' },
]
const graph: Graph = {
  nodes,
  edges: [{ id: 'checkout→ledger', sourceId: 'checkout', targetId: 'ledger' }],
}

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <GraphView graph={graph} taxonomy={taxonomy} />
    </div>
  )
}
```

The containment edges from each service to its team are derived from
`parentId`; the edge between the services is a dependency unless it says
otherwise, and is classified as `calls` because that is the one declared type
between two services; the filter axis is the style axis unless others are
declared; the filter, the locks, the axes shown, the search, the theme, the
selection and the layout are the view's own until the host asks for them.

## The taxonomy

`createTaxonomy(spec: TaxonomySpec): Taxonomy`. An incoherent spec — a value
declared twice, an edge type between values nobody declares, a colour no reader
can parse, a band whose ends cross — is refused at construction, loudly. To
derive a variant, build one from the spec (`createTaxonomy({ ...spec, … })`),
never by spreading the built object.

- **The style axis and its values.** `styleAxis` names the axis every
  node is styled on; `styles` lists its values' styles, top of the hierarchy
  first.
  A `NodeStyle` needs its `id`, `label` and `color` (fill and border, per
  theme: hex, `rgb()` or `hsl()`); everything else has a default, and a
  value that restates one says nothing:

  | field | default |
  |---|---|
  | `abbreviation` | the label's first two characters |
  | `icon` | none |
  | `size.r` / `size.iconSize` | 12 / nine tenths of `r`, rounded, at least 9 |
  | `physics.charge` / `physics.coreRadius` | −40 r / 4 r |
  | `physics.band.y` | the value's slice of the stack, by its position in the order |
  | `physics.band.x` | 0 to 380 (`BAND_FRAME.x`) |
  | `whenHidden` | `ascend`: a dependency edge touching a hidden node re-points to its nearest visible ancestor; `splice` follows the node's own edges through |
  | `summaryKind` | `degree` (`→3 ←2` in the hover box); `children` counts what the node contains; `none` shows neither |

  `fallbackStyle` draws a value nobody declared; `styleLabel` names the axis
  in the controls.
- **Edge types and classification.** Each `EdgeType` has an `id`, the
  `sourceValue` and `targetValue` it runs between — a style value, or several
  at either end: the type runs between every source value and every target
  value — and its `relation` (`containment` or `dependency`); `label`
  defaults to the id, `style` (colour per theme, alpha, dash, width) field by
  field to the relation's stroke (`NEUTRAL_STROKE`, a quiet solid grey;
  `CONTAINMENT_STROKE`, the same grey faint and dashed, for a containment
  type), `physics` (a spring's strength and rest length) to a middling
  spring, `tooltip` to the label. An edge is classified once, on the style
  values of its original endpoints: the declared type of its relation whose
  endpoints match in either orientation and whose `match` — values the edge
  itself must carry on the host's edge axes — its `values` satisfy. Two
  types on one pair are told apart by `match` (a call and a signal between
  two services, by the edge's `kind`), with the type that declares none as
  the fallback, or by their declared orientation: a satisfied `match` beats
  the pair alone, the declared orientation beats the reverse, and declaration
  order settles the rest. Two types nothing tells apart are refused at
  construction unless the host gives `classifyEdge(edge, sourceValue,
  targetValue, declared)`, which sees what the declarations answered and may
  keep it, replace it, or supply a type where they answered none — the
  exceptions declarations cannot express. An edge keeps its type when
  graduation re-points it (graduation: a dependency edge whose end is hidden
  is re-pointed to a visible node — see Collapse rules); an edge no type
  claims draws in its relation's stroke, pulls nothing while push and pull
  key on the style axis (on another axis every edge is sprung by its
  endpoints' buckets), and `validateGraph` says so.
- **Filter axes.** `filterAxes` defaults to the style axis as an
  allow-list. Each `AxisDescriptor` is an `id`, a `label` (default the id)
  and what an empty selection means: `none` (an allow-list: nothing selected
  shows nothing) or `all` (a narrowing axis: nothing selected shows
  everything). The policies follow — a node with no value on the axis
  (`absentMeans`), how a focus widens it (`widens`: `always`, or `whenActive`
  — only while a selection is active), whether a change keeps the camera
  (`keepCamera`: a narrowing axis does, an allow-list refits) — and may be
  overridden. `chipsFor(values)` groups values into chips (default one per
  value; on the style axis they wear the value's icon and tint; a chip none
  of whose values the data presents is not offered), `labelFor`,
  `abbreviationFor`, `iconFor` and `tooltipFor` name and adorn values
  (defaults: the style's names and icon on the style axis, the value itself
  and no icon elsewhere, the abbreviation from the label, no tooltip),
  `initialSelection(values)` is the first open's selection (default every
  value on an allow-list, none on a narrowing axis), `presentation` is
  `chip` or `tag`.
- **Scalars and hooks.** `scalars` adds computed axes (`id`, `label` and
  `tooltip` — defaults the id and the label — and `compute(graph)` answering a
  number per node; `normalize` maps
  the answers onto [0, 1]: `max` divides by the largest and refuses a
  negative, `range` puts the smallest at 0 and the largest at 1, `none`
  trusts them) to the built-in
  reach, degree and depth. `contextLine(node, parent)` is the hover box's
  line or lines under the name, text or elements (default the parent's
  name); `searchText(node)` is
  what the search matches on (default the name); `highlight(active, base,
  graph, direction)` may widen or replace the transitive walk; `collapse(kept,
  candidate)` picks which of two graduated edges on one visible pair survives.
  Every hook is handed the host's own node objects, never the view's copies,
  so a host may key them by identity.

## The graph

`Graph` is `nodes` (an array, in layout order; the view indexes it, and
`nodesById` does the same for a host) and `edges`. Both carry `values`, a map
from axis to value, and an opaque `payload` the view never reads
(`payloadString` and `payloadNumber` read it for you). Ids are opaque: the
engine compares them and never parses one.

- **Containment is a tree.** A node's `parentId` names its container; the view
  derives the containment edge from it. An entity that sits in two containers
  is two nodes sharing a `copyKey`: the library indexes the copies
  (`copyGroups`), draws their halo and counts them in the hover box. A host may
  list containment edges of its own between any two nodes.
- **An edge's `relation`** is `containment` or `dependency` (the default;
  `isContainment(edge)` reads it). A containment edge from a node to its
  `parentId` is derived; one a host lists itself, to any node, is drawn in
  the containment stroke and sprung as its type says, but never walked as
  the parent, and
  `validateGraph` names one that contradicts `parentId`. A host adds axes of
  its own to edges and nodes alike through `values`; any axis the nodes
  carry can be pushed, pulled and laid out on.
- **Adornments.** A node may carry `badges` (short texts drawn as chips above
  it) and a `ring` (`dashed`, for a node set apart).
- **Identity.** Keep one `graph` object until something in it changes: a new
  object equal to the last rebuilds the layout for nothing, and the view says
  so once. The same for the taxonomy — build it once, outside render; the
  view warns when its identity churns. The filter, locks and axes are
  compared by content, so a host may rebuild those each render. A changed
  graph keeps the positions of the nodes it still has.
- **Validation.** `validateGraph(graph, taxonomy)` names every defect — a
  dangling endpoint, an unknown relation, a type the rule returns that the
  table lacks, a duplicate node or edge id, a parent not in the graph. The
  view runs it, lists the diagnostics under the bar, hands them to
  `onDiagnostics` and draws what remains — adding one warning of its own,
  `containment-untyped`, when a containment edge it derived from `parentId`
  has no declared type; a host that wants to refuse a bad graph calls it
  first.

## The view

`GraphView` needs the `graph`, a taxonomy (the `taxonomy` prop, or a
`TaxonomyContext.Provider` above; `useTaxonomy()` reads it in a host's own
component inside the pane), and a parent with a height: a flex column (the
pane takes the remaining space) or a block with a height (the pane fills it).
A parent with no height gives the pane none, and the pane says so once on
the console. Everything else is optional.

- **State.** The filter, the locks, the axes shown, the search control
  (`{ query, active }`), the theme choice, the selection and the layout each
  follow the React convention: pass the value and its callback to control it,
  neither to let the view keep it, the callback alone to be told; and each
  has a `default*` prop for where the view's own starts (`defaultFilter`,
  `defaultLocks`, `defaultAxes`, `defaultSearch`, `defaultTheme`,
  `defaultSelectedId`, `defaultLayout`), read once. A controlled value is the
  host's: the view never rewrites it, and warns once if the prop flips
  between defined and undefined. `initialFilter(taxonomy, graph)` is the
  filter the view starts from — an `initialSelection` that splits a chip is
  snapped to the whole chip, with a warning. `reseedFilter(filter, taxonomy,
  graph, touched)` is what the view does to its own filter when the graph
  changes — every axis the user has not touched takes the new graph's
  opening selection — for a host that controls the filter to call from its
  own data effect; `onFilterChange(next, touched)` names the axes the user
  changed in each write, so the host can keep that set.
  `filterToJSON` / `filterFromJSON` and `locksToJSON` / `locksFromJSON` carry
  a filter and its locks to a URL or a store and back.
- **Selection and focus.** `selectedId` controls the selection: while it is
  defined the view shows it and nothing else, `onSelectionChange` reports the
  selections the user makes (never one the host made), and the host answers
  by setting the prop, or not. Absent, the view keeps the selection and still
  reports. `focus={{ id, key }}` reveals, centres and selects a node — the
  declarative form of the handle's `focusNode`, for a pane that mounts lazily
  or whose data arrives late. It is compared by value, so a new `id` or `key`
  is a new request; it waits until its node is in the graph; and
  `onFocusResult(request, shown)` says whether the filter could show the
  node. Null, or a newer request, withdraws a waiting one unreported.
  `useFocusRequest()` gives a host the request and a `requestFocus(id)` that
  makes each ask new.
- **Layout.** `layout` is the force tuning and the node scale as the user
  set them: which axis push and pull key on and the buckets they changed,
  the two layout axes (an axis's bands, or a computed scalar's span), the
  multipliers, gravities and dynamics. `onLayoutChange` hears every change —
  the control panel's and the view's own retune for a new graph or taxonomy
  (a tuning on an axis the graph no longer carries returns to the style
  axis). `layoutToJSON(layout)` carries it to a store and `layoutFromJSON(json,
  taxonomy)` back; the JSON form (`LayoutJSON`) fills whatever it leaves out
  from the taxonomy's defaults, so it is also how a host writes a start:
  `defaultLayout={layoutFromJSON({ forces: { bandY: { scalar: 'credits' } } },
  taxonomy)}` opens the view laid out on a scalar. The `LayoutState` itself
  is opaque: keep it and hand it back.
- **Inputs.** `counts` (chip badges; the graph's entity counts unless given,
  the copies of one `copyKey` once),
  `findings` under the bar, `groups` to glow (each with a `color` or the
  palette's), `groupsControl` for a legend inside the pane (anchor it under
  `--gv-toolbar-height`, and handed the groups as drawn and `emphasize`;
  `GroupLegend` is one — items, the active groups, a toggle and the
  emphasis), a `nodeAction` for the hover box (`{ label, onSelect }`, or a
  function of the node answering one or null), `chrome` to turn parts of
  the pane off — `controls` (the control panel), `themeToggle` (the theme
  button), `search`, `locks` (the lock toggles; off until the host controls
  `locks` with `onLocksChange`), `transport` (the Fit / theme / Play / count
  cluster, which takes the theme button with it), `diagnostics`,
  `shortcuts`, `directionLine` (the hover box's) and `activateZoom` (the
  double-click zoom) — `searchTitle` and `searchPlaceholder` for the host's
  own words, `systemTheme` (what `system` means, for a host that knows its
  own theme), `className`, `style`, and `defaultPositions` (kept positions,
  read whenever the simulation is built; a node the live layout already
  holds keeps its place).
- **Outputs.** `onSelectionChange(node | null)`, `onNodeActivate(node)` on a
  double-click, `onHover(node | null)`, `onThemeResolved(theme)`,
  `onDiagnostics(diagnostics)` whenever the graph's defects are recomputed
  (the first graph's included), `onLayoutChange(layout)`. Every node handed
  out is the host's own object. The resolved theme is for the host's own
  chrome beside the pane; a host that writes it as a `data-theme` on an
  ancestor of the pane passes `systemTheme` too, so `system` follows the
  host's answer and not the pane's own echo.
- **The handle.** Through a ref, `focusNode(id)` reveals, centres and selects
  a node in one call — it widens the filter on the axes shown, flashes a lock
  it overrides, and centres once the layout has settled — and answers
  whether the node ended visible (a value absent on a hiding axis cannot be
  revealed); `select(id | null)` sets or clears the selection; `fit()` frames
  the visible set; `getPositions()` and `setPositions()` carry a layout out
  and back in.
- **What to know.** The view's own filter re-seeds on a graph change for
  every axis still at the selection it opened with — a controlled filter
  never does, and a host that gave `defaultFilter` chose its start — and
  `onFilterChange` hears it. `onHover(null)` arrives 150 ms after the pointer
  leaves, so a tooltip can be reached. Removing an axis in the bar resets its
  selection to "match everything" and fires `onFilterChange` before
  `onAxesChange`; an axis the taxonomy does not declare renders as a header
  with its remove control and filters nothing.
  Two declared types on one pair with no `match` to tell them apart are
  refused; with `classifyEdge` given, its answer stands. Derived containment
  edges are `in:<id>` (numbered on a collision) and reach `highlight` and
  `collapse`. An error diagnostic drops the edge, or the later node of a
  duplicated id, or clears the `parentId`, it names. The search dropdown lists visible matches; hidden ones badge the
  chip hiding them. The pane's theme observer watches every `data-theme` in
  the document unless `systemTheme` is given.
- **Keyboard.** `keyboard` scopes the shortcuts: `pane` (the default — the
  focusable root handles the keys that reach it, so a page keeps Tab and
  Space for its own controls), `global` (the window — a page that is the
  pane, or a tab shell's active tab) or `none` (a hidden tab). Tab cycles
  nodes, Enter selects, Escape closes, arrows pan, `+`/`-` zoom, F fits, `/`
  opens search (while the search is offered), Space pauses, `?` lists them.

## Two views sharing a bar

A host with a second view gives both views one state through `useLinkedViews`
and renders `FilterBar` in the view that is not a `GraphView`. The hook owns
each view's filter, locks and axes, the view shown and the search they share,
hands each view its props, reconciles on a switch, records the locks a focus
overrode so the bar flashes them, and asks the graph view to centre on a node
a focus names:

```tsx
import React from 'react'
import { FilterBar, GraphView, passesSelection, useLinkedViews } from '@temporal-architect/graph-view'
import type { Graph, Taxonomy } from '@temporal-architect/graph-view'

export function TwoViews({ taxonomy, graph }: { taxonomy: Taxonomy; graph: Graph }) {
  const linked = useLinkedViews({ taxonomy, views: ['list', 'graph'], graph })
  const list = linked.of('list')
  const shown = graph.nodes.filter(node => passesSelection({ filter: list.filter, taxonomy, axes: list.axes, node }))
  // `linked.focus` switches to the view, widens its filter to show the node
  // and, for the graph view, asks it to centre on and select the node.
  return linked.active === 'graph'
    ? <GraphView graph={graph} taxonomy={taxonomy} {...linked.of('graph')} nodeAction={{ label: 'Show in list', onSelect: node => linked.focus('list', node) }} />
    : (
      <div>
        <FilterBar taxonomy={taxonomy} graph={graph} {...list} />
        <ul>{shown.map(n => <li key={n.id} onDoubleClick={() => linked.focus('graph', n)}>{n.name}</li>)}</ul>
      </div>
    )
}
```

`linked.of(view)` is the view's `filter`, `locks`, `axes`, their callbacks,
`overriddenLocks`, the shared `search` with its callback, and the `focus` the
last `linked.focus` asked of it with `onFocusResult` (a `FilterBar` ignores
those two); it throws for a view the hook was not given (`views` is read
once). `linked.active` is the view shown.
`linked.switchTo(to, transition?)` switches from the active view and makes
`to` active: a manual switch (the default) adopts the active view's
selections except where locked, a focus widens the destination to show its
target. `linked.focus(view, node)` is the focus switch and the request in one.
`linked.updateFilter(view, fn)` rewrites one view's filter and
`linked.updateFilters(fn)` every view's (a stale value pruned when the data
changes — `reseedFilter` is the rule the hook itself applies to every view
when `graph` changes, on the axes the user has not touched); `linked.state`,
`linked.active` and `linked.search` are everything,
for a host that persists them. The bar carries its own theme and scheme
(`theme`, default `system`; `systemTheme` says what that means), so it needs
no wrapper; give it the `graph` (or the `values` per axis — `valuesOn(records,
axis)` reads them off any subjects carrying `values`) and, if the host reads
its own data, the `counts`. The lock toggles appear only when `locks` is
controlled with its callback — `useLinkedViews` does — or `chrome.locks` asks.
The bar tracks the values that just turned on for its chip flash
(`RecentlyChanged`, a set per axis); a host with its own rule passes
`recentlyChanged`.

What the pane computes for its own bar is exported for the second view:
`passesSelection({ filter, taxonomy, axes, node })` decides visibility on the
axes the view shows (`valueOn(node, axis)` for a record that carries its
values under other names), `countsOn(nodes, axes)` the badges,
`hiddenMatchesOf({ nodes, filter, taxonomy, axes, visibleIds, matches })` the
search's hidden-match badges. `reconcileFilter({ destination, source, locks,
transition, taxonomy, axes, graph })` is the switch the hook makes; `axes`
are ids, and with the `graph` a focus widens to the whole chip holding its
target's value. `selectionFor`, `withSelection`, `withLock`, `toggleGroup` and
`filterStatesEqual` are the filter operations the bar itself uses;
`toggleValue` flips one value for a host's own control. A focus into the graph
is `focusNode(id)` or the `focus` prop; a focus into the other view is the
host's (`matchesFocus(node, target)` finds the node a `FocusTarget`'s values
name).

## Theming

The pane resolves its theme from its own choice (Auto / Light / Dark) or, for
`system`, from `systemTheme` when the host gives it, else the nearest
ancestor's `data-theme` and then the OS — `useHostTheme(ref)` is that same
read, for a host's own chrome, and `themeChoiceOf(value)` reads a stored
choice back (`system` for anything else). Every
token the components read is a `--gv-*` custom property declared in the
stylesheet per theme (`--gv-color-bg`, `--gv-color-text`, `--gv-accent`,
`--gv-font-sans`, …), and every class is `gv-*`; a host overrides a token by
redeclaring it on an ancestor. Each style value's fill and border are
published on the pane under the name `taxonomy.colorVar(value)` answers —
`--gv-node-` and the value id in kebab case (`nexusEndpoint` →
`--gv-node-nexus-endpoint`), or a numbered name when the id kebab-cases to
nothing or to another value's — and `-border` for the border. A host's own
chrome beside the pane reads the same tints through `schemeVars(taxonomy,
theme)` inline, or `schemeStylesheet(taxonomy, darkSelector?)` mounted once
(its dark block under `[data-theme="dark"]`, or the host's own selector), with
the theme `onThemeResolved` hands it. Default rest
bands are laid in `BAND_FRAME` (world units: the hierarchy axis from −300 to
400, x from 0 to 380); a band a host declares is read in the same units.

## Collapse rules

A dependency edge whose end is hidden is **graduated**: re-pointed to the
nearest visible ancestor (`ascend`) or followed through the hidden node's own
edges (`splice`). Two graduated edges landing on one visible pair collapse to
one, the host's `collapse` hook choosing which original it stands for; an
original edge between two visible nodes stands for every projection landing
on its pair; two original edges between visible nodes never collapse, and
draw in lanes.

## Limits

The charge force is O(n²) over the visible nodes: a few hundred draw
smoothly, a few thousand do not. The push/pull and layout controls bound their
tokens by a ceiling (an axis with more values than the ceiling is offered but
cannot be tuned on, and a tuning that outgrows it returns to the style axis).
What is not built is filed: colour by another axis (#194), an opaque
`Taxonomy` (#195), undirected edges (#196), per-edge weight (#197), the pane's
strings in other languages (#198), the React 19 types gate (#200).

`src/index.ts` names the whole surface; the tarball ships `dist-lib/`, this
file and the licence.
