// The chip-toggle reducers behind the shared filter bar.
//
// Pure, and deliberately outside the component. Each reducer rebuilds only the
// Set for the axis it edits; every other axis is passed through by reference,
// which `withSelection` guarantees, so a no-op edit changes no identity and the
// view's memos have nothing to recompute.

import type { AxisId } from '../graph/axis'
import type { FilterState } from './types'
import { selectionFor, withSelection } from './types'

/** Toggle one value on one axis. */
export function toggleValue(
  filter: FilterState,
  axis: AxisId,
  value: string,
): FilterState {
  const current = selectionFor(filter, axis)
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return withSelection(filter, axis, next)
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
  axis: AxisId,
  values: readonly string[],
): FilterState {
  const current = selectionFor(filter, axis)
  const anyOn = values.some(v => current.has(v))
  const next = new Set(current)
  if (anyOn) for (const v of values) next.delete(v)
  else for (const v of values) next.add(v)
  return withSelection(filter, axis, next)
}
