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
import { RELATION_DIMENSION } from './dimension'
import type { Ontology } from './ontology'

export type GraphDiagnosticCode =
  | 'edge-id-duplicate'
  | 'edge-endpoint-missing'
  | 'edge-relation-unknown'
  | 'edge-type-rule-threw'
  | 'edge-type-undeclared'
  | 'edge-type-category-mismatch'
  | 'parent-missing'
  | 'parent-edge-missing'
  | 'containment-parent-mismatch'
  | 'node-value-undeclared'

export interface GraphDiagnostic {
  /** An error names something the view cannot draw as given; a warning, something it draws but the host should know. */
  severity: 'error' | 'warning'
  code: GraphDiagnosticCode
  message: string
  nodeId?: string
  edgeId?: string
}

const RELATIONS = new Set(['containment', 'dependency'])

export function validateGraph(graph: Graph, ontology: Ontology): GraphDiagnostic[] {
  const out: GraphDiagnostic[] = []
  const declaredTypes = new Map(ontology.edgeTypes.map(e => [e.id, e]))
  const declaredValues = new Set(ontology.nodeTypeKeys)

  // Nodes: a parent that exists, a style value the taxonomy declares.
  for (const node of graph.nodes.values()) {
    if (node.parentId !== undefined && !graph.nodes.has(node.parentId)) {
      out.push({ severity: 'error', code: 'parent-missing', nodeId: node.id, message: `node ${JSON.stringify(node.id)} names parent ${JSON.stringify(node.parentId)}, which is not in the graph` })
    }
    const value = ontology.valueFor(node)
    if (value !== undefined && !declaredValues.has(value)) {
      out.push({ severity: 'warning', code: 'node-value-undeclared', nodeId: node.id, message: `node ${JSON.stringify(node.id)} sits at ${JSON.stringify(value)} on the style axis, which the taxonomy does not declare; it draws in the fallback style` })
    }
  }

  // Edges: unique ids, both ends present, a known relation, a declared type
  // whose category is the relation.
  const seenIds = new Set<string>()
  const containmentParent = new Map<string, string>()
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
    const relation = edge.dimensions[RELATION_DIMENSION]
    if (relation === undefined || !RELATIONS.has(relation)) {
      out.push({ severity: 'error', code: 'edge-relation-unknown', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} has relation ${JSON.stringify(relation)}; the engine knows "containment" and "dependency"` })
      continue
    }
    if (relation === 'containment') containmentParent.set(edge.sourceId, edge.targetId)
    let typeId: string
    try {
      typeId = ontology.resolveEdgeType(edge, ontology.valueFor(src), ontology.valueFor(tgt))
    } catch (e) {
      out.push({ severity: 'error', code: 'edge-type-rule-threw', edgeId: edge.id, message: `the taxonomy's edge rule threw on edge ${JSON.stringify(edge.id)}: ${e instanceof Error ? e.message : String(e)}` })
      continue
    }
    const declared = declaredTypes.get(typeId)
    if (!declared) {
      out.push({ severity: 'error', code: 'edge-type-undeclared', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} resolves to type ${JSON.stringify(typeId)}, which edgeTypes does not declare` })
      continue
    }
    if (declared.category !== relation) {
      out.push({ severity: 'error', code: 'edge-type-category-mismatch', edgeId: edge.id, message: `edge ${JSON.stringify(edge.id)} is a ${relation} edge but resolves to type ${JSON.stringify(typeId)}, declared as ${declared.category}` })
    }
  }

  // The two readings of containment agree: a node's parentId is the target of
  // its containment edge, and a containment edge's source names its target as
  // parent.
  for (const node of graph.nodes.values()) {
    const viaEdge = containmentParent.get(node.id)
    if (node.parentId !== undefined && graph.nodes.has(node.parentId) && viaEdge === undefined) {
      out.push({ severity: 'warning', code: 'parent-edge-missing', nodeId: node.id, message: `node ${JSON.stringify(node.id)} has parent ${JSON.stringify(node.parentId)} but no containment edge to it` })
    } else if (viaEdge !== undefined && viaEdge !== node.parentId) {
      out.push({ severity: 'warning', code: 'containment-parent-mismatch', nodeId: node.id, message: `node ${JSON.stringify(node.id)} has a containment edge to ${JSON.stringify(viaEdge)} but its parentId is ${JSON.stringify(node.parentId)}` })
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
