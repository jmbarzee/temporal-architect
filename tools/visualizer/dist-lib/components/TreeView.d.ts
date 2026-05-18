import { TWFFile } from '../types/ast';
import { CrossViewTarget } from './WorkflowCanvas';
import { FilterState, PinState, FilterDimension } from '../filter/types';
interface TreeViewProps {
    ast: TWFFile;
    onShowInGraph?: (name: string, defType: string) => void;
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
export declare function TreeView({ ast, onShowInGraph, filter, onFilterChange, pins, onPinsChange, searchQuery, searchActive, onSearchChange, pendingFocus, onFocusConsumed, overriddenPins, onOverriddenPinsConsumed, }: TreeViewProps): import("react/jsx-runtime").JSX.Element;
export {};
