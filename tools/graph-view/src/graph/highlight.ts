// Transitive dependency highlighting for graph hover/selection.

import { isContainment } from './model'
import type { GraphEdge, GraphNode } from './model'
import type { Highlight, HighlightGraph, Ontology } from './ontology'

export type HighlightDirection = 'downstream' | 'upstream'

// BFS traversal of dependency edges (not containment) in the given direction.
// Returns the set of transitively connected node IDs including the starting node.
export function getTransitiveDeps(
  nodeId: string,
  edges: GraphEdge[],
  visibleIds: Set<string>,
  direction: HighlightDirection,
): Set<string> {
  const result = new Set<string>([nodeId])
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (isContainment(edge)) continue

      let next: string | undefined
      if (direction === 'downstream' && edge.sourceId === current) {
        next = edge.targetId
      } else if (direction === 'upstream' && edge.targetId === current) {
        next = edge.sourceId
      }

      if (next && visibleIds.has(next) && !result.has(next)) {
        result.add(next)
        queue.push(next)
      }
    }
  }

  return result
}

// Return edge IDs where both endpoints are in the highlighted node set
// and the edge is a dependency (not containment).
export function getHighlightedEdgeIds(
  highlightedNodes: Set<string>,
  edges: GraphEdge[],
): Set<string> {
  const result = new Set<string>()
  for (const edge of edges) {
    if (isContainment(edge)) continue
    if (highlightedNodes.has(edge.sourceId) && highlightedNodes.has(edge.targetId)) {
      result.add(edge.id)
    }
  }
  return result
}

/**
 * The highlight for an active node: the library's directional walk
 * from it, handed to the taxonomy's hook to widen or replace, with the lit
 * edges derived from the lit nodes when the hook names none. One function for
 * the view's hook and the harness, so what is pinned is what is drawn.
 */
export function highlightOf(
  ontology: Ontology,
  active: GraphNode,
  direction: HighlightDirection,
  graph: HighlightGraph,
): { nodes: Set<string>; edges: Set<string> } {
  const walked = getTransitiveDeps(active.id, [...graph.visibleEdges], new Set(graph.visibleIds), direction)
  const lit: Highlight = ontology.highlight(active, { nodes: walked }, graph)
  const nodes = new Set(lit.nodes)
  const edges = lit.edges ? new Set(lit.edges) : getHighlightedEdgeIds(nodes, [...graph.visibleEdges])
  return { nodes, edges }
}
