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
    /** e.g. `worker:paymentWorker`. nexusService / nexusOperation only. */
    worker?: string;
    /** e.g. `namespace:ecommerce`. nexusService only. */
    namespace?: string;
    /** Task queue name. Worker and nexus-tier nodes only. */
    queue?: string;
}
export type EdgeType = 'containment' | 'dependency';
export interface GraphEdge {
    id: string;
    edgeType: EdgeType;
    sourceId: string;
    targetId: string;
    sourceNodeType: NodeType;
    targetNodeType: NodeType;
    nexusEndpoint?: string;
}
export interface Graph {
    nodes: Map<string, GraphNode>;
    edges: GraphEdge[];
    duplicateGroups: Map<string, Set<string>>;
}
