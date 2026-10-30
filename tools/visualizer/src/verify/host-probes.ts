// A second host, written against the library's public entry and nothing else:
// a taxonomy of its own — three values, two edge types, a filter axis of each
// policy, a scalar reading the graph — declared through `createTaxonomy`, a
// graph built by hand, and the view mounted on a server render. What this pins
// is that the surface suffices for a host that is not the visualizer; the row
// changes when the contract does. A server render mounts the chrome and the
// canvas but builds no simulation (that is an effect), so the count row and
// the hover box are not what it can see.
//
// Three mounts. The smallest host: `graph` and nothing else, inside the
// provider — every state prop left to the view. The other way in: the
// taxonomy as a prop with no provider, the control panel and the theme button
// left out, the search, the transport cluster, the defect list and the
// shortcuts left out of the chrome, a class and a style handed to the root.
// And the bar alone: `taxonomy` and `graph`, no provider and no pins.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createTaxonomy, TaxonomyContext, GraphView, FilterBar, defaultFilter, isContainment, nodesById,
} from '@temporal-architect/graph-view'
import type {
  TaxonomySpec, NodeStyle, EdgeType, AxisDescriptor, ScalarAxis, ReadableGraph,
  Graph, GraphNode, GraphEdge, Relation, ThemedColor, EdgeStroke,
} from '@temporal-architect/graph-view'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const KIND = 'kind'
const ZONE = 'zone'
const colour = (fill: string, border: string): ThemedColor => ({ light: { fill, border }, dark: { fill, border } })
const body = (label: string, abbreviation: string, icon: string, tier: number, r: number): Omit<NodeStyle, 'id'> => ({
  label, abbreviation, icon, whenHidden: 'ascend',
  color: colour('#336699', '#224466'),
  size: { r, iconSize: r },
  physics: { charge: -400, coreRadius: 30, band: { x: { min: -200, max: 200 }, y: { min: tier * 100 - 40, max: tier * 100 + 40 } } },
  summaryKind: tier < 2 ? 'children' : 'degree',
})
const style = (id: string, ...rest: Parameters<typeof body>): NodeStyle => ({ id, ...body(...rest) })
const fallback = body('Unknown', 'Un', '?', 2, 8)
const stroke: EdgeStroke = { color: { light: '#888888', dark: '#aaaaaa' }, alpha: 0.8, dash: [], width: 1 }
const edgeType = (id: string, relation: Relation, src: string, tgt: string): EdgeType => ({
  id, label: id, sourceValue: src, targetValue: tgt, relation, physics: { strength: 0.5, distance: 80 }, style: relation === 'containment' ? { ...stroke, dash: [4, 4] } : stroke, tooltip: id,
})
// The minimal declaration: the policies follow from what an empty selection means.
const axis = (id: string, label: string, empty: 'all' | 'none'): AxisDescriptor => ({ id, label, emptyMeans: empty })
/** Out-degree over dependency edges, normalised to the busiest node. */
const fanOut: ScalarAxis = {
  id: 'fanOut', label: 'Fan-out', tooltip: 'calls made, as a share of the most',
  compute(graph: ReadableGraph) {
    const out = new Map<string, number>()
    for (const e of graph.edges) if (!isContainment(e)) out.set(e.sourceId, (out.get(e.sourceId) ?? 0) + 1)
    const max = Math.max(1, ...out.values())
    return new Map([...graph.nodes].map(n => [n.id, (out.get(n.id) ?? 0) / max]))
  },
}
const spec: TaxonomySpec = {
  styleAxis: KIND, styleLabel: 'Kind',
  values: [style('cluster', 'Cluster', 'Cl', 'C', 0, 20), style('service', 'Service', 'Sv', 'S', 1, 14), style('pod', 'Pod', 'Pd', 'P', 2, 8)],
  filterAxes: [axis(ZONE, 'Zone', 'all'), axis(KIND, 'Kind', 'none')],
  edgeTypes: [edgeType('contains', 'containment', 'pod', 'service'), edgeType('calls', 'dependency', 'pod', 'pod')],
  classifyEdge: edge => (isContainment(edge) ? 'contains' : 'calls'),
  scalars: [fanOut],
  fallbackStyle: fallback,
}

function node(id: string, kind: string, zone: string, parentId?: string): GraphNode {
  return { id, name: id, dimensions: { [KIND]: kind, [ZONE]: zone }, ring: !parentId && kind !== 'cluster' ? 'dashed' : undefined, copyKey: id, parentId }
}
function edge(id: string, sourceId: string, targetId: string, relation: Relation): GraphEdge {
  return { id, sourceId, targetId, relation }
}
function graphOf(): Graph {
  const nodes = [node('c1', 'cluster', 'east'), node('s1', 'service', 'east', 'c1'), node('s2', 'service', 'west', 'c1'),
    node('p1', 'pod', 'east', 's1'), node('p2', 'pod', 'east', 's1'), node('p3', 'pod', 'west', 's2')]
  const edges = [edge('e1', 's1', 'c1', 'containment'), edge('e2', 's2', 'c1', 'containment'), edge('e3', 'p1', 's1', 'containment'),
    edge('e4', 'p2', 's1', 'containment'), edge('e5', 'p3', 's2', 'containment'), edge('e6', 'p1', 'p3', 'dependency'), edge('e7', 'p1', 'p2', 'dependency'), edge('e8', 's1', 's2', 'dependency')]
  return { nodes, edges }
}

/** The class attribute of the first element in the markup: the view's root. */
const rootClassOf = (html: string): string | null => /^<div class="([^"]*)"/.exec(html)?.[1] ?? null
/** The view's control panel, by the root class it carries. */
const PANEL = 'gv-graph-control-panel'
/** How many pin toggles the markup carries. */
const pinToggles = (html: string): number => (html.match(/class="gv-pin-toggle[ "]/g) ?? []).length

export function hostProbes(): Json {
  const taxonomy = createTaxonomy(spec)
  const graph = graphOf()
  // The smallest host: `graph`, under the provider. No `counts`, no `chain`, no
  // `filter` — the view takes the graph's node counts, every declared axis in
  // order, and the library's default filter.
  const html = renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: taxonomy },
    React.createElement(GraphView, { graph })))
  // The other way in: the taxonomy as a prop, no provider above.
  const withProp = renderToStaticMarkup(
    React.createElement(GraphView, {
      graph, taxonomy, controls: false, themeToggle: false, className: 'probe-host', style: { minHeight: 1 },
      chrome: { search: false, transport: false, diagnostics: false, shortcuts: false },
    }))
  // The bar on its own: the taxonomy as a prop, no provider, the graph to read
  // its values off, and nothing about pins.
  const barProp = renderToStaticMarkup(
    React.createElement(FilterBar, { taxonomy, graph, filter: defaultFilter(taxonomy, graph), onFilterChange: () => {} }))
  const byId = nodesById(graph.nodes)
  const scalar = fanOut.compute({ nodes: graph.nodes, edges: graph.edges, getNode: id => byId.get(id) })
  return {
    keys: [...taxonomy.styleValues],
    podFill: taxonomy.styleOf('pod').color.light.fill,
    callsStroke: [...taxonomy.edgeStrokeFor('calls').dash],
    scalar: sortedRecord([...scalar]),
    rendered: {
      canvas: html.includes('<canvas'),
      chips: sorted([...html.matchAll(/class="gv-chip-label">([^<]*)</g)].map(m => m[1])),
      files: sorted([...html.matchAll(/class="gv-tag-label">([^<]*)</g)].map(m => m[1])),
      chipCounts: sorted([...html.matchAll(/class="gv-header-chip-count">([^<]*)</g)].map(m => m[1])),
      panelPresent: html.includes(PANEL),
      // The view offers pin toggles only to a host that engages pins.
      pinToggles: pinToggles(html),
    },
    taxonomyProp: {
      withoutProvider: withProp.includes('<canvas'),
      rootClass: rootClassOf(withProp),
      styleMerged: withProp.includes('min-height:1px'),
      schemeKept: withProp.includes('--gv-node-'),
      themeButtonAbsent: !withProp.includes('aria-label="Colour scheme"'),
      panelAbsent: !withProp.includes(PANEL),
      searchAbsent: !withProp.includes('gv-header-search'),
      transportAbsent: !withProp.includes('gv-graph-bottom-center'),
    },
    barProp: {
      rendered: barProp.includes('gv-canvas-header'),
      pinToggles: pinToggles(barProp),
    },
  }
}
