import { GraphNode, GraphEdge, Graph, NodeType } from './model';
import { EdgeTypeId } from './edge-types';
export { ALL_NODE_TYPES } from './node-types';
export { CORE_RADIUS_MIN, chargeForType, coreRadiusForType, bandForType, edgeCategory, RADIAL_R_MIN, RADIAL_R_MAX, } from './forces';
export type { YBand } from './forces';
export interface SimNode extends GraphNode {
    x: number;
    y: number;
    vx: number;
    vy: number;
    pinned: boolean;
}
export interface ChargeParams {
    charge: Record<NodeType, number>;
    coreRadius: Record<NodeType, number>;
    pushMultiplier: number;
    coreRadiusMultiplier: number;
    chargeExponent: number;
}
export interface LinkParams {
    link: Record<EdgeTypeId, number>;
    dist: Record<EdgeTypeId, number>;
    pullMultiplier: number;
    distanceMultiplier: number;
    linkExponent: number;
}
export interface GravityParams {
    gravityX: number;
    gravityY: number;
    gravityBandExp: number;
    gravityDownstream: number;
    gravityTopologicalExp: number;
    gravityCenter: number;
    gravityMode: 'cartesian' | 'radial';
    bandEnabled: boolean;
    topologicalEnabled: boolean;
    bandXMin: number;
    bandXMax: number;
    band: Record<NodeType, {
        min: number;
        max: number;
    }>;
}
export interface DynamicsParams {
    alphaDecay: number;
    alphaMin: number;
    velocityDecay: number;
}
export type ForceParams = ChargeParams & LinkParams & GravityParams & DynamicsParams;
export declare const DEFAULT_PARAMS: ForceParams;
export declare class Simulation {
    nodes: SimNode[];
    edges: GraphEdge[];
    params: ForceParams;
    alpha: number;
    private reheatDecay;
    private nodeMap;
    constructor(graph: Graph, params?: Partial<ForceParams>);
    getNode(id: string): SimNode | undefined;
    tick(visibleIds?: Set<string>, downstreamScores?: Map<string, number>): void;
    reheat(alpha?: number): void;
    nudge(target?: number): void;
    isStable(): boolean;
    pinNode(id: string, x: number, y: number): void;
    unpinNode(id: string): void;
    setParams(params: Partial<ForceParams>): void;
    seedAt(id: string, x: number, y: number): void;
}
