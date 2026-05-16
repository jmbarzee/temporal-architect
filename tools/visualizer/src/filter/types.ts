// Types for the shared filter model across Tree and Graph views.
//
// FilterState captures the two structural dimensions (files, types) that
// each view holds independently. The shared search query lives outside
// FilterState because it is globally shared (spec § Search Scope).
//
// PinState holds the per-view, per-dimension freeze state. When a
// dimension is pinned, the `manual` view-transition reconciler will not
// adopt the source view's value for that dimension.
//
// ViewTransition is a tagged-union expressing *why* the user switched
// views. The reconciler reads the intent and the rest of the inputs to
// produce the destination view's resulting FilterState.

export type FilterState = {
  selectedFiles: Set<string>
  visibleTypes: Set<string>
}

export type PinState = {
  files: boolean
  types: boolean
}

export type FilterDimension = 'files' | 'types'

export type ViewTransition =
  | { kind: 'manual' }
  | {
      kind: 'focus'
      target: {
        name: string
        defType: string
        sourceFile?: string
      }
    }

// Metadata returned alongside a reconciled filter. Currently only used to
// flag which pinned dimensions were overridden by a focus transition so
// the destination view can flash its pin icons.
export type ReconcileResult = {
  filter: FilterState
  overriddenPins: Set<FilterDimension>
}

// Helper: structural equality for FilterState. Two states are equal if
// both Sets contain the same elements. Used by views to avoid re-renders
// or animations when nothing materially changed.
export function filterStatesEqual(a: FilterState, b: FilterState): boolean {
  if (a.selectedFiles.size !== b.selectedFiles.size) return false
  if (a.visibleTypes.size !== b.visibleTypes.size) return false
  for (const f of a.selectedFiles) if (!b.selectedFiles.has(f)) return false
  for (const t of a.visibleTypes) if (!b.visibleTypes.has(t)) return false
  return true
}

export function cloneFilter(f: FilterState): FilterState {
  return {
    selectedFiles: new Set(f.selectedFiles),
    visibleTypes: new Set(f.visibleTypes),
  }
}
