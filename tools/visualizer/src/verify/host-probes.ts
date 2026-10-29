// A second host, written against the library's public entry and nothing else
// (REVIEW_8 C18): a taxonomy of its own — three values, two edge types, a
// filter axis of each policy, a scalar reading the graph — declared through
// `createOntology`, a graph built by hand, and the view mounted on a server
// render. What this pins is that the surface suffices for a host that is not
// the visualizer; the row changes when the contract does. A server render
// mounts the chrome and the canvas but builds no simulation (that is an
// effect), so the count row and the hover box are not what it can see.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createOntology, OntologyContext, GraphView, RELATION_DIMENSION,
} from '@temporal-architect/graph-view'
import type {
  OntologySpec, NodeTypeDefinition, EdgeTypeDefinition, DimensionDescriptor, ScalarAxis, ReadableGraph,
  Graph, GraphNode, GraphEdge, FilterState, ThemedColor, EdgeStroke,
} from '@temporal-architect/graph-view'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const KIND = 'kind'
const ZONE = 'zone'
const colour = (fill: string, border: string): ThemedColor => ({ light: { fill, border }, dark: { fill, border } })
const style = (label: string, icon: string, tier: number, r: number, visible: boolean): NodeTypeDefinition => ({
  label, icon, defaultVisible: visible, whenHidden: 'ascend',
  color: colour('#336699', '#224466'),
  size: { r, iconSize: r },
  physics: { charge: -400, coreRadius: 30, band: { x: { min: -200, max: 200 }, y: { min: tier * 100 - 40, max: tier * 100 + 40 } } },
  summaryKind: tier < 2 ? 'children' : 'degree',
})
const stroke: EdgeStroke = { color: { light: '#888888', dark: '#aaaaaa' }, alpha: 0.8, dash: [], width: 1 }
const edgeType = (id: string, category: 'containment' | 'dependency', src: string, tgt: string): EdgeTypeDefinition => ({
  id, label: id, sourceType: src, targetType: tgt, category, physics: { strength: 0.5, distance: 80 }, style: category === 'containment' ? { ...stroke, dash: [4, 4] } : stroke, tooltip: id,
})
const axis = (id: string, label: string, empty: 'all' | 'none'): DimensionDescriptor => ({
  id, label,
  emptyMeans: empty, absentMeans: empty === 'all' ? 'visible' : 'hidden', focus: empty === 'all' ? 'whenActive' : 'always',
  reheat: { alpha: 0.5, seedRevealed: empty === 'none', refit: empty === 'none', resume: true },
  chipsFor: values => values.map(v => ({ id: v, label: v, values: [v] })),
  labelFor: v => v, abbreviationFor: v => v.slice(0, 2),
})
/** Out-degree over dependency edges, normalised to the busiest node. */
const fanOut: ScalarAxis = {
  id: 'fanOut', label: 'Fan-out', tooltip: 'calls made, as a share of the most',
  compute(graph: ReadableGraph) {
    const out = new Map<string, number>()
    for (const e of graph.edges) if (e.dimensions[RELATION_DIMENSION] === 'dependency') out.set(e.sourceId, (out.get(e.sourceId) ?? 0) + 1)
    const max = Math.max(1, ...out.values())
    return new Map([...graph.nodes].map(n => [n.id, (out.get(n.id) ?? 0) / max]))
  },
}
const spec: OntologySpec = {
  styleDimension: KIND, styleLabel: 'Kind',
  abbreviations: { cluster: 'Cl', service: 'Sv', pod: 'Pd' },
  styleGroups: [{ id: 'all', values: ['cluster', 'service', 'pod'] }],
  nodeTypeKeys: ['cluster', 'service', 'pod'],
  filterDimensions: [axis(ZONE, 'Zone', 'all'), axis(KIND, 'Kind', 'none')],
  nodeStyles: { cluster: style('Cluster', 'C', 0, 20, true), service: style('Service', 'S', 1, 14, true), pod: style('Pod', 'P', 2, 8, false) },
  edgeTypes: [edgeType('contains', 'containment', 'pod', 'service'), edgeType('calls', 'dependency', 'pod', 'pod')],
  resolveEdgeType: edge => (edge.dimensions[RELATION_DIMENSION] === 'containment' ? 'contains' : 'calls'),
  scalars: [fanOut],
  fallbackStyle: style('Unknown', '?', 2, 8, false),
}

function node(id: string, kind: string, zone: string, parentId?: string): GraphNode {
  return { id, name: id, dimensions: { [KIND]: kind, [ZONE]: zone }, ring: !parentId && kind !== 'cluster' ? 'dashed' : undefined, copyKey: id, parentId }
}
function edge(id: string, sourceId: string, targetId: string, relation: 'containment' | 'dependency'): GraphEdge {
  return { id, sourceId, targetId, dimensions: { [RELATION_DIMENSION]: relation } }
}
function graphOf(): Graph {
  const nodes = [node('c1', 'cluster', 'east'), node('s1', 'service', 'east', 'c1'), node('s2', 'service', 'west', 'c1'),
    node('p1', 'pod', 'east', 's1'), node('p2', 'pod', 'east', 's1'), node('p3', 'pod', 'west', 's2')]
  const edges = [edge('e1', 's1', 'c1', 'containment'), edge('e2', 's2', 'c1', 'containment'), edge('e3', 'p1', 's1', 'containment'),
    edge('e4', 'p2', 's1', 'containment'), edge('e5', 'p3', 's2', 'containment'), edge('e6', 'p1', 'p3', 'dependency'), edge('e7', 'p1', 'p2', 'dependency'), edge('e8', 's1', 's2', 'dependency')]
  return { nodes: new Map(nodes.map(n => [n.id, n])), edges }
}

export function hostProbes(): Json {
  const ontology = createOntology(spec)
  const graph = graphOf()
  const noop = () => {}
  const filter: FilterState = new Map([[KIND, new Set(['cluster', 'service'])], [ZONE, new Set<string>()]])
  const html = renderToStaticMarkup(React.createElement(OntologyContext.Provider, { value: ontology },
    React.createElement(GraphView, {
      active: true, graph, counts: new Map<string, ReadonlyMap<string, number>>(), theme: 'light', onThemeChange: noop,
      filter, onFilterChange: noop, pins: new Map<string, boolean>(), onPinsChange: noop, chain: [ZONE, KIND], onChainChange: noop,
      searchQuery: '', searchActive: false, onSearchChange: noop, pendingFocus: null, onFocusConsumed: noop,
      overriddenPins: new Set<string>(), onOverriddenPinsConsumed: noop,
      crossView: { label: 'Elsewhere', onFocus: noop },
    })))
  const scalar = fanOut.compute({ nodes: [...graph.nodes.values()], edges: graph.edges, getNode: id => graph.nodes.get(id) })
  return {
    keys: [...ontology.nodeTypeKeys],
    podFill: ontology.styleForKey('pod').color.light.fill,
    callsStroke: [...ontology.edgeStrokeFor('calls').dash],
    scalar: sortedRecord([...scalar]),
    rendered: {
      canvas: html.includes('<canvas'),
      chips: sorted([...html.matchAll(/class="header-type-label">([^<]*)</g)].map(m => m[1])),
      files: sorted([...html.matchAll(/class="header-file-name">([^<]*)</g)].map(m => m[1])),
    },
  }
}
