import { GraphEdge } from './model';
export type HighlightDirection = 'downstream' | 'upstream';
export declare function getTransitiveDeps(nodeId: string, edges: GraphEdge[], visibleIds: Set<string>, direction: HighlightDirection): Set<string>;
export declare function getHighlightedEdgeIds(highlightedNodes: Set<string>, edges: GraphEdge[]): Set<string>;
