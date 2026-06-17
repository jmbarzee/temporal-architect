import { ForceParams } from '../graph/simulation';
import { NodeType } from '../graph/model';
import { NodeScaleParams } from '../graph/node-types';
export type ForceSection = 'push' | 'pull' | 'gravity' | 'dynamics' | null;
interface GraphControlPanelProps {
    params: ForceParams;
    onParamChange: (patch: Partial<ForceParams>) => void;
    onAdjust: () => void;
    onGravityChange: (partial: Partial<ForceParams>) => void;
    onActiveSection: (section: ForceSection) => void;
    onActiveChargeType: (nodeType: NodeType | null) => void;
    onActiveGravityType: (nodeType: NodeType | null) => void;
    onActivePullEdge: (key: string | null) => void;
    nodeScale: NodeScaleParams;
    onNodeScaleChange: (patch: Partial<NodeScaleParams>) => void;
}
export declare function GraphControlPanel({ params, onParamChange, onAdjust, onGravityChange, onActiveSection, onActiveChargeType, onActiveGravityType, onActivePullEdge, nodeScale, onNodeScaleChange, }: GraphControlPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
