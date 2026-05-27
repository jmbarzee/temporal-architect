export type NodeLevel = 1 | 1.5 | 2 | 3 | 4;
export type NodeType = 'namespace' | 'nexusEndpoint' | 'worker' | 'nexusService' | 'workflow' | 'nexusOperation' | 'activity';
export interface GraphNode {
    /**
     * Composite deployment id from the parser graph. Form examples:
     *   - `namespace:MyNS`
     *   - `nexusEndpoint:PaymentEndpoint/namespace:MyNS`
     *   - `worker:MyWorker/namespace:MyNS`
     *   - `workflow:ProcessOrder/worker:WorkerA/namespace:MyNS`
     *   - `nexusOperation:Svc.Op/worker:WorkerB/namespace:MyNS`
     *   - `activity:Charge/orphan`  (uninstantiated definition)
     *
     * Identity is owned by the parser — the visualizer treats `id` as an
     * opaque string and never parses it for routing decisions.
     */
    id: string;
    level: NodeLevel;
    nodeType: NodeType;
    name: string;
    /** AST source file, joined in by buildGraph via the `definitionKey` lookup. */
    sourceFile?: string;
    /** Containment parent (worker for L3, namespace for L2 and L1.5, nexusService for nexusOperation). */
    parentId?: string;
    /** True when no parent in the hierarchy (uninstantiated definition). */
    orphan: boolean;
    /**
     * Stable identifier shared across every copy of the same underlying
     * definition. An activity registered on three workers produces three
     * nodes with three distinct `id`s but a single `definitionKey`. Used
     * to look up sister copies for the duplicate-highlight interaction
     * and as the grouping key for `Graph.duplicateGroups`.
     *
     * Equals the parser's `node.definition` field — `${nodeType}:${name}`
     * (with the parent service name folded in for operations).
     */
    definitionKey: string;
    /** e.g. `worker:paymentWorker`. Empty on namespace / endpoint / orphan nodes. */
    worker?: string;
    /** e.g. `namespace:ecommerce`. Empty on namespace itself and on orphans. */
    namespace?: string;
    /** Task queue name. Empty for nodes that don't have one. */
    queue?: string;
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
    duplicateGroups: Map<string, Set<string>>;
}
/**
 * Tier number for a node type. Used for sizing, edge styling, and the
 * hierarchical Y-band layout. The numbering matches `NodeLevel`.
 */
export declare function nodeLevel(nodeType: NodeType): NodeLevel;
