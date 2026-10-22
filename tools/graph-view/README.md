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
never enters this package; a ratchet in the host's package holds it at zero.

The visualizer in `tools/visualizer/` is the first host: it reads `.twf` parser
output into a `Graph` and declares the Temporal taxonomy. In this repository it
consumes the library from source through its build's alias; the `build:lib`
here is the standalone, extractable artifact.

## Install

```bash
npm install @temporal-architect/graph-view
```

`react` and `react-dom` are peer dependencies (`^18 || ^19`). Import the
stylesheet once:

```ts
import '@temporal-architect/graph-view/styles.css'
```

## The contract

- `createOntology(spec: OntologySpec): Ontology` — the taxonomy: the style
  axis's keys and a `NodeTypeDefinition` per value (label, icon, colour per
  theme, size, physics, what happens to its edges when hidden), `edgeTypes`
  with a stroke each, the filter dimensions and their chips, scalar axes, and
  the hooks a host may supply (a hover box's context line, a highlight). An
  incoherent spec is refused at construction, loudly.
- `Graph` — `nodes` and `edges`, each carrying `dimensions` and an opaque
  `payload` the view never reads.
- `GraphView` — the component: a graph, a filter state and the callbacks that
  move it, the chip counts and findings the host wants under the bar, groups
  to glow, and the pane's theme.

The source is the reference; `src/index.ts` lists the whole surface.
