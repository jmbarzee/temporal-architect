export type NodeLevel = 1 | 2 | 3 | 4;
export type NodeType = 'namespace' | 'worker' | 'workflow' | 'activity' | 'nexusService' | 'nexusOperation';
export interface GraphNode {
    id: string;
    level: NodeLevel;
    nodeType: NodeType;
    name: string;
    sourceFile?: string;
    parentId?: string;
    orphan: boolean;
}
export type EdgeType = 'containment' | 'dependency';
export interface GraphEdge {
    id: string;
    edgeType: EdgeType;
    sourceId: string;
    targetId: string;
    sourceLevel: NodeLevel;
    targetLevel: NodeLevel;
    sourceNodeType: NodeType;
    targetNodeType: NodeType;
    nexusEndpoint?: string;
}
export interface Graph {
    nodes: Map<string, GraphNode>;
    edges: GraphEdge[];
}
export declare function nodeId(nodeType: NodeType, name: string): string;
export declare function nodeLevel(nodeType: NodeType): NodeLevel;
