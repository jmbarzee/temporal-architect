// The chip-toggle reducers behind the shared filter bar.
//
// Pure, and deliberately outside the component: each reducer rebuilds only the
// Set for the dimension it edits and passes the other one through by reference.
// Consumers memoize on Set *identity* (see useVisibleGraph's deps and
// useSimulationLoop's `prev === next` comparisons), so preserving the untouched
// dimension's reference is load-bearing behaviour, not an optimisation — a
// reducer that cloned both would re-run edge graduation and reheat the layout on
// every unrelated edit.

import type { FilterState } from './types'

/** Toggle one file chip. Leaves the type Set's identity untouched. */
export function toggleFileSelection(filter: FilterState, file: string): FilterState {
  const next = new Set(filter.selectedFiles)
  if (next.has(file)) next.delete(file)
  else next.add(file)
  return { ...filter, selectedFiles: next }
}

/**
 * Toggle one type chip. A chip may cover several def types — the grouped chip
 * covers three. "Any on" turns the whole group off; otherwise the whole group
 * goes on. Leaves the file Set's identity untouched.
 */
export function toggleTypeGroupSelection(
  filter: FilterState,
  types: readonly string[],
): FilterState {
  const anyOn = types.some(t => filter.visibleTypes.has(t))
  const next = new Set(filter.visibleTypes)
  if (anyOn) for (const t of types) next.delete(t)
  else for (const t of types) next.add(t)
  return { ...filter, visibleTypes: next }
}
