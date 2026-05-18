import { GraphNode, GraphEdge, Graph, NodeType } from './model';
export interface SimNode extends GraphNode {
    x: number;
    y: number;
    vx: number;
    vy: number;
    pinned: boolean;
}
export interface ForceParams {
    chargeNamespace: number;
    chargeWorker: number;
    chargeWorkflow: number;
    chargeActivity: number;
    chargeNexusService: number;
    chargeNexusOperation: number;
    linkNsToWorker: number;
    linkWorkerToWorkflow: number;
    linkWorkerToActivity: number;
    linkWorkerToNexus: number;
    linkNexusToOperation: number;
    linkNsToNs: number;
    linkWorkerToWorker: number;
    linkWorkflowToWorkflow: number;
    linkWorkflowToActivity: number;
    linkActivityToActivity: number;
    distNsToWorker: number;
    distWorkerToWorkflow: number;
    distWorkerToActivity: number;
    distWorkerToNexus: number;
    distNexusToOperation: number;
    distNsToNs: number;
    distWorkerToWorker: number;
    distWorkflowToWorkflow: number;
    distWorkflowToActivity: number;
    distActivityToActivity: number;
    gravityX: number;
    gravityY: number;
    bandXMin: number;
    bandXMax: number;
    bandYMinNamespace: number;
    bandYMaxNamespace: number;
    bandYMinWorker: number;
    bandYMaxWorker: number;
    bandYMinWorkflow: number;
    bandYMaxWorkflow: number;
    bandYMinActivity: number;
    bandYMaxActivity: number;
    bandYMinNexusService: number;
    bandYMaxNexusService: number;
    bandYMinNexusOperation: number;
    bandYMaxNexusOperation: number;
    alphaDecay: number;
    alphaMin: number;
    velocityDecay: number;
    chargeSoftening: number;
    pushMultiplier: number;
    pullMultiplier: number;
    distanceMultiplier: number;
    chargeExponent: number;
    linkExponent: number;
}
export declare const DEFAULT_PARAMS: ForceParams;
export declare function chargeForType(params: ForceParams, nodeType: NodeType): number;
export interface YBand {
    yMin: number;
    yMax: number;
}
export declare function bandForType(params: ForceParams, nodeType: NodeType): YBand;
export declare const ALL_NODE_TYPES: NodeType[];
interface EdgeCategory {
    strength: number;
    distance: number;
}
export declare function edgeCategory(params: ForceParams, edge: GraphEdge): EdgeCategory;
export declare class Simulation {
    nodes: SimNode[];
    edges: GraphEdge[];
    params: ForceParams;
    alpha: number;
    private nodeMap;
    constructor(graph: Graph, params?: Partial<ForceParams>);
    getNode(id: string): SimNode | undefined;
    tick(visibleIds?: Set<string>): void;
    reheat(alpha?: number): void;
    isStable(): boolean;
    pinNode(id: string, x: number, y: number): void;
    unpinNode(id: string): void;
    setParams(params: Partial<ForceParams>): void;
    seedAt(id: string, x: number, y: number): void;
}
export {};
