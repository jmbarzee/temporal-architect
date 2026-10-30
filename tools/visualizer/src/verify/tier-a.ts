// Tier A — exact, structural goldens for one fixture.
//
// Everything here is discrete: ids, types, resolved classifications, set
// membership. No positions, no floats except the downstream scores (which are
// exact rationals). Byte-identical is the contract.

import { DISPATCH_DIMENSION } from '../adapter/edge-types'
import { filterOfSets } from './filter-states'
import { buildGraph } from '../adapter/build'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view/graph/model'
import { copyGroups, copyKeyOf, nodesById, payloadString, relationOf } from '@temporal-architect/graph-view/graph/model'
import { Simulation, axisOptions, fitsCeiling, pairTuning, defaultParamsFor, sprungEdges } from '@temporal-architect/graph-view/graph/simulation'
import { presentSpringCategories, resolveSprings, resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import { presentSetsOf } from '@temporal-architect/graph-view/components/graph-view/present'
import { highlightOf } from '@temporal-architect/graph-view/graph/highlight'
import { BUILT_IN_SCALARS } from '@temporal-architect/graph-view/graph/scalar'
import { readableGraph } from '@temporal-architect/graph-view/graph/model'
import { computeVisibleGraph } from '@temporal-architect/graph-view/components/graph-view/visibleGraph'
import type { ContextLine } from '@temporal-architect/graph-view/graph/taxonomy'
import type { Fixture } from './fixtures'
import { ALL_TYPES_STATE, TYPE_STATES, fileStates } from './filter-states'
import { SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import { DEFAULT_TAXONOMY } from '../adapter/node-types'
import { NEUTRAL_STROKE } from '@temporal-architect/graph-view/graph/shapes'
import type { Json } from './snapshot'
import { histogram, sorted, sortedRecord } from './snapshot'

/** What an edge no type claims is called in a row; the shipped table claims every edge a fixture has. */
const UNCLASSIFIED = '(unclassified)'

/**
 * A context line as a row. The library lets a host answer with any element; this
 * host answers with text, so anything else is a drift the harness names rather
 * than records.
 */
function contextLineRow(line: ContextLine): Json {
  if (line === undefined || line === null) return ''
  if (typeof line === 'string') return line
  if (Array.isArray(line) && line.every((l): l is string => typeof l === 'string')) return [...line]
  throw new Error('tier-a: the taxonomy answered a context line that is not text')
}

/** Every source file the graph's nodes carry, sorted — the file chips' domain. */
export function allFilesOf(graph: Graph): string[] {
  const files = new Set<string>()
  for (const node of graph.nodes) {
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
    ring: n.ring ?? null,
    copyKey: copyKeyOf(n),
  }
  if (n.parentId !== undefined) row.parentId = n.parentId
  // Host payload, read back by key. Emitted under the same names the fields
  // used to have so the row stays comparable across the move.
  for (const key of ['worker', 'namespace', 'queue']) {
    const v = payloadString(n, key)
    if (v !== undefined) row[key] = v
  }
  if (n.badges !== undefined) row.badges = [...n.badges]
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
  const srcValue = src && DEFAULT_TAXONOMY.styleValueOf(src)
  const tgtValue = tgt && DEFAULT_TAXONOMY.styleValueOf(tgt)
  const parts = [
    DEFAULT_TAXONOMY.classifyEdge(e, srcValue, tgtValue) ?? UNCLASSIFIED,
    relationOf(e),
    `${e.sourceId} -> ${e.targetId}`,
  ]
  const ep = payloadString(e, 'nexusEndpoint')
  if (ep !== undefined) parts.push(`ep=${ep}`)
  const dispatch = e.dimensions?.[DISPATCH_DIMENSION]
  if (dispatch !== undefined) parts.push(`dispatch=${dispatch}`)
  return parts.join('|')
}

function visibleState(
  sim: Simulation,
  visibleTypes: ReadonlySet<string>,
  selectedFiles: ReadonlySet<string>,
): Json {
  const vg = computeVisibleGraph(sim, filterOfSets(visibleTypes, selectedFiles), DEFAULT_TAXONOMY)
  const nodeOf = (id: string) => sim.getNode(id)
  return {
    visibleNodeCount: vg.visibleNodes.length,
    visibleEdgeCount: vg.visibleEdges.length,
    visibleNodeIds: sorted(vg.visibleIds),
    graduatedEdges: sorted(vg.visibleEdges.map(e => edgeLine(e, nodeOf))),
    nodeSummaries: sortedRecord([...vg.nodeSummaries]),
    downstreamScores: sortedRecord([...vg.downstreamScores]),
    // What the controls offer in this state (R35, D59): `presentSetsOf`, the
    // function the view calls, over the visible nodes and the edges the
    // simulation springs — pinned, not re-derived.
    controls: (() => {
      const resolved = resolvePhysics(defaultParamsFor(DEFAULT_TAXONOMY), DEFAULT_TAXONOMY)
      const p = presentSetsOf(vg.visibleNodes, sprungEdges(sim.edges, vg.visibleIds), resolved, nodeOf)
      return { push: sorted(p.push), bandX: sorted(p.bandX), bandY: sorted(p.bandY), springs: sorted(p.springs) }
    })(),
    // The highlight as drawn (D59, D60): `highlightOf` — the library's walk,
    // the host's hook, the derived edges — for the first visible node of each
    // style value, per state.
    hookedHighlights: sortedRecord(DEFAULT_TAXONOMY.styleValues.flatMap(value => {
      const first = vg.visibleNodes.find(n => DEFAULT_TAXONOMY.styleValueOf(n) === value)
      if (!first) return []
      const lit = highlightOf(DEFAULT_TAXONOMY, first, 'downstream', { visibleNodes: vg.visibleNodes, visibleEdges: vg.visibleEdges, visibleIds: vg.visibleIds, getNode: nodeOf })
      return [[value, { from: first.id, nodes: sorted(lit.nodes), edges: sorted(lit.edges) }] as const]
    })),
  }
}

export interface TierA {
  snapshot: Json
  graph: Graph
  sim: Simulation
}

export function tierA(fixture: Fixture, sim: Simulation, graph: Graph): Json {
  const byId = nodesById(graph.nodes)
  const nodeOf = (id: string) => byId.get(id)
  const nodes = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
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
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      sourceFiles: allFilesOf(graph),
      nodes: nodes.map(nodeRow),
      edges: edgeLines,
      copyGroups: sortedRecord(
        [...copyGroups(graph)].map(([k, ids]) => [k, sorted(ids)] as const),
      ),
    },
    edgeClassification: {
      byEdgeType: histogram(graph.edges.map(e => {
        const src = nodeOf(e.sourceId)
        const tgt = nodeOf(e.targetId)
        return DEFAULT_TAXONOMY.classifyEdge(e, src && DEFAULT_TAXONOMY.styleValueOf(src), tgt && DEFAULT_TAXONOMY.styleValueOf(tgt)) ?? UNCLASSIFIED
      })),
      // The stroke each edge draws with, read the way the canvas reads it —
      // the type's stroke through the taxonomy (D57, D58): the composition
      // the 66 colour changes of Unit 6 are pinned by.
      byStroke: histogram(graph.edges.map(e => {
        const src = nodeOf(e.sourceId)
        const tgt = nodeOf(e.targetId)
        const type = DEFAULT_TAXONOMY.classifyEdge(e, src && DEFAULT_TAXONOMY.styleValueOf(src), tgt && DEFAULT_TAXONOMY.styleValueOf(tgt))
        // An unclassified edge draws in the neutral stroke, as the view does.
        const st = type === undefined ? NEUTRAL_STROKE : DEFAULT_TAXONOMY.edgeStrokeFor(type)
        return `${st.color.light}/${st.color.dark}|${st.dash.join(',')}|${st.width}`
      })),
    },
    // Every axis push/pull may key on for this graph, what each would cost on
    // the control surface, and the spring categories some edge falls in under
    // it — the declared table's on the style axis, the pair rule's elsewhere.
    // The ceiling arithmetic, pinned per fixture (Unit 4e).
    axes: axisOptions(DEFAULT_TAXONOMY, graph).map(o => ({
      axis: o.mapping.dimension,
      pushTokens: o.pushTokens,
      pullTokens: o.pullTokens,
      fits: fitsCeiling(o),
      presentSprings: sorted(presentSpringCategories(
        resolveSprings(pairTuning(o.mapping), DEFAULT_TAXONOMY), graph.edges, nodeOf,
      )),
    })),
    // The hover box's context line per node (D59, B35): the taxonomy's hook
    // read against the fixture's own payloads, or its default — the parent's
    // name — where the hook says nothing.
    contextLines: sortedRecord(nodes.map(n => [n.id, contextLineRow(DEFAULT_TAXONOMY.contextLine(n, n.parentId ? nodeOf(n.parentId) : undefined))] as const)),
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
