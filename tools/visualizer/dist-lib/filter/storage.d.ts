export type PersistedFilter = {
    selectedFiles: string[];
    visibleTypes: string[];
};
export type PersistedPins = {
    files: boolean;
    types: boolean;
};
export type PersistedState = {
    treeFilter?: PersistedFilter;
    graphFilter?: PersistedFilter;
    treePins?: PersistedPins;
    graphPins?: PersistedPins;
    searchQuery?: string;
};
export declare function loadState(): PersistedState;
export declare function saveState(state: PersistedState): void;
