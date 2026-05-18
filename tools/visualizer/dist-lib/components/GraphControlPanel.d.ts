import { ForceParams } from '../graph/simulation';
import { NodeType } from '../graph/model';
export type ForceSection = 'push' | 'pull' | 'gravity' | 'dynamics' | null;
interface GraphControlPanelProps {
    params: ForceParams;
    onParamChange: (key: keyof ForceParams, value: number) => void;
    running: boolean;
    onToggleRunning: () => void;
    onReheat: () => void;
    showForceFields: boolean;
    onToggleForceFields: () => void;
    onActiveSection: (section: ForceSection) => void;
    onActiveChargeType: (nodeType: NodeType | null) => void;
    onActiveGravityType: (nodeType: NodeType | null) => void;
}
export declare function GraphControlPanel({ params, onParamChange, running, onToggleRunning, onReheat, showForceFields, onToggleForceFields, onActiveSection, onActiveChargeType, onActiveGravityType, }: GraphControlPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
