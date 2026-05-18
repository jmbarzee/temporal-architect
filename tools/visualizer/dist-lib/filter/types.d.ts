export type FilterState = {
    selectedFiles: Set<string>;
    visibleTypes: Set<string>;
};
export type PinState = {
    files: boolean;
    types: boolean;
};
export type FilterDimension = 'files' | 'types';
export type ViewTransition = {
    kind: 'manual';
} | {
    kind: 'focus';
    target: {
        name: string;
        defType: string;
        sourceFile?: string;
    };
};
export type ReconcileResult = {
    filter: FilterState;
    overriddenPins: Set<FilterDimension>;
};
export declare function filterStatesEqual(a: FilterState, b: FilterState): boolean;
export declare function cloneFilter(f: FilterState): FilterState;
