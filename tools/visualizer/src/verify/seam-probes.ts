// The host-to-view seams D61 cut, pinned (REVIEW_8 C21): the view's half of the
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
import { OntologyContext } from '@temporal-architect/graph-view/components/graph-view/useOntology'
import { FilterBar } from '@temporal-architect/graph-view/components/FilterBar'
import { filterOfSets } from './filter-states'
import { valuesOn } from '@temporal-architect/graph-view/graph/dimension'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import { copyGroups } from '@temporal-architect/graph-view/graph/model'
import { DEFAULT_ONTOLOGY, NODE_TYPE_REGISTRY, ALL_NODE_TYPES } from '../adapter/node-types'
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

/** The bar as rendered with the host's counts in its badges and its findings in the slot. */
function barRendered(): Json {
  const fixture = FIXTURES.find(f => f.name === 'nexus-sample')
  if (!fixture) throw new Error('seam-probes: the nexus fixture is missing')
  const graph = buildFixtureGraph(fixture)
  const filter = filterOfSets(defaultTypes, new Set<string>())
  const html = renderToStaticMarkup(React.createElement(OntologyContext.Provider, { value: DEFAULT_ONTOLOGY },
    React.createElement(FilterBar, {
      counts: definitionCounts(fixture.ast, new Set()),
      filter, onFilterChange: noop, pins: new Map<string, boolean>(), onPinsChange: noop,
      overriddenPins: new Set<string>(), recentlyChanged: new Set<string>(),
      searchQuery: '', searchActive: false, onSearchChange: noop, searchInputRef: React.createRef<HTMLInputElement>(),
      searchTitle: 'Search', searchPlaceholder: 'Search',
      chain: [SOURCE_FILE_DIMENSION, DEF_TYPE_DIMENSION],
      valuesByDimension: new Map(DEFAULT_ONTOLOGY.filterDimensions.map(d => [d.id, valuesOn(graph.nodes.values(), d.id)])),
      findings: React.createElement('div', { 'data-probe': 'findings' }),
    })))
  const badges: Record<string, string> = {}
  for (const m of html.matchAll(/class="header-(?:type-label|file-name)">([^<]*)<\/span><span class="header-chip-count">([^<]*)<\/span>/g)) badges[m[1]] = m[2]
  return { badges: sortedRecord(Object.entries(badges)), findingsSlot: html.includes('data-probe="findings"') }
}

export function seamProbes(): Json {
  return { viewHalf: viewHalf(), hostHalf: hostHalf(), counts: counts(), barRendered: barRendered() }
}
