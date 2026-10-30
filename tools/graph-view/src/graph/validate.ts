// Graph validation — every defect a host's graph can carry, named before the
// view builds anything from it.
//
// A dangling endpoint, an edge whose relation is neither of the two the engine
// knows, an edge the host's rule classifies as a type its table does not
// declare: each used to be either dropped in silence or thrown from inside a
// render memo, where no boundary catches it and the host's whole tree
// unmounts. Here they are diagnostics. The view runs this once per graph,
// shows the list inside its own pane, and draws what remains; a host that
// wants to refuse a bad graph before mounting calls it itself.

import type { Graph, GraphEdge } from './model'
import { relationOf } from './model'
import type { Taxonomy } from './taxonomy'

export type GraphDiagnosticCode =
  | 'edge-id-duplicate'
  | 'edge-endpoint-missing'
  | 'edge-relation-unknown'
  | 'edge-type-rule-threw'
  | 'edge-type-unclassified'
  | 'edge-type-relation-mismatch'
  | 'parent-missing'
  | 'containment-parent-mismatch'
  | 'node-value-undeclared'
  | 'node-key-mismatch'

export interface GraphDiagnostic {
  /** An error names something the view cannot draw as given; a warning, something it draws but the host should know. */
  severity: 'error' | 'warning'
  code: GraphDiagnosticCode
  message: string
  nodeId?: string
  edgeId?: string
}

const RELATIONS = new Set(['containment', 'dependency'])

export function validateGraph(graph: Graph, taxonomy: Taxonomy): GraphDiagnostic[] {
  const out: GraphDiagnostic[] = []
  const declaredTypes = new Map(taxonomy.edgeTypes.map(e => [e.id, e]))
  const declaredValues = new Set(taxonomy.styleValues)

  // Nodes: keyed by their own id, a parent that exists, a style value the
  // taxonomy declares.
  for (const [key, node] of graph.nodes) {
    if (key !== node.id) {
      out.push({ severity: 'warning', code: 'node-key-mismatch', nodeId: node.id, message: `node ${JSON.stringify(node.id)} is keyed as ${JSON.stringify(key)} in the graph's map; the view reads it by its id` })
    }
    if (node.parentId !== undefined && !graph.nodes.has(node.parentId)) {
      out.push({ severity: 'error', code: 'parent-missing', nodeId: node.id, message: `node ${JSON.stringify(node.id)} names parent ${JSON.stringify(node.parentId)}, which is not in the graph` })
    }
    const value = taxonomy.styleValueOf(node)
    if (value !== undefined && !declaredValues.has(value)) {
      out.push({ severity: 'warning', code: 'node-value-undeclared', nodeId: node.id, message: `node ${JSON.stringify(node.id)} sits at ${JSON.stringify(value)} on the style axis, which the taxonomy does not declare; it draws in the fallback style` })
    }
  }

  // Edges: unique ids, both ends present, a known relation, a type (when one
  // classifies) whose relation is the edge's.
  const seenIds = new Set<string>()
  const containers = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (seenIds.has(edge.id)) {
      out.push({ severity: 'error', code: 'edge-id-duplicate', edgeId: edge.id, message: `edge id ${JSON.stringify(edge.id)} is used more than once` })
      continue
    }
    seenIds.add(edge.id)
    const src = graph.nodes.get(edge.sourceId)
    const tgt = graph.nodes.get(edge.targetId)
    if (!src || !tgt) {
      const missing = [!src && edge.sourceId, !tgt && edge.targetId].filter((x): x is string => typeof x === 'string')
      out.push({ severity: 'error', code: 'edge-endpoint-missing', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} names ${missing.map(m => JSON.stringify(m)).join(' and ')}, not in the graph` })
      continue
    }
    if (edge.relation !== undefined && !RELATIONS.has(edge.relation)) {
      out.push({ severity: 'error', code: 'edge-relation-unknown', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} has relation ${JSON.stringify(edge.relation)}; the engine knows "containment" and "dependency"` })
      continue
    }
    const relation = relationOf(edge)
    if (relation === 'containment') {
      const set = containers.get(edge.sourceId) ?? new Set<string>()
      set.add(edge.targetId)
      containers.set(edge.sourceId, set)
    }
    let typeId: string | undefined
    try {
      typeId = taxonomy.classifyEdge(edge, taxonomy.styleValueOf(src), taxonomy.styleValueOf(tgt))
    } catch (e) {
      out.push({ severity: 'error', code: 'edge-type-rule-threw', edgeId: edge.id, message: `the taxonomy's classifyEdge threw on edge ${JSON.stringify(edge.id)}: ${e instanceof Error ? e.message : String(e)}` })
      continue
    }
    const declared = typeId === undefined ? undefined : declaredTypes.get(typeId)
    if (!declared) {
      const said = typeId === undefined ? 'no declared type runs between its endpoints' : `classifyEdge answered ${JSON.stringify(typeId)}, which edgeTypes does not declare`
      out.push({ severity: 'warning', code: 'edge-type-unclassified', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} has no type: ${said}; it draws in the neutral stroke with the typical spring` })
      continue
    }
    if (declared.relation !== relation) {
      out.push({ severity: 'error', code: 'edge-type-relation-mismatch', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} is a ${relation} edge but resolves to type ${JSON.stringify(typeId)}, declared as ${declared.relation}` })
    }
  }

  // The two readings of containment agree: a node that lists containment
  // edges of its own lists one to its parent. A node listing none gets that
  // edge derived from `parentId`; a node with no parent may list what it likes.
  for (const node of graph.nodes.values()) {
    const viaEdges = containers.get(node.id)
    if (node.parentId !== undefined && viaEdges !== undefined && !viaEdges.has(node.parentId)) {
      out.push({ severity: 'warning', code: 'containment-parent-mismatch', nodeId: node.id, message: `node ${JSON.stringify(node.id)} has containment edges to ${[...viaEdges].map(c => JSON.stringify(c)).join(' and ')} but its parentId is ${JSON.stringify(node.parentId)}` })
    }
  }
  return out
}

/**
 * The graph with every edge an error names removed and every parent an error
 * names cleared — what the view draws when the host's graph has defects. The
 * host's objects are not mutated; a graph with no errors is returned as is.
 */
export function dropInvalid(graph: Graph, diagnostics: readonly GraphDiagnostic[]): Graph {
  const badEdges = new Set<string>()
  const badParents = new Set<string>()
  for (const d of diagnostics) {
    if (d.severity !== 'error') continue
    if (d.edgeId !== undefined) badEdges.add(d.edgeId)
    if (d.code === 'parent-missing' && d.nodeId !== undefined) badParents.add(d.nodeId)
  }
  if (badEdges.size === 0 && badParents.size === 0) return graph
  const nodes = new Map(graph.nodes)
  for (const id of badParents) {
    const node = nodes.get(id)
    if (node) nodes.set(id, { ...node, parentId: undefined })
  }
  // A duplicated id names every edge carrying it; the first keeps its place.
  const kept = new Set<string>()
  const edges: GraphEdge[] = []
  for (const e of graph.edges) {
    if (badEdges.has(e.id) && kept.has(e.id)) continue
    if (badEdges.has(e.id) && !diagnostics.some(d => d.edgeId === e.id && d.code === 'edge-id-duplicate')) continue
    kept.add(e.id)
    edges.push(e)
  }
  return { nodes, edges }
}
