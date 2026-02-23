// Graph data model for the force-directed graph view.
// Derived from GRAPH_VIEW.md § Graph Data Model.

export type NodeLevel = 1 | 2 | 3

export type NodeType = 'namespace' | 'worker' | 'workflow' | 'activity' | 'nexusService'

export interface GraphNode {
  id: string            // e.g. "namespace:MyNS", "worker:MyWorker", "workflow:ProcessOrder"
  level: NodeLevel
  nodeType: NodeType
  name: string
  sourceFile?: string
  parentId?: string     // containment parent (worker for L3, namespace for L2)
  orphan: boolean       // true if no parent in the hierarchy
}

export type EdgeType = 'containment' | 'dependency' | 'nexusDependency'

export interface GraphEdge {
  id: string
  edgeType: EdgeType
  sourceId: string
  targetId: string
  sourceLevel: NodeLevel
  targetLevel: NodeLevel
  // Nexus metadata (nexusDependency edges only)
  nexusEndpoint?: string
  nexusService?: string
  nexusOperation?: string
}

export interface Graph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
}

// Helpers

export function nodeId(nodeType: NodeType, name: string): string {
  return `${nodeType}:${name}`
}

export function nodeLevel(nodeType: NodeType): NodeLevel {
  switch (nodeType) {
    case 'namespace': return 1
    case 'worker': return 2
    case 'workflow':
    case 'activity':
    case 'nexusService': return 3
  }
}
