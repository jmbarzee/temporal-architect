// The chip-toggle reducers behind the shared filter bar.
//
// Pure, and deliberately outside the component. Each reducer rebuilds only the
// Set for the axis it edits; every other axis is passed through by reference,
// which `withSelection` guarantees. Consumers memoise on Set *identity* (see
// `useVisibleGraph`'s deps and `useSimulationLoop`'s `prev === next`
// comparisons), so preserving the untouched axes' references is load-bearing
// behaviour rather than an optimisation — a reducer that rebuilt them all would
// re-run edge graduation and reheat the layout on every unrelated edit (T5).

import type { DimensionId } from '../graph/dimension'
import type { FilterState } from './types'
import { selectionFor, withSelection } from './types'

/** Toggle one value on one axis. */
export function toggleValue(
  filter: FilterState,
  dimension: DimensionId,
  value: string,
): FilterState {
  const current = selectionFor(filter, dimension)
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return withSelection(filter, dimension, next)
}

/**
 * Toggle a group of values on one axis as a unit.
 *
 * A chip may cover several values — one covers three. "Any on" turns the whole
 * group off; otherwise the whole group goes on, so a partially-on group has a
 * single unambiguous next state.
 */
export function toggleGroup(
  filter: FilterState,
  dimension: DimensionId,
  values: readonly string[],
): FilterState {
  const current = selectionFor(filter, dimension)
  const anyOn = values.some(v => current.has(v))
  const next = new Set(current)
  if (anyOn) for (const v of values) next.delete(v)
  else for (const v of values) next.add(v)
  return withSelection(filter, dimension, next)
}
