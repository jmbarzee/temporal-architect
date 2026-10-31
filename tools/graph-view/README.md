# @temporal-architect/graph-view

A force-directed graph view with composable dimensions, as a React component.

A host declares what its graph is made of — the **dimensions** its nodes carry,
the **values** on each, and for the style axis a colour per value — through
`createOntology(spec)`. It builds a `Graph` of nodes and edges carrying
dimension maps, and mounts `GraphView`. The view lays the graph out (push and
pull on any axis the nodes carry, two layout axes keyed on an axis or a
computed scalar), filters it on any declared axis, highlights it, and lets the
user tune the forces — without knowing what any node or edge means. The host's
vocabulary never enters this package; a ratchet in the first host's package
holds it at zero.

## Status

Not yet published. In this repository the visualizer (`tools/visualizer/`) is
the first host and consumes the library from source through its build's alias;
`examples/course-catalog/` is the second, written against the public entry
alone. `npm run build:lib` produces the standalone artifact (`dist-lib/`: the
bundle, one stylesheet, the declarations the entry reaches), and
`make pack-graph-view-lib` packs it. Publishing under the organisation's scope
is a release decision.

## Install (once published)

`react` and `react-dom` are peer dependencies (`^18 || ^19`). Import the
stylesheet once — it carries the design tokens and every component's rules.

## Quick start

The smallest host: a taxonomy of two values and two edge types, a graph of
three nodes, the view. The block below is compiled against the shipped
declarations by the artifact gate, so it cannot drift from the surface.

```tsx
import { createOntology, GraphView, RELATION_DIMENSION } from '@temporal-architect/graph-view'
import type { Graph, GraphNode } from '@temporal-architect/graph-view'
import '@temporal-architect/graph-view/styles.css'

const ontology = createOntology({
  styleDimension: 'kind',
  values: [
    { id: 'team', label: 'Team', icon: '⌂', summaryKind: 'children',
      color: { light: { fill: '#475569', border: '#1E293B' }, dark: { fill: '#94A3B8', border: '#475569' } }, size: { r: 18 } },
    { id: 'service', label: 'Service', icon: '◆',
      color: { light: { fill: '#0F766E', border: '#134E4A' }, dark: { fill: '#2DD4BF', border: '#0F766E' } } },
  ],
  edgeTypes: [
    { id: 'owns', label: 'owns', sourceType: 'service', targetType: 'team', relation: 'containment',
      style: { color: { light: '#94A3B8', dark: '#64748B' }, alpha: 0.4, dash: [3, 4], width: 1 } },
    { id: 'calls', label: 'calls', sourceType: 'service', targetType: 'service', relation: 'dependency',
      style: { color: { light: '#0F766E', dark: '#5EEAD4' }, alpha: 0.8, dash: [], width: 1.5 } },
  ],
  resolveEdgeType: edge => (edge.dimensions[RELATION_DIMENSION] === 'containment' ? 'owns' : 'calls'),
  filterDimensions: [{ id: 'kind', label: 'Kind', emptyMeans: 'none' }],
})

const nodes: GraphNode[] = [
  { id: 'payments', name: 'Payments', dimensions: { kind: 'team' } },
  { id: 'checkout', name: 'Checkout', dimensions: { kind: 'service' }, parentId: 'payments' },
  { id: 'ledger', name: 'Ledger', dimensions: { kind: 'service' }, parentId: 'payments' },
]
const graph: Graph = {
  nodes: new Map(nodes.map(n => [n.id, n])),
  edges: [{ id: 'checkout→ledger', sourceId: 'checkout', targetId: 'ledger', dimensions: { [RELATION_DIMENSION]: 'dependency' } }],
}

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <GraphView graph={graph} ontology={ontology} />
    </div>
  )
}
```

The containment edges from each service to its team are derived from
`parentId`; the filter, the pins, the chain of axes, the search and the theme
are the view's own until the host asks for them.

## The taxonomy

`createOntology(spec: OntologySpec): Ontology`. An incoherent spec — a value
declared twice, an edge type between values nobody declares, a colour no reader
can parse, a band whose ends cross — is refused at construction, loudly. To
derive a variant, build one from the spec (`createOntology({ ...spec, … })`),
never by spreading the built object.

- **The style axis and its values.** `styleDimension` names the axis every
  node is styled on; `values` lists its values, top of the hierarchy first.
  A `NodeStyle` needs its `id`, `label` and `color` (fill and border, per
  theme, hex or `rgb()`). The rest defaults: `abbreviation` to the label's
  first two characters, `icon` to none, `size.r` to 12, `physics.charge` to
  −40 r and `coreRadius` to 4 r, the rest band on the hierarchy axis to the
  value's slice of a stack by its position in the order, `whenHidden` to
  `ascend` (a dependency edge touching a hidden node re-points to its nearest
  visible ancestor; `splice` follows the node's own edges through),
  `summaryKind` to `degree` (`children` counts what a node contains, in the
  hover box). `fallbackStyle` draws a value nobody declared; `styleLabel`
  names the axis in the controls.
- **Edge types and the rule.** Each `EdgeType` has an `id`, a `label`, its
  canonical `sourceType` and `targetType` (style values), its `relation`
  (`containment` or `dependency`) and a `style` (colour per theme, alpha,
  dash, width); `physics` (a spring's strength and rest length) defaults to
  the mean of the declared springs, `tooltip` to the label.
  `resolveEdgeType(edge, sourceValue, targetValue)` is the host's rule for
  which type an edge is; the engine reads the values live off the endpoint
  nodes, so the rule must answer for the pairs its graph produces and for a
  graduated edge whose end moved to a visible ancestor.
- **Filter axes.** Each `DimensionDescriptor` is an `id`, a `label` and what
  an empty selection means: `none` (an allow-list: nothing selected shows
  nothing) or `all` (a narrowing axis: nothing selected shows everything).
  The policies follow — a node with no value on the axis, how a focus expands
  it, how a change reheats the layout — and may be overridden field by field
  (`absentMeans`, `focus`, `reheat`). `chipsFor(values)` groups values into
  chips (default one per value; on the style axis they wear the value's icon
  and tint), `labelFor` and `abbreviationFor` name values (default the
  style's names on the style axis, the value itself elsewhere),
  `initialSelection(values)` is the first open's selection (default every
  value on an allow-list, none on a narrowing axis), `presentation` is
  `chip` or `tag`.
- **Scalars and hooks.** `scalars` adds computed axes (`id`, `label`,
  `tooltip`, `compute(graph)` answering per node in [0, 1]) to the built-in
  reach, degree and depth. `contextLine(node, parent)` is the hover box's
  line under the name (default the parent's name); `searchText(node)` is
  what the search matches on (default the name); `highlight(active, base,
  graph, direction)` may widen or replace the transitive walk; `collapse(kept,
  candidate)` picks which of two graduated edges on one visible pair survives.

## The graph

`Graph` is `nodes` (a `Map` by id) and `edges`. Both carry `dimensions`, a map
from axis to value, and an opaque `payload` the view never reads
(`payloadString` and `payloadNumber` read it for you). Ids are opaque: the
engine compares them and never parses one.

- **Containment is a tree.** A node's `parentId` names its container; the view
  derives the containment edge from it. An entity that sits in two containers
  is two nodes sharing a `copyKey`: the library indexes the copies
  (`copyGroups`), draws their halo and counts them in the hover box. A host may
  list containment edges of its own between any two nodes.
- **Every edge carries `relation`** (`RELATION_DIMENSION`: `containment` or
  `dependency`); a host adds axes of its own to edges and nodes alike. Any
  axis the nodes carry can be pushed, pulled and laid out on.
- **Adornments.** A node may carry `badges` (short texts drawn as chips above
  it) and a `ring` (`dashed`, for a node set apart).
- **Identity.** Keep one `graph` object until its nodes or edges change: a new
  object of the same shape rebuilds the layout for nothing, and the view says
  so once. A changed graph keeps the positions of the nodes it still has.
- **Validation.** `validateGraph(graph, ontology)` names every defect — a
  dangling endpoint, an unknown relation, a type the rule returns that the
  table lacks, a duplicate id, a parent not in the graph. The view runs it,
  lists the findings under the bar and draws what remains; a host that wants
  to refuse a bad graph calls it first.

## The view

`GraphView` needs the `graph`, a taxonomy (the `ontology` prop, or an
`OntologyContext.Provider` above), and a parent that is a flex column with a
height — the pane fills what it is given and renders at zero height otherwise.
Everything else is optional.

- **State.** The filter, the pins, the chain of axes shown, the search control
  (`{ query, active }`) and the theme choice each follow the React convention:
  pass the value and its callback to control it, neither to let the view keep
  it, the callback alone to be told. `defaultFilter(ontology, graph)` is the
  filter the view starts from, for a host that controls it.
- **Inputs.** `counts` (chip badges; the graph's node counts unless given),
  `findings` under the bar, `groups` to glow (each with a `color` or the
  palette's), `groupsControl` for a legend inside the pane (anchor it under
  `--gv-toolbar-height`), a `crossView` action for the hover box, `controls`
  and `themeToggle` to hide the panel and the theme button, `className`,
  `style`, and `positions` (a kept layout).
- **Outputs.** `onSelectionChange(node | null)`, `onNodeActivate(node)` on a
  double-click, `onHover(node | null)`, `onThemeResolved(theme)`. The resolved
  theme is for the host's own chrome beside the pane, never for a `data-theme`
  on an ancestor of it: the pane reads that ancestor to resolve `system`, so
  writing the answer there locks it.
- **The handle.** Through a ref, `focusNode(id)` reveals, centres and selects
  a node in one call — it widens the filter on the axes shown, flashes a pin
  it overrides, and centres once the layout has settled; `fit()` frames the
  visible set; `getPositions()` and `setPositions()` carry a layout out and
  back in.
- **Keyboard.** `keyboard` scopes the shortcuts: `pane` (the default — the
  focusable root handles the keys that reach it, so a page keeps Tab and
  Space for its own controls), `global` (the window — a page that is the
  pane, or a tab shell's active tab) or `none` (a hidden tab). Tab cycles
  nodes, Enter selects, Escape closes, arrows pan, `+`/`-` zoom, F fits, `/`
  opens search, Space pauses, `?` lists them.

## Two views sharing a bar

A host with a second view renders `FilterBar` outside the pane with the same
filter state: give it the `graph` (or the `values` per axis) and it defaults
the rest. `reconcileFilter(dest, source, pins, transition, axes)` adopts one
view's filter into the other's on a manual switch, respecting pins;
`passesSelection`, `selectionFor`, `withSelection`, `withPin`, `toggleGroup`
and `toggleValue` are the filter operations the bar itself uses. A focus into
the graph is `focusNode(id)`; a focus into the other view is the host's.
Chips rendered outside the pane need the scheme's variables on an ancestor:
`schemeVars(ontology, theme)` inline, or `schemeStylesheet(ontology)` mounted
once.

## Theming

The pane resolves its theme from its own choice (Auto / Light / Dark) or, for
`system`, from the nearest ancestor's `data-theme` and then the OS. Every
token the components read is a `--gv-*` custom property declared in the
stylesheet per theme (`--gv-color-bg`, `--gv-color-text`, `--gv-accent`,
`--gv-font-sans`, …), and every class is `gv-*`; a host overrides a token by
redeclaring it on an ancestor. Each style value's fill and border are
published as `--gv-node-<value>` and `--gv-node-<value>-border` on the pane.

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
`Ontology` (#195), undirected edges (#196), per-edge weight (#197), the pane's
strings in other languages (#198), the React 19 types gate (#200).

`src/index.ts` names the whole surface; the tarball ships `dist-lib/`, this
file and the licence.
