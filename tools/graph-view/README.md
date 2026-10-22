# @temporal-architect/graph-view

A force-directed graph view with composable dimensions, as a React component.

A host declares what its graph is made of — the **dimensions** its nodes carry,
the **values** on each, and for the style axis a colour, size, icon and physics
per value, plus how an edge classifies from the values at its ends — through
`createOntology(spec)`. It builds a `Graph` of nodes and edges carrying
dimension maps, and mounts `GraphView`. The view lays the graph out (push and
pull on a chosen dimension, two layout axes keyed on a dimension or a computed
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

- `createOntology(spec: OntologySpec): Ontology` — the taxonomy: the style
  axis's keys and a `NodeTypeDefinition` per value (label, icon, colour per
  theme, size, physics, what happens to its edges when hidden), `edgeTypes`
  with a stroke each and the rule that classifies an edge, the filter
  dimensions and their chips, scalar axes, abbreviations, and the hooks a host
  may supply (a hover box's context line, a highlight). An incoherent spec is
  refused at construction, loudly.
- `Graph` — `nodes` and `edges`, each carrying `dimensions` and an opaque
  `payload` the view never reads. Every edge carries `relation`
  (`containment` or `dependency`); a containment edge runs from the child to
  its container, and the child's `parentId` is that container. `duplicateGroups`
  indexes nodes by `definitionKey`.
- `GraphView` — the component. It needs an `OntologyContext.Provider` above it,
  a parent that is a flex column with a height (the pane fills what it is
  given and renders at zero height otherwise), and the `graph`, the filter
  state with its callbacks, the chip `counts` and `findings` the host wants
  under the bar, `groups` to glow, and the pane's theme choice. Filter chips
  rendered outside the pane (a second view sharing the bar) need the scheme's
  variables on an ancestor: `schemeVars(ontology, theme)` inline, or
  `schemeStylesheet(ontology)` mounted once.

`src/index.ts` names the whole surface; the tarball ships `dist-lib/`, this
file and the licence.
