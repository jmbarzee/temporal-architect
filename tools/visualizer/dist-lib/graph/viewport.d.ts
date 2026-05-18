import { SimNode } from './simulation';
export interface Viewport {
    x: number;
    y: number;
    scale: number;
}
export declare const DEFAULT_VIEWPORT: Viewport;
export declare function worldToScreen(vp: Viewport, wx: number, wy: number): [number, number];
export declare function screenToWorld(vp: Viewport, sx: number, sy: number): [number, number];
export declare function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport;
export declare function fitToView(nodes: SimNode[], width: number, height: number, padding?: number): Viewport;
