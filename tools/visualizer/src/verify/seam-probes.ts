// The host-to-view seams D61 cut, pinned: the view's half of the
// group overlay (restrict to the visible set, drop the empty, colour in order,
// glow the emphasised), the host's half (its decomposition and an initialized
// selection into groups over the whole graph), the chip counts the host reads
// off its AST, and the bar rendered with those counts and the host's findings
// in its slot. Each is the function the view or the host calls, not a
// re-derivation (F25).

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { activeGroupsOf } from '@temporal-architect/graph-view/graph/groups'
import type { NodeGroup } from '@temporal-architect/graph-view/graph/groups'
import { TaxonomyContext } from '@temporal-architect/graph-view/components/graph-view/useTaxonomy'
import { FilterBar } from '@temporal-architect/graph-view/components/FilterBar'
import { GroupLegend } from '@temporal-architect/graph-view/components/GroupLegend'
import { filterOfSets } from './filter-states'
import { valuesOn } from '@temporal-architect/graph-view/graph/axis'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import { copyGroups } from '@temporal-architect/graph-view/graph/model'
import { DEFAULT_TAXONOMY, NODE_TYPE_REGISTRY, ALL_NODE_TYPES } from '../adapter/node-types'
import { definitionCounts } from '../adapter/useGraphModel'
import { initialGroupSelection, initializedSelection, nodeGroupsOf } from '../adapter/groups'
import { FIXTURES } from './fixtures'
import { buildFixtureGraph } from './tier-a'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const noop = () => {}
const defaultTypes = new Set(ALL_NODE_TYPES.filter(t => NODE_TYPE_REGISTRY[t].defaultVisible).map(t => NODE_TYPE_REGISTRY[t].defType))

/** The view's half, on a hand-built case every rule of it meets. */
function viewHalf(): Json {
  const groups: NodeGroup[] = [
    { id: 'a', nodeIds: new Set(['n1', 'n2', 'n9']) },          // partly visible
    { id: 'b', nodeIds: new Set(['n9']) },                      // hidden: takes no colour
    { id: 'c', nodeIds: new Set(['n3']), emphasized: true },    // emphasised
    { id: 'd', nodeIds: new Set() },                            // empty
    { id: 'e', nodeIds: new Set(['n1']) },                      // overlaps a
  ]
  return activeGroupsOf(groups, new Set(['n1', 'n2', 'n3'])).map(g => ({ id: g.id, color: g.color, strength: g.strength, nodeIds: sorted(g.nodeIds) }))
}

/** The host's half, on the fixture that carries a decomposition. */
function hostHalf(): Json {
  const out: Record<string, Json> = {}
  for (const fixture of FIXTURES) {
    if (!fixture.decomposition) continue
    const graph = buildFixtureGraph(fixture)
    const copies = copyGroups(graph)
    const selection = initializedSelection(initialGroupSelection(), fixture.decomposition)
    const groups = nodeGroupsOf(fixture.decomposition, selection, null, copies)
    const firstChunk = fixture.decomposition.chunks[0]?.id
    const hovered = firstChunk ? nodeGroupsOf(fixture.decomposition, selection, { chunkId: firstChunk }, copies) : []
    out[fixture.name] = {
      groups: groups.map(g => ({ id: g.id, size: g.nodeIds.size })),
      emphasizedUnderHover: sorted(hovered.filter(g => g.emphasized).map(g => g.id)),
      off: nodeGroupsOf(fixture.decomposition, initialGroupSelection(), null, copies).length,
    }
  }
  return out
}

/** The chip counts, per fixture, with no file selected and with the first file selected. */
function counts(): Json {
  const out: Record<string, Json> = {}
  for (const fixture of FIXTURES) {
    const files = sorted(new Set(fixture.ast.definitions.map(d => d.sourceFile).filter((f): f is string => !!f)))
    const toJson = (m: ReadonlyMap<string, ReadonlyMap<string, number>>) => sortedRecord([...m].map(([k, v]) => [k, sortedRecord([...v])] as const))
    out[fixture.name] = {
      noFile: toJson(definitionCounts(fixture.ast, new Set())),
      firstFile: files[0] ? toJson(definitionCounts(fixture.ast, new Set([files[0]]))) : null,
    }
  }
  return out
}

/** Each chip's label and its badge, read off the bar's markup. */
function badgesOf(html: string): Json {
  const badges: Record<string, string> = {}
  for (const m of html.matchAll(/class="gv-(?:chip-label|tag-label)">([^<]*)<\/span><span class="gv-header-chip-count">([^<]*)<\/span>/g)) badges[m[1]] = m[2]
  return sortedRecord(Object.entries(badges))
}

/** How many pin toggles the markup carries: one per axis shown, when the bar offers them. */
const pinToggles = (html: string): number => (html.match(/class="gv-pin-toggle[ "]/g) ?? []).length

/** The bar as rendered with the host's counts in its badges and its findings in the slot. */
function barRendered(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const filter = filterOfSets(defaultTypes, new Set<string>())
  const html = renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY },
    React.createElement(FilterBar, {
      counts: definitionCounts(fixture.ast, new Set()),
      filter, onFilterChange: noop, locks: new Map<string, boolean>(), onLocksChange: noop,
      overriddenLocks: new Set<string>(),
      search: { query: '', active: false }, onSearchChange: noop, searchInputRef: React.createRef<HTMLInputElement>(),
      searchTitle: 'Search', searchPlaceholder: 'Search',
      axes: [SOURCE_FILE_DIMENSION, DEF_TYPE_DIMENSION],
      values: new Map(DEFAULT_TAXONOMY.filterAxes.map(d => [d.id, valuesOn(graph.nodes, d.id)])),
      findings: React.createElement('div', { 'data-probe': 'findings' }),
    })))
  return { badges: badgesOf(html), findingsSlot: html.includes('data-probe="findings"'), pinToggles: pinToggles(html) }
}

/** The bar given the graph and nothing else of its own: values and badge counts are read off the nodes. */
function barFromGraph(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const html = renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY },
    React.createElement(FilterBar, {
      graph, filter: filterOfSets(defaultTypes, new Set<string>()), onFilterChange: noop, locks: new Map<string, boolean>(), onLocksChange: noop,
    })))
  return { badges: badgesOf(html), pinToggles: pinToggles(html) }
}

/** The same bar with no pins and no way to change them: the host has no second view to pin against, and the toggles are absent. */
function barWithoutPins(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const html = renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY },
    React.createElement(FilterBar, { graph, filter: filterOfSets(defaultTypes, new Set<string>()), onFilterChange: noop })))
  return { badges: badgesOf(html), pinToggles: pinToggles(html), pinTogglesAbsent: !html.includes('gv-pin-toggle') }
}

/** The same bar with no pins but `chrome.pins` asking for the toggles: the host's say-so outranks the default. */
function barChromePins(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const html = renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY },
    React.createElement(FilterBar, { graph, filter: filterOfSets(defaultTypes, new Set<string>()), onFilterChange: noop, chrome: { locks: true } })))
  return { pinToggles: pinToggles(html) }
}

/** The callback alone does not show the lock toggles: a one-view host that listens has nothing to lock against. */
function barCallbackAlone(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const html = renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY },
    React.createElement(FilterBar, { graph, filter: filterOfSets(defaultTypes, new Set<string>()), onFilterChange: noop, onLocksChange: noop })))
  return { pinToggles: pinToggles(html) }
}
/** The bar carries its own theme and scheme on its root; "+" adds the one available axis directly and opens a menu for several. */
function barChrome(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const render = (axes: readonly string[], theme?: 'light' | 'dark') => renderToStaticMarkup(React.createElement(TaxonomyContext.Provider, { value: DEFAULT_TAXONOMY },
    React.createElement(FilterBar, { graph, filter: filterOfSets(defaultTypes, new Set<string>()), onFilterChange: noop, axes, onAxesChange: noop, theme })))
  const all = DEFAULT_TAXONOMY.filterAxes.map(d => d.id)
  const dark = render(all, 'dark')
  return {
    themedRoot: /class="gv-canvas-header[^"]*"[^>]*data-theme="dark"/.test(dark) || /data-theme="dark"[^>]*class="gv-canvas-header/.test(dark),
    schemeOnRoot: dark.includes(DEFAULT_TAXONOMY.colorVar(DEFAULT_TAXONOMY.styleValues[0]) + ':'),
    systemResolvesLight: /data-theme="light"/.test(render(all)),
    menuForSeveral: /title="Add a filter"/.test(render([])) && all.length > 1,
    directForOne: /title="Add the [^"]+ filter"/.test(render(all.slice(1))),
  }
}
/** The legend: a row per item, the drawn colour on its swatch, a note for an item on but hidden by the filter, checkboxes only with a toggle. */
function groupLegend(): Json {
  const active = [{ id: 'g', color: '#123456', strength: 1, nodeIds: new Set(['a']) }]
  const html = renderToStaticMarkup(React.createElement(GroupLegend, {
    title: 'Groups', items: [{ id: 'g', label: 'G' }, { id: 'h', label: 'H' }, { id: 'i', label: 'I' }], active, enabled: new Set(['g', 'h']), onToggle: noop,
  }))
  const bare = renderToStaticMarkup(React.createElement(GroupLegend, { items: [{ id: 'g', label: 'G' }], active: [] }))
  return {
    rows: (html.match(/gv-group-legend-row/g) ?? []).length,
    checkboxes: (html.match(/type="checkbox"/g) ?? []).length,
    checked: (html.match(/checked=""/g) ?? []).length,
    notShownNotes: (html.match(/not shown/g) ?? []).length,
    swatchColour: html.includes('#123456'),
    bareHasNoCheckbox: !bare.includes('type="checkbox"'),
  }
}

export function seamProbes(): Json {
  return {
    viewHalf: viewHalf(), hostHalf: hostHalf(), counts: counts(), barRendered: barRendered(), barFromGraph: barFromGraph(), barWithoutPins: barWithoutPins(), barChromePins: barChromePins(),
    barCallbackAlone: barCallbackAlone(), barChrome: barChrome(), groupLegend: groupLegend(),
  }
}
