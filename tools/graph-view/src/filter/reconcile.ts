// reconcileFilter is the single decision point for what the destination view's
// filter looks like after a view switch. Every switch site in the host shell
// routes through it.
//
// Pure: destination filter, source filter, destination locks, the transition
// intent, and the axes' descriptors in. A new filter out, plus which pinned axes
// had to be overridden (drives the pin-flash animation).
//
// It now loops over axes instead of branching on two names, which is only safe
// because the per-axis differences are carried as descriptor policy rather than
// assumed uniform. The one that bites is `focus`: types expand
// unconditionally, files expand only when the file selection is already active.
// A loop over a shared rule would flatten that, and the flattened version hides
// the whole graph on a focus transition.

import type {
  FilterState,
  AxisLocks,
  ViewTransition,
  ReconcileResult,
  FilterDimension,
  FocusTarget,
} from './types'
import {
  filterStatesEqual,
  lockedFor,
  selectionFor,
  withSelection,
} from './types'
import type { ResolvedAxisDescriptor } from '../graph/axis'

/** What a reconciliation reads: the destination view's filter, locks and the axes it shows, the source view's filter, and the transition. */
export interface ReconcileInput {
  /** The view being switched to: its filter as it stands. */
  destination: FilterState
  /** The view being switched from. Read on a manual switch; a focus reads only the destination. */
  source: FilterState
  /** The destination's locks. */
  locks: AxisLocks
  transition: ViewTransition
  /**
   * The axes the destination view SHOWS — its chain, not every declared
   * axis: an axis the user removed from the bar is not filtering there, and
   * adopting a selection on it would revive what they reset.
   */
  axes: readonly ResolvedAxisDescriptor[]
}

export function reconcileFilter({ destination, source, locks, transition, axes }: ReconcileInput): ReconcileResult {
  switch (transition.kind) {
    case 'manual':
      return reconcileManual(destination, source, locks, axes)
    case 'focus':
      return reconcileFocus(destination, locks, transition.target, axes)
  }
}

/**
 * manual: per axis, keep the destination's selection if pinned, otherwise adopt
 * the source's. Pins are never overridden here, so there is no flash metadata.
 *
 * Built with `withSelection`, which is what makes this correct rather than
 * merely shorter. The previous version cloned the whole filter and then
 * reassigned the unpinned axes, so **every axis came back with a fresh `Set`** —
 * including pinned ones, and including axes whose content had not changed. The
 * loop then decided "did this axis change?" by `prev === next`, so any
 * manual switch that altered one axis also fired the *other* axis's change path:
 * for the type axis that meant an ancestor-seed, a reheat to 0.5, and
 * `initialFitDone = false`, i.e. the user's pan and zoom silently discarded on a
 * view switch that changed only the file selection.
 */
function reconcileManual(
  destFilter: FilterState,
  sourceFilter: FilterState,
  destPins: AxisLocks,
  dimensions: readonly ResolvedAxisDescriptor[],
): ReconcileResult {
  let next = destFilter
  for (const dim of dimensions) {
    if (lockedFor(destPins, dim.id)) continue
    next = withSelection(next, dim.id, selectionFor(sourceFilter, dim.id))
  }
  return { filter: next, overriddenLocks: new Set<FilterDimension>() }
}

/**
 * focus: expand the destination minimally so the target is visible.
 *
 * The expansion rule is per axis and comes from the descriptor:
 *
 *   'always'     — add the target's value unconditionally. Safe on an
 *                  `emptyMeans: 'none'` axis, where the selection is an
 *                  allow-list and adding to it only ever widens.
 *   'whenActive' — add it only if a selection already exists. On an
 *                  `emptyMeans: 'all'` axis an empty selection means everything
 *                  is already visible, so adding the first value would *narrow*
 *                  to that one value and hide the rest — the opposite of focus.
 *
 * Pins are not modified, but each axis whose pin had to be overridden is
 * recorded so the destination view can flash it.
 */
function reconcileFocus(
  destFilter: FilterState,
  destPins: AxisLocks,
  target: FocusTarget,
  dimensions: readonly ResolvedAxisDescriptor[],
): ReconcileResult {
  let next = destFilter
  const overridden = new Set<FilterDimension>()

  for (const dim of dimensions) {
    const value = target.values[dim.id]
    if (value === undefined) continue

    const current = selectionFor(destFilter, dim.id)
    if (current.has(value)) continue
    if (dim.focus === 'whenActive' && current.size === 0) continue

    next = withSelection(next, dim.id, new Set([...current, value]))
    if (lockedFor(destPins, dim.id)) overridden.add(dim.id)
  }

  return {
    filter: filterStatesEqual(next, destFilter) ? destFilter : next,
    overriddenLocks: overridden,
  }
}
