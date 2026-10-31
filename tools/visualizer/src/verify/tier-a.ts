// Tier A — exact, structural goldens for one fixture.
//
// Everything here is discrete: ids, types, resolved classifications, set
// membership. No positions, no floats except the downstream scores (which are
// exact rationals). Byte-identical is the contract.

import { buildGraph } from '../adapter/build'
import { edgeTypeFor } from '../adapter/edge-types'
import { edgeStyleKeyFor } from '../graph/edge-styles'
import type { Graph, GraphEdge, GraphNode } from '../graph/model'
import { payloadString } from '../graph/model'
import { Simulation } from '../graph/simulation'
import { computeVisibleGraph } from '../components/graph-view/visibleGraph'
import type { Fixture } from './fixtures'
import { ALL_TYPES_STATE, TYPE_STATES, fileStates } from './filter-states'
import { SOURCE_FILE_DIMENSION } from '../graph/dimension'
import { DEFAULT_ONTOLOGY } from '../adapter/node-types'
import type { Json } from './snapshot'
import { histogram, sorted, sortedRecord } from './snapshot'

/** Every source file the graph's nodes carry, sorted — the file chips' domain. */
export function allFilesOf(graph: Graph): string[] {
  const files = new Set<string>()
  for (const node of graph.nodes.values()) {
    const file = node.dimensions[SOURCE_FILE_DIMENSION]
    if (file) files.add(file)
  }
  return sorted(files)
}

function nodeRow(n: GraphNode): Json {
  const row: { [k: string]: Json } = {
    id: n.id,
    // The one row shape change Unit 2 makes, enumerated in D17/D34: a node's
    // identity was one string and is now a map of axis to value. The values
    // inside it are the strings the field used to hold.
    dimensions: { ...n.dimensions },
    name: n.name,
    orphan: n.orphan,
    definitionKey: n.definitionKey,
  }
  if (n.parentId !== undefined) row.parentId = n.parentId
  // Host payload, read back by key. Emitted under the same names the fields
  // used to have so the row stays comparable across the move.
  for (const key of ['worker', 'namespace', 'queue']) {
    const v = payloadString(n, key)
    if (v !== undefined) row[key] = v
  }
  if (n.templateParams !== undefined) row.templateParams = [...n.templateParams]
  return row
}

/**
 * One edge as a single diffable line:
 *   `<edgeTypeId>|<styleKey>|<edgeType>|<source> -> <target>[|ep=…][|dispatch=…]`
 * Both classifiers ride along, so the T11 divergence between them is visible
 * per edge rather than only in aggregate.
 */
function edgeLine(e: GraphEdge, nodeOf: (id: string) => GraphNode | undefined): string {
  const src = nodeOf(e.sourceId)
  const tgt = nodeOf(e.targetId)
  const srcValue = src && DEFAULT_ONTOLOGY.valueFor(src)
  const tgtValue = tgt && DEFAULT_ONTOLOGY.valueFor(tgt)
  const styleKey = src && tgt ? edgeStyleKeyFor(e, srcValue, tgtValue) : 'UNRESOLVED-ENDPOINT'
  const parts = [
    edgeTypeFor(e, srcValue, tgtValue).id,
    styleKey,
    e.edgeType,
    `${e.sourceId} -> ${e.targetId}`,
  ]
  if (e.nexusEndpoint !== undefined) parts.push(`ep=${e.nexusEndpoint}`)
  if (e.dispatchKind !== undefined) parts.push(`dispatch=${e.dispatchKind}`)
  return parts.join('|')
}

function visibleState(
  sim: Simulation,
  visibleTypes: Set<string>,
  selectedFiles: Set<string>,
): Json {
  const vg = computeVisibleGraph(sim, visibleTypes, selectedFiles, DEFAULT_ONTOLOGY)
  const nodeOf = (id: string) => sim.getNode(id)
  return {
    visibleNodeCount: vg.visibleNodes.length,
    visibleEdgeCount: vg.visibleEdges.length,
    visibleNodeIds: sorted(vg.visibleIds),
    graduatedEdges: sorted(vg.visibleEdges.map(e => edgeLine(e, nodeOf))),
    nodeSummaries: sortedRecord([...vg.nodeSummaries]),
    downstreamScores: sortedRecord([...vg.downstreamScores]),
  }
}

export interface TierA {
  snapshot: Json
  graph: Graph
  sim: Simulation
}

export function tierA(fixture: Fixture, sim: Simulation, graph: Graph): Json {
  const nodeOf = (id: string) => graph.nodes.get(id)
  const nodes = [...graph.nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const edgeLines = sorted(graph.edges.map(e => edgeLine(e, nodeOf)))

  const states: [string, Json][] = []
  // Type states, taken with no file filter.
  for (const ts of TYPE_STATES) {
    states.push([
      `${ts.name} · files:none`,
      visibleState(sim, new Set(ts.visibleTypes), new Set()),
    ])
  }
  // File states, taken with every type visible so the file dimension is the
  // only thing moving.
  const allTypes = TYPE_STATES.find(t => t.name === ALL_TYPES_STATE)
  if (!allTypes) throw new Error('filter-states: the all-types state is missing')
  for (const fs of fileStates(allFilesOf(graph))) {
    if (fs.selectedFiles.length === 0) continue // identical to the row above
    states.push([
      `${ALL_TYPES_STATE} · ${fs.name}`,
      visibleState(sim, new Set(allTypes.visibleTypes), new Set(fs.selectedFiles)),
    ])
  }

  return {
    fixture: fixture.name,
    graph: {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      sourceFiles: allFilesOf(graph),
      nodes: nodes.map(nodeRow),
      edges: edgeLines,
      duplicateGroups: sortedRecord(
        [...graph.duplicateGroups].map(([k, ids]) => [k, sorted(ids)] as const),
      ),
    },
    edgeClassification: {
      byEdgeType: histogram(graph.edges.map(e => {
        const src = nodeOf(e.sourceId)
        const tgt = nodeOf(e.targetId)
        return edgeTypeFor(e, src && DEFAULT_ONTOLOGY.valueFor(src), tgt && DEFAULT_ONTOLOGY.valueFor(tgt)).id
      })),
      byStyleKey: histogram(
        graph.edges.map(e => {
          const src = nodeOf(e.sourceId)
          const tgt = nodeOf(e.targetId)
          return src && tgt
            ? edgeStyleKeyFor(e, DEFAULT_ONTOLOGY.valueFor(src), DEFAULT_ONTOLOGY.valueFor(tgt))
            : 'UNRESOLVED-ENDPOINT'
        }),
      ),
    },
    visibleSubgraph: sortedRecord(states),
  }
}

export function buildFixtureGraph(fixture: Fixture): Graph {
  return buildGraph(fixture.parserGraph, fixture.ast)
}
