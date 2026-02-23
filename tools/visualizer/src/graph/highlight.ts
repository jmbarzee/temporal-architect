// Transitive dependency highlighting for graph hover/selection.
// Implements GRAPH_VIEW.md § Interaction States: Dependency Highlighting.

import type { GraphEdge } from './model'

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
      if (edge.edgeType === 'containment') continue

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
    if (edge.edgeType === 'containment') continue
    if (highlightedNodes.has(edge.sourceId) && highlightedNodes.has(edge.targetId)) {
      result.add(edge.id)
    }
  }
  return result
}
