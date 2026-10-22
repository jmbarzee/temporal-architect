// Tier A — exact, structural goldens for one fixture.
//
// Everything here is discrete: ids, types, resolved classifications, set
// membership. No positions, no floats except the downstream scores (which are
// exact rationals). Byte-identical is the contract.

import { DISPATCH_DIMENSION, RELATION_DIMENSION } from '../graph/dimension'
import { filterOfSets } from '../filter/types'
import { buildGraph } from '../adapter/build'
import { edgeTypeFor } from '../adapter/edge-types'
import type { Graph, GraphEdge, GraphNode } from '../graph/model'
import { payloadString } from '../graph/model'
import { Simulation, axisOptions, fitsCeiling, pairTuning, defaultParamsFor } from '../graph/simulation'
import { presentSpringCategories, resolveSprings, presentBuckets, mappedAxis, resolvePhysics } from '../graph/forces'
import { BUILT_IN_SCALARS } from '../graph/scalar'
import { readableGraph } from '../graph/model'
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
 *   `<edgeTypeId>|<edgeType>|<source> -> <target>[|ep=…][|dispatch=…]`
 * One classifier (D57): the stroke is the type's, so the type is the line.
 */
function edgeLine(e: GraphEdge, nodeOf: (id: string) => GraphNode | undefined): string {
  const src = nodeOf(e.sourceId)
  const tgt = nodeOf(e.targetId)
  const srcValue = src && DEFAULT_ONTOLOGY.valueFor(src)
  const tgtValue = tgt && DEFAULT_ONTOLOGY.valueFor(tgt)
  const parts = [
    edgeTypeFor(e, srcValue, tgtValue),
    e.dimensions[RELATION_DIMENSION],
    `${e.sourceId} -> ${e.targetId}`,
  ]
  const ep = payloadString(e, 'nexusEndpoint')
  if (ep !== undefined) parts.push(`ep=${ep}`)
  const dispatch = e.dimensions[DISPATCH_DIMENSION]
  if (dispatch !== undefined) parts.push(`dispatch=${dispatch}`)
  return parts.join('|')
}

function visibleState(
  sim: Simulation,
  visibleTypes: ReadonlySet<string>,
  selectedFiles: ReadonlySet<string>,
): Json {
  const vg = computeVisibleGraph(sim, filterOfSets(visibleTypes, selectedFiles), DEFAULT_ONTOLOGY)
  const nodeOf = (id: string) => sim.getNode(id)
  return {
    visibleNodeCount: vg.visibleNodes.length,
    visibleEdgeCount: vg.visibleEdges.length,
    visibleNodeIds: sorted(vg.visibleIds),
    graduatedEdges: sorted(vg.visibleEdges.map(e => edgeLine(e, nodeOf))),
    nodeSummaries: sortedRecord([...vg.nodeSummaries]),
    downstreamScores: sortedRecord([...vg.downstreamScores]),
    // What the controls offer in this state (R35, D59): the push and band
    // buckets some visible node falls in, the spring categories some visible
    // edge falls in — read the way the view reads them.
    controls: (() => {
      const resolved = resolvePhysics(defaultParamsFor(DEFAULT_ONTOLOGY), DEFAULT_ONTOLOGY)
      return {
        push: sorted(presentBuckets(vg.visibleNodes, resolved.push)),
        bandX: sorted(presentBuckets(vg.visibleNodes, mappedAxis(resolved.bandX))),
        bandY: sorted(presentBuckets(vg.visibleNodes, mappedAxis(resolved.bandY))),
        springs: sorted([...presentSpringCategories(resolved.spring, vg.visibleEdges, nodeOf)]),
      }
    })(),
    // The host's highlight hook (D59), asked for the first visible node of each
    // style value with only that node lit: what it widens or replaces, per
    // value, in this state. The library's own walk is not pinned here.
    hookedHighlights: sortedRecord(DEFAULT_ONTOLOGY.nodeTypeKeys.flatMap(value => {
      const first = vg.visibleNodes.find(n => DEFAULT_ONTOLOGY.valueFor(n) === value)
      if (!first) return []
      const lit = DEFAULT_ONTOLOGY.highlight(first, { nodes: new Set([first.id]) }, { visibleNodes: vg.visibleNodes, visibleEdges: vg.visibleEdges, visibleIds: vg.visibleIds, getNode: nodeOf })
      return [[value, { from: first.id, nodes: sorted(lit.nodes), edges: lit.edges ? sorted(lit.edges) : 'derived' }] as const]
    })),
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
        return edgeTypeFor(e, src && DEFAULT_ONTOLOGY.valueFor(src), tgt && DEFAULT_ONTOLOGY.valueFor(tgt))
      })),
      // The stroke each edge draws with, read the way the canvas reads it —
      // the type's stroke through the taxonomy (D57, D58): the composition
      // the 66 colour changes of Unit 6 are pinned by.
      byStroke: histogram(graph.edges.map(e => {
        const src = nodeOf(e.sourceId)
        const tgt = nodeOf(e.targetId)
        const st = DEFAULT_ONTOLOGY.edgeStrokeFor(DEFAULT_ONTOLOGY.resolveEdgeType(e, src && DEFAULT_ONTOLOGY.valueFor(src), tgt && DEFAULT_ONTOLOGY.valueFor(tgt)))
        return `${st.color.light}/${st.color.dark}|${st.dash.join(',')}|${st.width}`
      })),
    },
    // Every axis push/pull may key on for this graph, what each would cost on
    // the control surface, and the spring categories some edge falls in under
    // it — the declared table's on the style axis, the pair rule's elsewhere.
    // The ceiling arithmetic, pinned per fixture (Unit 4e).
    axes: axisOptions(DEFAULT_ONTOLOGY, graph).map(o => ({
      axis: o.mapping.dimension,
      pushTokens: o.pushTokens,
      pullTokens: o.pullTokens,
      fits: fitsCeiling(o),
      presentSprings: sorted(presentSpringCategories(
        resolveSprings(pairTuning(o.mapping), DEFAULT_ONTOLOGY), graph.edges, nodeOf,
      )),
    })),
    // The hover box's context line per node (D59, B35): the taxonomy's hook
    // read against the fixture's own payloads, or its default — the parent's
    // name — where the hook says nothing.
    contextLines: sortedRecord(nodes.map(n => [n.id, DEFAULT_ONTOLOGY.contextLine(n, n.parentId ? nodeOf(n.parentId) : undefined) ?? ''] as const)),
    // Every built-in scalar's value per node over the whole graph (R8, R9) —
    // reach is the same function topological gravity reads over the visible
    // subgraph, so its rows here and `downstreamScores` there must agree
    // wherever the two graphs coincide.
    scalars: sortedRecord(BUILT_IN_SCALARS.map(sc => [sc.id, sortedRecord(
      [...sc.compute(readableGraph(graph))].map(([id, v]) => [id, v] as const),
    )] as const)),
    visibleSubgraph: sortedRecord(states),
  }
}

export function buildFixtureGraph(fixture: Fixture): Graph {
  return buildGraph(fixture.parserGraph, fixture.ast)
}
