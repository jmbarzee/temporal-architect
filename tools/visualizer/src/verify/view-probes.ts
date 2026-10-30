// The control surface as rendered: the push/pull tab and the
// gravity tab server-rendered under two filter states of one fixture, with the
// present sets the view computes, counting what they offer. Tier A's
// `controls` rows pin the sets; these rows pin that the components OFFER them
// — a component that ignored its `present` would count the whole graph here.
// Plus the focus matcher, a pure function the view calls on every focus.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Graph } from '@temporal-architect/graph-view/graph/model'
import { DEFAULT_TAXONOMY, NODE_TYPE_REGISTRY, ALL_NODE_TYPES } from '../adapter/node-types'
import { Simulation, axisOptions, defaultParamsFor, layoutAxisOptions, sprungEdges } from '@temporal-architect/graph-view/graph/simulation'
import { resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import { computeVisibleGraph } from '@temporal-architect/graph-view/components/graph-view/visibleGraph'
import { presentSetsOf } from '@temporal-architect/graph-view/components/graph-view/present'
import { TaxonomyContext } from '@temporal-architect/graph-view/components/graph-view/useTaxonomy'
import { PushPullControls } from '@temporal-architect/graph-view/components/PushPullControls'
import { GravityControls } from '@temporal-architect/graph-view/components/GravityControls'
import { matchesFocus } from '@temporal-architect/graph-view/filter/types'
import { filterOfSets } from './filter-states'
import { FIXTURES } from './fixtures'
import { buildFixtureGraph } from './tier-a'
import { mulberry32 } from './rng'
import type { Json } from './snapshot'

function nexus(): Graph {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('view-probes: the nexus fixture is missing')
  return buildFixtureGraph(fixture)
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length
const noop = () => {}

/** What the two force tabs offer in one filter state, rendered. */
function offered(graph: Graph, visibleTypes: string[]): Json {
  const params = defaultParamsFor(DEFAULT_TAXONOMY)
  const sim = new Simulation(graph, params, mulberry32(1), DEFAULT_TAXONOMY)
  const vg = computeVisibleGraph(sim, filterOfSets(new Set(visibleTypes), new Set<string>()), DEFAULT_TAXONOMY)
  const resolved = resolvePhysics(params, DEFAULT_TAXONOMY)
  const present = presentSetsOf(vg.visibleNodes, sprungEdges(graph.edges, vg.visibleIds), resolved, id => sim.getNode(id))
  const axes = axisOptions(DEFAULT_TAXONOMY, graph)
  const wrap = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY }, el))
  const pushPull = wrap(React.createElement(PushPullControls, {
    params, resolved, axes, present,
    onParamChange: noop, onAxisChange: noop, onActiveSection: noop,
    hoveredPushBucket: null, onHoverPushBucket: noop, hoveredEdge: null, onHoverEdge: noop,
  }))
  const gravity = wrap(React.createElement(GravityControls, {
    params, resolved, axes: layoutAxisOptions(axes, DEFAULT_TAXONOMY), present,
    onParamChange: noop, onRelayout: noop, hovered: null, onHover: noop,
  }))
  return {
    visibleNodes: vg.visibleNodes.length,
    // Push and pull tokens share one token element; both bodies are mounted,
    // so this is push + pull. Columns carry two handles each, on both axes.
    tokens: count(pushPull, /class="gv-spring-token(?: [^"]*)?"/g),
    columnHandles: count(gravity, /class="gv-gravity-band-dot(?: [^"]*)?"/g),
    present: { push: present.push.size, springs: present.springs.size, bandX: present.bandX.size, bandY: present.bandY.size },
  }
}

export function viewProbes(): Json {
  const graph = nexus()
  const allTypes = ALL_NODE_TYPES.map(t => NODE_TYPE_REGISTRY[t].defType)
  return {
    offered: {
      allTypes: offered(graph, allTypes),
      defaultTypes: offered(graph, allTypes.filter(t => NODE_TYPE_REGISTRY[ALL_NODE_TYPES.find(k => NODE_TYPE_REGISTRY[k].defType === t)!].defaultVisible)),
      none: offered(graph, []),
    },
    // The focus matcher (D59), on values alone: an empty target, a value the node has, a wrong one, one it lacks, every value of several.
    focus: (() => {
      const node = { dimensions: { kind: 'k1', file: 'f1' } }
      return {
        valuesOnly: matchesFocus(node, { values: {} }),
        valueMatch: matchesFocus(node, { values: { kind: 'k1' } }),
        valueMismatch: matchesFocus(node, { values: { kind: 'k2' } }),
        undefinedValueIgnored: matchesFocus(node, { values: { kind: undefined } }),
        valueAbsent: matchesFocus(node, { values: { other: 'x' } }),
        everyValueMatches: matchesFocus(node, { values: { kind: 'k1', file: 'f1' } }),
        oneValueMismatches: matchesFocus(node, { values: { kind: 'k1', file: 'f2' } }),
      }
    })(),
  }
}
