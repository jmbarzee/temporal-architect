import { TWFFile } from '../types/ast';
import { CrossViewTarget } from './WorkflowCanvas';
import { FilterState, PinState, FilterDimension } from '../filter/types';
interface GraphViewProps {
    ast: TWFFile;
    onShowInTree?: (name: string, defType: string) => void;
    filter: FilterState;
    onFilterChange: (next: FilterState) => void;
    pins: PinState;
    onPinsChange: (next: PinState) => void;
    searchQuery: string;
    searchActive: boolean;
    onSearchChange: (query: string, active: boolean) => void;
    pendingFocus: CrossViewTarget | null;
    onFocusConsumed: () => void;
    overriddenPins: Set<FilterDimension>;
    onOverriddenPinsConsumed: () => void;
}
export declare function GraphView({ ast, onShowInTree, filter, onFilterChange, pins, onPinsChange, searchQuery, searchActive, onSearchChange, pendingFocus, onFocusConsumed, overriddenPins, onOverriddenPinsConsumed, }: GraphViewProps): import("react/jsx-runtime").JSX.Element;
export {};
